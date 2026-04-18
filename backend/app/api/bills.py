"""Bills & Reminders API: recurring bills with due dates, paid status, auto-expense."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from app.api.exceptions import ResourceNotFound
from app.db.models import Bill, Category, Transaction
from app.dependencies import DB, CurrentUser

VALID_FREQUENCIES = {"once", "weekly", "monthly", "quarterly", "yearly"}

router = APIRouter()


class BillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., ge=0, le=100_000_000)
    is_variable: bool = False
    due_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    frequency: str = "monthly"
    category: Optional[str] = Field(None, max_length=128)
    category_id: Optional[str] = Field(None, min_length=36, max_length=36)
    reminder_lead_days: int = Field(3, ge=0, le=30)
    auto_create_expense: bool = False
    description: Optional[str] = Field(None, max_length=500)

    @field_validator("frequency")
    @classmethod
    def valid_frequency(cls, v: str) -> str:
        if v not in VALID_FREQUENCIES:
            raise ValueError(
                f"frequency must be one of: {', '.join(VALID_FREQUENCIES)}"
            )
        return v


class BillUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[float] = Field(None, ge=0, le=100_000_000)
    is_variable: Optional[bool] = None
    due_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    frequency: Optional[str] = None
    category: Optional[str] = Field(None, max_length=128)
    category_id: Optional[str] = Field(None, min_length=36, max_length=36)
    reminder_lead_days: Optional[int] = Field(None, ge=0, le=30)
    is_paid: Optional[bool] = None
    auto_create_expense: Optional[bool] = None
    description: Optional[str] = Field(None, max_length=500)

    @field_validator("frequency")
    @classmethod
    def valid_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_FREQUENCIES:
            raise ValueError(
                f"frequency must be one of: {', '.join(VALID_FREQUENCIES)}"
            )
        return v


class BillOut(BaseModel):
    id: str
    name: str
    amount: float
    is_variable: bool
    due_date: str
    frequency: str
    category: Optional[str]
    category_id: Optional[str]
    reminder_lead_days: int
    is_paid: bool
    auto_create_expense: bool
    description: Optional[str]
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


async def _verify_category_ownership(
    db: DB, category_id: Optional[str], user_id: str
) -> None:
    """Ensure the category_id belongs to the current user."""
    if not category_id:
        return
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Category not found or does not belong to you",
        )


@router.post("", response_model=BillOut, status_code=status.HTTP_201_CREATED)
async def create_bill(body: BillCreate, current_user: CurrentUser, db: DB) -> BillOut:
    await _verify_category_ownership(db, body.category_id, current_user.id)
    bill = Bill(
        user_id=current_user.id,
        name=body.name,
        amount=body.amount,
        is_variable=body.is_variable,
        due_date=body.due_date,
        frequency=body.frequency,
        category=body.category,
        category_id=body.category_id,
        reminder_lead_days=body.reminder_lead_days,
        auto_create_expense=body.auto_create_expense,
        description=body.description,
    )
    db.add(bill)
    await db.flush()
    return BillOut.model_validate(bill)


@router.get("")
async def list_bills(
    current_user: CurrentUser,
    db: DB,
    paid: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    q = select(Bill).where(Bill.user_id == current_user.id)
    if paid is not None:
        q = q.where(Bill.is_paid == paid)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    q = q.order_by(Bill.due_date.asc()).limit(limit).offset(offset)
    result = await db.execute(q)
    return {
        "items": [BillOut.model_validate(b) for b in result.scalars().all()],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/{bill_id}", response_model=BillOut)
async def get_bill(bill_id: str, current_user: CurrentUser, db: DB) -> BillOut:
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise ResourceNotFound("Bill")
    return BillOut.model_validate(bill)


@router.patch("/{bill_id}", response_model=BillOut)
async def update_bill(
    bill_id: str, body: BillUpdate, current_user: CurrentUser, db: DB
) -> BillOut:
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise ResourceNotFound("Bill")
    update_data = body.model_dump(exclude_unset=True)
    if "category_id" in update_data:
        await _verify_category_ownership(
            db, update_data["category_id"], current_user.id
        )
    for field, value in update_data.items():
        setattr(bill, field, value)
    await db.flush()
    return BillOut.model_validate(bill)


@router.post("/{bill_id}/mark-paid", response_model=BillOut)
async def mark_paid(bill_id: str, current_user: CurrentUser, db: DB) -> BillOut:
    """Mark bill as paid. If auto_create_expense is on, create a transaction."""
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise ResourceNotFound("Bill")

    if bill.is_paid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bill is already marked as paid",
        )

    bill.is_paid = True

    if bill.auto_create_expense:
        existing_txn = await db.execute(
            select(Transaction)
            .where(
                Transaction.user_id == current_user.id,
                Transaction.source == "bill",
                Transaction.notes == f"Auto-created from bill: {bill.name}",
                Transaction.date == bill.due_date,
                Transaction.amount == bill.amount,
            )
            .limit(1)
        )
        if not existing_txn.scalar_one_or_none():
            tx = Transaction(
                user_id=current_user.id,
                date=bill.due_date,
                merchant=bill.name,
                amount=bill.amount,
                category=bill.category,
                category_id=bill.category_id,
                source="bill",
                notes=f"Auto-created from bill: {bill.name}",
            )
            db.add(tx)

    await db.flush()
    return BillOut.model_validate(bill)


@router.post("/{bill_id}/mark-unpaid", response_model=BillOut)
async def mark_unpaid(bill_id: str, current_user: CurrentUser, db: DB) -> BillOut:
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise ResourceNotFound("Bill")
    bill.is_paid = False
    await db.flush()
    return BillOut.model_validate(bill)


@router.delete("/{bill_id}")
async def delete_bill(bill_id: str, current_user: CurrentUser, db: DB) -> dict:
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.user_id == current_user.id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise ResourceNotFound("Bill")
    await db.delete(bill)
    return {"detail": "Bill deleted"}


@router.get("/upcoming/next7days", response_model=list[BillOut])
async def upcoming_bills(current_user: CurrentUser, db: DB) -> list[BillOut]:
    """Return unpaid bills due within the next 7 days."""
    from datetime import date, timedelta

    today = date.today()
    end = today + timedelta(days=7)
    result = await db.execute(
        select(Bill)
        .where(
            Bill.user_id == current_user.id,
            Bill.is_paid.is_(False),
            Bill.due_date >= today.isoformat(),
            Bill.due_date <= end.isoformat(),
        )
        .order_by(Bill.due_date.asc())
        .limit(5)
    )
    return [BillOut.model_validate(b) for b in result.scalars().all()]
