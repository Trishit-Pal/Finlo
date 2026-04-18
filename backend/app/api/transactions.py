"""Transactions API: manual entry, CSV import/export, list, delete."""

import csv
import io
from typing import Any, Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, select

from app.api.exceptions import ResourceNotFound
from app.db.models import (
    Account,
    Budget,
    ImportBatch,
    Notification,
    Receipt,
    Transaction,
)
from app.dependencies import DB, CurrentUser
from app.services.audit import log_audit_event
from app.services.categorizer import categorize_single
from app.services.consent import has_active_consent

_limiter = Limiter(key_func=get_remote_address)

VALID_PAYMENT_MODES = {"cash", "upi", "card", "net_banking"}
VALID_FREQUENCIES = {"once", "weekly", "monthly", "quarterly", "yearly"}
VALID_TYPES = {"income", "expense", "transfer"}
VALID_DIRECTIONS = {"debit", "credit"}

router = APIRouter()


async def _adjust_account_balance(
    db: DB,
    txn: Transaction,
    *,
    reverse: bool = False,
) -> None:
    """Adjust Account.current_balance based on transaction type/direction.

    When *reverse* is True the effect is undone (used on update/delete).
    """
    sign = -1 if reverse else 1

    if txn.account_id:
        acct = (
            await db.execute(select(Account).where(Account.id == txn.account_id))
        ).scalar_one_or_none()
        if acct:
            if txn.type == "income":
                acct.current_balance += sign * txn.amount
            elif txn.type == "expense":
                acct.current_balance -= sign * txn.amount
            elif txn.type == "transfer":
                acct.current_balance -= sign * txn.amount
            db.add(acct)

    if txn.type == "transfer" and txn.transfer_to_account_id:
        dest = (
            await db.execute(
                select(Account).where(Account.id == txn.transfer_to_account_id)
            )
        ).scalar_one_or_none()
        if dest:
            dest.current_balance += sign * txn.amount
            db.add(dest)


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
    type: str = Field("expense", description="income/expense/transfer")
    category: Optional[str] = Field(None, max_length=128)
    category_id: Optional[str] = Field(None, min_length=36, max_length=36)
    notes: Optional[str] = Field(None, max_length=1000)
    receipt_id: Optional[str] = Field(None, min_length=36, max_length=36)
    account_id: Optional[str] = Field(None, min_length=36, max_length=36)
    transfer_to_account_id: Optional[str] = Field(None, min_length=36, max_length=36)
    transfer_direction: Optional[str] = Field(None, description="debit/credit")
    payment_mode: Optional[str] = None
    tags: Optional[list[str]] = Field(None, max_length=20)
    is_recurring: bool = False
    recurrence_frequency: Optional[str] = None

    @field_validator("merchant")
    @classmethod
    def strip_merchant(cls, v: str) -> str:
        return v.strip()

    @field_validator("type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in VALID_TYPES:
            raise ValueError(f"type must be one of: {', '.join(VALID_TYPES)}")
        return v

    @field_validator("transfer_direction")
    @classmethod
    def valid_direction(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_DIRECTIONS:
            raise ValueError("transfer_direction must be debit or credit")
        return v

    @field_validator("payment_mode")
    @classmethod
    def valid_payment_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PAYMENT_MODES:
            raise ValueError(
                f"payment_mode must be one of: {', '.join(VALID_PAYMENT_MODES)}"
            )
        return v

    @field_validator("recurrence_frequency")
    @classmethod
    def valid_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_FREQUENCIES:
            raise ValueError(
                f"recurrence_frequency must be one of: {', '.join(VALID_FREQUENCIES)}"
            )
        return v


class TransactionOut(BaseModel):
    id: str
    date: str
    merchant: str
    amount: float
    type: str = "expense"
    category: Optional[str]
    category_confidence: Optional[float]
    payment_mode: Optional[str] = None
    tags: Optional[list] = None
    is_recurring: bool = False
    recurrence_frequency: Optional[str] = None
    source: str
    receipt_id: Optional[str]
    account_id: Optional[str] = None
    transfer_to_account_id: Optional[str] = None
    transfer_direction: Optional[str] = None
    import_batch_id: Optional[str] = None
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
    batch_id: str
    imported: int
    skipped: int
    duplicates: int
    errors: list[str]


# ── Budget alert helper ───────────────────────────────────────────────────────


async def _maybe_fire_budget_alert(db: DB, txn: Transaction) -> None:
    """Create a budget_alert notification if spend crosses soft/hard threshold.

    Uses the dedup index on (user_id, type, resource_id) so at most one alert
    per budget per day is created.
    """
    from datetime import date

    from app.utils.dates import month_date_range

    today = date.today()
    budget_result = await db.execute(
        select(Budget).where(
            Budget.user_id == txn.user_id,
            Budget.category == txn.category,
            Budget.month == today.month,
            Budget.year == today.year,
        )
    )
    budget = budget_result.scalar_one_or_none()
    if not budget or budget.limit_amount <= 0:
        return

    d_start, d_end = month_date_range(today.year, today.month)
    spent_result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0.0)).where(
            Transaction.user_id == txn.user_id,
            Transaction.category == txn.category,
            Transaction.type == "expense",
            Transaction.date >= d_start,
            Transaction.date < d_end,
        )
    )
    spent = float(spent_result.scalar_one())
    ratio = spent / budget.limit_amount

    if ratio < budget.soft_alert:
        return

    alert_level = "hard" if ratio >= budget.hard_alert else "soft"
    pct = round(ratio * 100, 1)
    resource_id = f"{budget.id}:{alert_level}"

    # Dedup: skip if an identical alert already exists (same budget + level)
    existing = await db.execute(
        select(Notification).where(
            Notification.user_id == txn.user_id,
            Notification.type == "budget_alert",
            Notification.resource_id == resource_id,
        )
    )
    if existing.scalar_one_or_none():
        return

    db.add(
        Notification(
            user_id=txn.user_id,
            type="budget_alert",
            title=f"Budget alert: {txn.category}",
            message=(
                f"You have used {pct}% of your {txn.category} budget "
                f"(₹{round(spent, 2)} of ₹{budget.limit_amount})."
            ),
            resource_type="budget",
            resource_id=resource_id,
        )
    )
    await db.flush()


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: TransactionCreate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> TransactionOut:
    """Create a manual transaction. Auto-categorizes if category not provided."""
    if body.receipt_id:
        receipt_result = await db.execute(
            select(Receipt).where(
                Receipt.id == body.receipt_id,
                Receipt.user_id == current_user.id,
            )
        )
        if not receipt_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Receipt not found or does not belong to you",
            )

    if body.account_id:
        acct_result = await db.execute(
            select(Account).where(
                Account.id == body.account_id, Account.user_id == current_user.id
            )
        )
        if not acct_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Account not found"
            )

    category = body.category
    confidence = None

    if not category and body.type != "transfer":
        result = await categorize_single(body.merchant, body.notes or "")
        category = result.get("category")
        confidence = result.get("confidence")

    if body.type == "transfer":
        category = "Transfer"

    txn = Transaction(
        user_id=current_user.id,
        date=body.date,
        merchant=body.merchant,
        amount=body.amount,
        type=body.type,
        category=category,
        category_id=body.category_id,
        category_confidence=confidence,
        source="manual",
        receipt_id=body.receipt_id,
        account_id=body.account_id,
        transfer_to_account_id=body.transfer_to_account_id
        if body.type == "transfer"
        else None,
        transfer_direction=body.transfer_direction if body.type == "transfer" else None,
        notes=body.notes,
        payment_mode=body.payment_mode,
        tags=body.tags or [],
        is_recurring=body.is_recurring,
        recurrence_frequency=body.recurrence_frequency if body.is_recurring else None,
    )
    db.add(txn)
    await db.flush()
    await _adjust_account_balance(db, txn)
    await db.flush()
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="transaction.created",
        resource_type="transaction",
        resource_id=txn.id,
        metadata={
            "source": txn.source,
            "type": txn.type,
            "category": txn.category,
        },
        request=request,
    )
    from app.services.cache import invalidate_user_cache

    await invalidate_user_cache(current_user.id)

    # Fire budget alert notification if this expense crosses a threshold
    if txn.type == "expense" and txn.category:
        await _maybe_fire_budget_alert(db, txn)

    return TransactionOut.model_validate(txn)


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    current_user: CurrentUser,
    db: DB,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    type: Optional[str] = None,
    account_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> TransactionListResponse:
    """List transactions with pagination and optional filters."""
    query = select(Transaction).where(Transaction.user_id == current_user.id)

    if category:
        query = query.where(Transaction.category == category)
    if type:
        query = query.where(Transaction.type == type)
    if account_id:
        query = query.where(Transaction.account_id == account_id)
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Transaction.merchant.ilike(search_term))
            | (Transaction.notes.ilike(search_term))
        )
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
            raise ValueError(
                f"payment_mode must be one of: {', '.join(VALID_PAYMENT_MODES)}"
            )
        return v

    @field_validator("recurrence_frequency")
    @classmethod
    def valid_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_FREQUENCIES:
            raise ValueError(
                f"recurrence_frequency must be one of: {', '.join(VALID_FREQUENCIES)}"
            )
        return v


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    transaction_id: str,
    body: TransactionUpdate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> TransactionOut:
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise ResourceNotFound("Transaction")

    balance_fields = {"amount", "type", "account_id", "transfer_to_account_id"}
    needs_rebalance = bool(body.model_fields_set & balance_fields)

    if needs_rebalance:
        await _adjust_account_balance(db, txn, reverse=True)

    for field in body.model_fields_set:
        setattr(txn, field, getattr(body, field))
    await db.flush()

    if needs_rebalance:
        await _adjust_account_balance(db, txn)
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
    from app.services.cache import invalidate_user_cache

    await invalidate_user_cache(current_user.id)
    return TransactionOut.model_validate(txn)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: str, request: Request, current_user: CurrentUser, db: DB
) -> None:
    query = select(Transaction).where(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id,
    )
    result = await db.execute(query)
    txn = result.scalar_one_or_none()
    if not txn:
        raise ResourceNotFound("Transaction")
    await _adjust_account_balance(db, txn, reverse=True)
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
    from app.services.cache import invalidate_user_cache

    await invalidate_user_cache(current_user.id)


_CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value: Any) -> Any:
    """Prevent CSV/spreadsheet formula injection.

    Excel/LibreOffice/Numbers interpret cells starting with =, +, -, @, tab,
    or CR as formulas — malicious merchant/notes values could execute code
    when a user opens the exported file. Prefix a single quote to neutralise.
    """
    if isinstance(value, str) and value and value[0] in _CSV_FORMULA_TRIGGERS:
        return "'" + value
    return value


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
    writer = csv.writer(buf, quoting=csv.QUOTE_ALL)
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
            _csv_safe(t.merchant),
            t.amount,
            _csv_safe(t.category or ""),
            _csv_safe(t.payment_mode or ""),
            _csv_safe(tags_str),
            t.is_recurring,
            t.source,
            _csv_safe(t.notes or ""),
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
@_limiter.limit("5/minute")
async def import_csv(
    request: Request,
    current_user: CurrentUser,
    db: DB,
    file: UploadFile = File(...),
) -> CSVImportResponse:
    """Import transactions from CSV with dedup and batch tracking."""
    if file.content_type not in ("text/csv", "application/vnd.ms-excel", "text/plain"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File must be CSV"
        )

    # SEC-06: Enforce file size limit to prevent memory exhaustion
    max_csv_bytes = 5 * 1024 * 1024  # 5 MB
    if file.size and file.size > max_csv_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="CSV file too large. Maximum size is 5 MB.",
        )

    await _require_statement_import_consent(db, current_user.id)

    raw = await file.read()
    if len(raw) > max_csv_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="CSV file too large. Maximum size is 5 MB.",
        )
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    skipped = 0
    duplicates = 0
    errors: list[str] = []
    total_rows = 0

    import hashlib
    import re
    from datetime import datetime as dt

    date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    # Common date formats for flexible parsing
    date_formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%d %b %Y",
        "%d %B %Y",
        "%Y/%m/%d",
    ]

    def _parse_date(raw_date: str) -> str | None:
        raw_date = raw_date.strip()
        if date_pattern.match(raw_date):
            return raw_date
        for fmt in date_formats:
            try:
                return dt.strptime(raw_date, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return None

    def _compute_hash(date_val: str, merchant: str, amount: float) -> str:
        key = f"{date_val}|{merchant.lower().strip()}|{amount:.2f}"
        return hashlib.sha256(key.encode()).hexdigest()[:32]

    # Create ImportBatch record
    batch = ImportBatch(
        user_id=current_user.id,
        source_type="csv",
        file_name=file.filename or "import.csv",
    )
    db.add(batch)
    await db.flush()

    async with db.begin_nested():
        for i, row in enumerate(reader, start=2):
            total_rows += 1
            try:
                # Flexible column mapping — try common names
                raw_date = (
                    row.get("date")
                    or row.get("Date")
                    or row.get("Transaction Date")
                    or row.get("txn_date")
                    or ""
                ).strip()
                merchant = (
                    row.get("merchant")
                    or row.get("Merchant")
                    or row.get("Description")
                    or row.get("description")
                    or row.get("Narration")
                    or row.get("narration")
                    or ""
                ).strip()
                amount_str = (
                    (row.get("amount") or row.get("Amount") or "")
                    .replace(",", "")
                    .strip()
                )
                debit_str = (
                    (
                        row.get("debit")
                        or row.get("Debit")
                        or row.get("Withdrawal")
                        or ""
                    )
                    .replace(",", "")
                    .strip()
                )
                credit_str = (
                    (row.get("credit") or row.get("Credit") or row.get("Deposit") or "")
                    .replace(",", "")
                    .strip()
                )
                category = (
                    row.get("category") or row.get("Category") or ""
                ).strip() or None
                txn_type = (
                    row.get("type") or row.get("Type") or ""
                ).strip().lower() or None

                if not raw_date or not merchant:
                    errors.append(f"Row {i}: missing date or merchant/description")
                    skipped += 1
                    continue

                date_val = _parse_date(raw_date)
                if not date_val:
                    errors.append(f"Row {i}: unrecognized date format '{raw_date}'")
                    skipped += 1
                    continue

                if len(merchant) > 200:
                    errors.append(f"Row {i}: merchant name too long (max 200 chars)")
                    skipped += 1
                    continue

                # Determine amount and type from debit/credit columns if present
                amount = None
                inferred_type = txn_type or "expense"
                if amount_str:
                    try:
                        amount = abs(float(amount_str))
                    except ValueError:
                        pass
                if amount is None and debit_str:
                    try:
                        amount = abs(float(debit_str))
                        inferred_type = "expense"
                    except ValueError:
                        pass
                if amount is None and credit_str:
                    try:
                        amount = abs(float(credit_str))
                        inferred_type = "income"
                    except ValueError:
                        pass
                if amount is None:
                    errors.append(f"Row {i}: no valid amount found")
                    skipped += 1
                    continue

                if amount <= 0 or amount > 100_000_000:
                    errors.append(f"Row {i}: amount must be between 0 and 100,000,000")
                    skipped += 1
                    continue

                # Duplicate detection via hash
                dedup = _compute_hash(date_val, merchant, amount)
                existing = await db.execute(
                    select(Transaction.id).where(
                        Transaction.user_id == current_user.id,
                        Transaction.dedup_hash == dedup,
                    )
                )
                if existing.scalar_one_or_none():
                    duplicates += 1
                    continue

                if not category and inferred_type != "transfer":
                    cat_result = await categorize_single(merchant, "")
                    category = cat_result.get("category")

                txn = Transaction(
                    user_id=current_user.id,
                    date=date_val,
                    merchant=merchant,
                    amount=amount,
                    type=inferred_type if inferred_type in VALID_TYPES else "expense",
                    category=category,
                    source="csv",
                    import_batch_id=batch.id,
                    dedup_hash=dedup,
                )
                db.add(txn)
                imported += 1
            except Exception:
                errors.append(f"Row {i}: unexpected error processing row")
                skipped += 1

        await db.flush()

    # Update batch stats
    batch.row_count = total_rows
    batch.success_count = imported
    batch.error_count = skipped
    batch.errors_detail = errors[:50]
    batch.status = "completed" if skipped == 0 else "partial"
    await db.flush()

    await log_audit_event(
        db,
        user_id=current_user.id,
        action="transactions.import_csv",
        resource_type="transaction",
        metadata={
            "batch_id": batch.id,
            "imported": imported,
            "skipped": skipped,
            "duplicates": duplicates,
        },
        request=request,
    )

    return CSVImportResponse(
        batch_id=batch.id,
        imported=imported,
        skipped=skipped,
        duplicates=duplicates,
        errors=errors[:20],
    )
