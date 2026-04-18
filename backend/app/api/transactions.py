"""Transactions API: manual entry, CSV import/export, list, delete."""

import csv
import io
from typing import Any, Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from app.api.exceptions import ResourceNotFound
from app.db.models import Transaction
from app.dependencies import DB, CurrentUser
from app.services.audit import log_audit_event
from app.services.categorizer import categorize_single
from app.services.consent import has_active_consent

VALID_PAYMENT_MODES = {"cash", "upi", "card", "net_banking"}
VALID_FREQUENCIES = {"once", "weekly", "monthly", "quarterly", "yearly"}

router = APIRouter()


async def _require_statement_import_consent(db: DB, user_id: str) -> None:
    allowed = await has_active_consent(
        db,
        user_id=user_id,
        consent_type="statement_import",
        scope="transactions",
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Explicit consent is required for statement imports",
        )


# ── Schemas ───────────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    merchant: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0, le=100_000_000)
    category: Optional[str] = Field(None, max_length=128)
    notes: Optional[str] = Field(None, max_length=1000)
    receipt_id: Optional[str] = Field(None, min_length=36, max_length=36)
    payment_mode: Optional[str] = None
    tags: Optional[list[str]] = Field(None, max_length=20)
    is_recurring: bool = False
    recurrence_frequency: Optional[str] = None

    @field_validator("merchant")
    @classmethod
    def strip_merchant(cls, v: str) -> str:
        return v.strip()

    @field_validator("payment_mode")
    @classmethod
    def valid_payment_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PAYMENT_MODES:
            raise ValueError(f"payment_mode must be one of: {', '.join(VALID_PAYMENT_MODES)}")
        return v

    @field_validator("recurrence_frequency")
    @classmethod
    def valid_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_FREQUENCIES:
            raise ValueError(f"recurrence_frequency must be one of: {', '.join(VALID_FREQUENCIES)}")
        return v


class TransactionOut(BaseModel):
    id: str
    date: str
    merchant: str
    amount: float
    category: Optional[str]
    category_confidence: Optional[float]
    payment_mode: Optional[str] = None
    tags: Optional[list] = None
    is_recurring: bool = False
    recurrence_frequency: Optional[str] = None
    source: str
    receipt_id: Optional[str]
    notes: Optional[str]
    created_at: Any

    class Config:
        from_attributes = True


class TransactionListResponse(BaseModel):
    items: list[TransactionOut]
    total: int
    offset: int
    limit: int


class CSVImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: TransactionCreate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> TransactionOut:
    """Create a manual transaction. Auto-categorizes if category not provided."""
    category = body.category
    confidence = None

    if not category:
        result = await categorize_single(body.merchant, body.notes or "")
        category = result.get("category")
        confidence = result.get("confidence")

    txn = Transaction(
        user_id=current_user.id,
        date=body.date,
        merchant=body.merchant,
        amount=body.amount,
        category=category,
        category_confidence=confidence,
        source="manual",
        receipt_id=body.receipt_id,
        notes=body.notes,
        payment_mode=body.payment_mode,
        tags=body.tags or [],
        is_recurring=body.is_recurring,
        recurrence_frequency=body.recurrence_frequency if body.is_recurring else None,
    )
    db.add(txn)
    await db.flush()
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="transaction.created",
        resource_type="transaction",
        resource_id=txn.id,
        metadata={
            "source": txn.source,
            "category": txn.category,
        },
        request=request,
    )
    return TransactionOut.model_validate(txn)


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    current_user: CurrentUser,
    db: DB,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> TransactionListResponse:
    """List transactions with pagination and optional filters."""
    query = select(Transaction).where(Transaction.user_id == current_user.id)

    if category:
        query = query.where(Transaction.category == category)
    if date_from:
        query = query.where(Transaction.date >= date_from)
    if date_to:
        query = query.where(Transaction.date <= date_to)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = query.order_by(Transaction.date.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    items = [TransactionOut.model_validate(t) for t in result.scalars().all()]

    return TransactionListResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


class TransactionUpdate(BaseModel):
    date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    merchant: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[float] = Field(None, gt=0, le=100_000_000)
    category: Optional[str] = Field(None, max_length=128)
    notes: Optional[str] = Field(None, max_length=1000)
    payment_mode: Optional[str] = None
    tags: Optional[list[str]] = Field(None, max_length=20)
    is_recurring: Optional[bool] = None
    recurrence_frequency: Optional[str] = None

    @field_validator("payment_mode")
    @classmethod
    def valid_payment_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PAYMENT_MODES:
            raise ValueError(f"payment_mode must be one of: {', '.join(VALID_PAYMENT_MODES)}")
        return v

    @field_validator("recurrence_frequency")
    @classmethod
    def valid_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_FREQUENCIES:
            raise ValueError(f"recurrence_frequency must be one of: {', '.join(VALID_FREQUENCIES)}")
        return v


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    transaction_id: str, body: TransactionUpdate, request: Request, current_user: CurrentUser, db: DB
) -> TransactionOut:
    result = await db.execute(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise ResourceNotFound("Transaction")

    for field in body.model_fields_set:
        setattr(txn, field, getattr(body, field))
    await db.flush()
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="transaction.updated",
        resource_type="transaction",
        resource_id=txn.id,
        metadata={
            "updated_fields": list(body.model_fields_set),
        },
        request=request,
    )
    return TransactionOut.model_validate(txn)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(transaction_id: str, request: Request, current_user: CurrentUser, db: DB) -> None:
    query = select(Transaction).where(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id,
    )
    result = await db.execute(query)
    txn = result.scalar_one_or_none()
    if not txn:
        raise ResourceNotFound("Transaction")
    await db.delete(txn)
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="transaction.deleted",
        resource_type="transaction",
        resource_id=transaction_id,
        metadata={
            "source": txn.source,
        },
        request=request,
    )


@router.get("/export")
async def export_csv(
    current_user: CurrentUser,
    db: DB,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> StreamingResponse:
    """Export transactions as a downloadable CSV file."""
    query = select(Transaction).where(Transaction.user_id == current_user.id)
    if category:
        query = query.where(Transaction.category == category)
    if date_from:
        query = query.where(Transaction.date >= date_from)
    if date_to:
        query = query.where(Transaction.date <= date_to)
    query = query.order_by(Transaction.date.desc())

    result = await db.execute(query)
    rows = result.scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    header_row = [
        "date",
        "merchant",
        "amount",
        "category",
        "payment_mode",
        "tags",
        "is_recurring",
        "source",
        "notes",
    ]
    writer.writerow(header_row)

    for t in rows:
        tags_str = ",".join(t.tags) if t.tags else ""
        row_values = [
            t.date,
            t.merchant,
            t.amount,
            t.category or "",
            t.payment_mode or "",
            tags_str,
            t.is_recurring,
            t.source,
            t.notes or "",
        ]
        writer.writerow(row_values)

    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=transactions.csv",
        },
    )


@router.post("/import", response_model=CSVImportResponse)
async def import_csv(
    request: Request,
    current_user: CurrentUser,
    db: DB,
    file: UploadFile = File(...),
) -> CSVImportResponse:
    """Import transactions from CSV. Expected columns: date, merchant, amount, category (optional).
    All rows are imported atomically — if any row fails, no rows are committed."""
    if file.content_type not in ("text/csv", "application/vnd.ms-excel", "text/plain"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File must be CSV")

    await _require_statement_import_consent(db, current_user.id)

    raw = await file.read()
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    skipped = 0
    errors: list[str] = []

    # Use a savepoint so partial failures can roll back without losing the outer session
    async with db.begin_nested():
        for i, row in enumerate(reader, start=2):
            try:
                date = row.get("date", "").strip()
                merchant = row.get("merchant", "").strip()
                amount_str = row.get("amount", "").replace(",", "")
                category = row.get("category", "").strip() or None

                if not date or not merchant or not amount_str:
                    errors.append(f"Row {i}: missing required field (date/merchant/amount)")
                    skipped += 1
                    continue

                amount = float(amount_str)

                if not category:
                    cat_result = await categorize_single(merchant, "")
                    category = cat_result.get("category")

                txn = Transaction(
                    user_id=current_user.id,
                    date=date,
                    merchant=merchant,
                    amount=amount,
                    category=category,
                    source="csv",
                )
                db.add(txn)
                imported += 1
            except Exception as e:
                errors.append(f"Row {i}: {e}")
                skipped += 1

        await db.flush()

    await log_audit_event(
        db,
        user_id=current_user.id,
        action="transactions.import_csv",
        resource_type="transaction",
        metadata={
            "imported": imported,
            "skipped": skipped,
        },
        request=request,
    )

    return CSVImportResponse(
        imported=imported,
        skipped=skipped,
        errors=errors[:20],
    )
