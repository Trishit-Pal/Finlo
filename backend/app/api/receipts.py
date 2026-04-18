"""Receipts API: upload, OCR, duplicate detection, confirm edits, list."""

import hashlib
import json
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, select

from app.api.exceptions import FileTooLarge, ResourceNotFound, UnsupportedFileType
from app.config import get_settings
from app.db.models import Receipt, Transaction
from app.dependencies import DB, CurrentUser
from app.services.audit import log_audit_event
from app.services.categorizer import categorize_items
from app.services.coach import generate_suggestions
from app.services.ocr_adapter import ClientOCRAdapter, ServerOCRAdapter
from app.services.parser import parse_receipt_with_llm_fallback
from app.services.storage import StorageService

settings = get_settings()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
storage = StorageService()


class ParsedItem(BaseModel):
    name: str
    price: Optional[float] = None
    quantity: Optional[float] = None
    category: Optional[str] = None
    confidence: Optional[float] = None


class ParsedReceipt(BaseModel):
    merchant: Optional[str] = None
    date: Optional[str] = None
    due_date: Optional[str] = None
    total: Optional[float] = None
    tax: Optional[float] = None
    currency: str = "USD"
    category_suggestion: Optional[str] = None
    recurring_indicator: bool = False
    account_suffix: Optional[str] = None
    parser_provider: Optional[str] = None
    items: list[ParsedItem] = []
    field_confidence: dict[str, float] = {}


class UploadResponse(BaseModel):
    receipt_id: str
    parsed: ParsedReceipt
    ocr_confidence: Optional[float] = None
    status: str = "pending"
    duplicate_detected: bool = False
    duplicate_of_receipt_id: Optional[str] = None
    duplicate_confidence: Optional[float] = None


class ConfirmRequest(BaseModel):
    receipt_id: str
    edits: dict[str, Any] = {}


class CoachAction(BaseModel):
    text: str
    weekly_savings: Optional[float] = None
    rationale: Optional[str] = None
    source_receipts: list[str] = []


class CoachOutput(BaseModel):
    summary: str
    actions: list[CoachAction]
    estimated_savings: Optional[float] = None
    confidence: Optional[float] = None


class ConfirmResponse(BaseModel):
    receipt_id: str
    categories: list[str]
    coach: Optional[CoachOutput] = None


class ReceiptOut(BaseModel):
    id: str
    merchant: Optional[str]
    date: Optional[str]
    due_date: Optional[str]
    total: Optional[float]
    tax: Optional[float]
    currency: str
    items: Optional[list]
    ocr_confidence: Optional[float]
    source_hash: Optional[str]
    duplicate_of_receipt_id: Optional[str]
    duplicate_confidence: Optional[float]
    category_suggestion: Optional[str]
    recurring_indicator: bool
    account_suffix: Optional[str]
    parser_provider: Optional[str]
    source: str
    status: str
    created_at: Any

    class Config:
        from_attributes = True


class ReceiptListResponse(BaseModel):
    items: list[ReceiptOut]


def _compute_source_hash(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


async def _detect_duplicate_receipt(
    db: DB,
    *,
    user_id: str,
    source_hash: str,
    parsed: Any,
) -> tuple[Optional[str], Optional[float]]:
    exact_result = await db.execute(
        select(Receipt)
        .where(Receipt.user_id == user_id, Receipt.source_hash == source_hash)
        .order_by(Receipt.created_at.desc())
        .limit(1)
    )
    exact = exact_result.scalar_one_or_none()
    if exact:
        return exact.id, 1.0

    if not parsed.total or not parsed.date:
        return None, None

    heuristic_query = select(Receipt).where(
        Receipt.user_id == user_id,
        Receipt.total == parsed.total,
        Receipt.date == parsed.date,
    )
    if parsed.merchant:
        heuristic_query = heuristic_query.where(func.lower(Receipt.merchant) == parsed.merchant.lower())
    heuristic_query = heuristic_query.order_by(Receipt.created_at.desc()).limit(1)
    heuristic_result = await db.execute(heuristic_query)
    heuristic = heuristic_result.scalar_one_or_none()
    if heuristic:
        return heuristic.id, 0.92
    return None, None


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def upload_receipt(
    request: Request,
    current_user: CurrentUser,
    db: DB,
    file: Optional[UploadFile] = File(None),
    client_side_ocr: bool = Form(False),
    parsed_json: Optional[str] = Form(None),
    store_raw_image: bool = Form(False),
) -> UploadResponse:
    """Upload a receipt image/PDF or submit client-side OCR result."""
    raw_image_url: Optional[str] = None
    source_hash: Optional[str] = None
    raw_ocr_text: Optional[str] = None

    if client_side_ocr and parsed_json:
        source_hash = _compute_source_hash(parsed_json.encode("utf-8"))
        client_data = json.loads(parsed_json)
        adapter = ClientOCRAdapter()
        ocr_result = adapter.parse(client_data)
        parsed = await parse_receipt_with_llm_fallback(ocr_result.lines, ocr_result.confidence)
        ocr_confidence = ocr_result.confidence
        raw_ocr_text = ocr_result.raw_text
    elif file is not None:
        content_type = file.content_type or ""
        if content_type not in settings.allowed_upload_types:
            raise UnsupportedFileType(content_type)

        raw_bytes = await file.read()
        if len(raw_bytes) > settings.max_upload_bytes:
            raise FileTooLarge(settings.MAX_UPLOAD_SIZE_MB)
        source_hash = _compute_source_hash(raw_bytes)

        user_wants_storage = store_raw_image or (current_user.settings or {}).get("store_raw_images", False)
        if user_wants_storage:
            import os

            safe_filename = os.path.basename(file.filename or "upload").replace("..", "")
            raw_image_url = await storage.upload_encrypted(
                data=raw_bytes,
                key=f"{current_user.id}/{safe_filename}",
                content_type=content_type,
            )

        adapter = ServerOCRAdapter()
        ocr_result = adapter.parse_bytes(raw_bytes, content_type)
        parsed = await parse_receipt_with_llm_fallback(ocr_result.lines, ocr_result.confidence)
        ocr_confidence = ocr_result.confidence
        raw_ocr_text = ocr_result.raw_text
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either a file or client_side_ocr=true with parsed_json",
        )

    if parsed.items:
        parsed.items = await categorize_items(parsed.items, current_user.id)
    if not parsed.category_suggestion and parsed.items:
        parsed.category_suggestion = parsed.items[0].category

    duplicate_of_receipt_id = None
    duplicate_confidence = None
    if source_hash:
        duplicate_of_receipt_id, duplicate_confidence = await _detect_duplicate_receipt(
            db,
            user_id=current_user.id,
            source_hash=source_hash,
            parsed=parsed,
        )

    receipt = Receipt(
        user_id=current_user.id,
        merchant=parsed.merchant,
        date=parsed.date,
        due_date=parsed.due_date,
        total=parsed.total,
        tax=parsed.tax,
        currency=parsed.currency,
        items=[item.model_dump() for item in parsed.items],
        category_suggestion=parsed.category_suggestion,
        recurring_indicator=parsed.recurring_indicator,
        account_suffix=parsed.account_suffix,
        parser_provider=parsed.parser_provider,
        source_hash=source_hash,
        duplicate_of_receipt_id=duplicate_of_receipt_id,
        duplicate_confidence=duplicate_confidence,
        ocr_confidence=ocr_confidence,
        raw_image_url=raw_image_url,
        raw_ocr_text=raw_ocr_text,
        field_confidence=parsed.field_confidence,
        status="pending",
    )
    db.add(receipt)
    await db.flush()

    await log_audit_event(
        db,
        user_id=current_user.id,
        action="receipt.uploaded",
        resource_type="receipt",
        resource_id=receipt.id,
        metadata={
            "content_source": "client_ocr" if client_side_ocr else "server_ocr",
            "duplicate_detected": duplicate_of_receipt_id is not None,
            "parser_provider": parsed.parser_provider,
        },
        request=request,
    )

    parsed_payload = (
        ParsedReceipt.model_validate(parsed.model_dump())
        if hasattr(parsed, "model_dump")
        else ParsedReceipt.model_validate(parsed)
    )

    return UploadResponse(
        receipt_id=receipt.id,
        parsed=parsed_payload,
        ocr_confidence=ocr_confidence,
        status=receipt.status,
        duplicate_detected=duplicate_of_receipt_id is not None,
        duplicate_of_receipt_id=duplicate_of_receipt_id,
        duplicate_confidence=duplicate_confidence,
    )


@router.post("/confirm", response_model=ConfirmResponse)
async def confirm_receipt(body: ConfirmRequest, request: Request, current_user: CurrentUser, db: DB) -> ConfirmResponse:
    """Apply user edits, reclassify, generate coach suggestions, and create transaction once."""
    result = await db.execute(select(Receipt).where(Receipt.id == body.receipt_id, Receipt.user_id == current_user.id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise ResourceNotFound("Receipt")

    edits = body.edits
    for field in (
        "merchant",
        "date",
        "due_date",
        "total",
        "tax",
        "currency",
        "category_suggestion",
        "recurring_indicator",
        "account_suffix",
    ):
        if field in edits:
            setattr(receipt, field, edits[field])
    if "items" in edits:
        receipt.items = edits["items"]

    receipt.status = "confirmed"
    db.add(receipt)
    await db.flush()

    existing_txn_result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == current_user.id, Transaction.receipt_id == receipt.id)
        .limit(1)
    )
    existing_txn = existing_txn_result.scalar_one_or_none()

    if existing_txn is None and receipt.total and receipt.merchant:
        notes_parts: list[str] = []
        if receipt.account_suffix:
            notes_parts.append(f"acct ****{receipt.account_suffix}")
        if receipt.recurring_indicator:
            notes_parts.append("recurring")
        if receipt.due_date:
            notes_parts.append(f"due {receipt.due_date}")

        txn = Transaction(
            user_id=current_user.id,
            date=receipt.date or "",
            merchant=receipt.merchant or "",
            amount=receipt.total,
            category=receipt.category_suggestion or (receipt.items[0].get("category") if receipt.items else None),
            source="receipt",
            receipt_id=receipt.id,
            notes=("; ".join(notes_parts) or None),
        )
        db.add(txn)
        await db.flush()

    categories = list({item.get("category", "Uncategorized") for item in (receipt.items or []) if item.get("category")})

    coach_output = None
    try:
        coach_output = await generate_suggestions(current_user, receipt, db)
    except Exception:
        coach_output = None

    coach_response = None
    if coach_output:
        coach_response = CoachOutput(
            summary=coach_output.get("summary", ""),
            actions=[CoachAction(**a) for a in coach_output.get("actions", [])],
            estimated_savings=coach_output.get("estimated_savings"),
            confidence=coach_output.get("confidence"),
        )

    await log_audit_event(
        db,
        user_id=current_user.id,
        action="receipt.confirmed",
        resource_type="receipt",
        resource_id=receipt.id,
        metadata={
            "transaction_created": existing_txn is None,
            "duplicate_of": receipt.duplicate_of_receipt_id,
        },
        request=request,
    )

    return ConfirmResponse(
        receipt_id=receipt.id,
        categories=categories,
        coach=coach_response,
    )


@router.get("/receipts", response_model=ReceiptListResponse)
async def list_receipts(current_user: CurrentUser, db: DB, limit: int = 20, offset: int = 0) -> ReceiptListResponse:
    query = (
        select(Receipt)
        .where(Receipt.user_id == current_user.id)
        .order_by(Receipt.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    return ReceiptListResponse(
        items=[ReceiptOut.model_validate(r) for r in result.scalars().all()]
    )


@router.get("/receipts/{receipt_id}", response_model=ReceiptOut)
async def get_receipt(receipt_id: str, current_user: CurrentUser, db: DB) -> ReceiptOut:
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id, Receipt.user_id == current_user.id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise ResourceNotFound("Receipt")
    return ReceiptOut.model_validate(receipt)


@router.delete("/receipts/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receipt(receipt_id: str, request: Request, current_user: CurrentUser, db: DB) -> None:
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id, Receipt.user_id == current_user.id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise ResourceNotFound("Receipt")
    if receipt.raw_image_url:
        try:
            key = receipt.raw_image_url.split(f"/{settings.STORAGE_BUCKET}/", 1)[-1]
            await storage.delete(key)
        except Exception:
            pass
    await db.delete(receipt)
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="receipt.deleted",
        resource_type="receipt",
        resource_id=receipt_id,
        metadata={
            "had_raw_image": bool(receipt.raw_image_url),
        },
        request=request,
    )

