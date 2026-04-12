"""Bills & Reminders API: recurring bills with due dates, paid status, auto-expense."""
from typing import Optional

from fastapi import APIRouter, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.api.exceptions import ResourceNotFound
from app.db.models import Bill, Transaction
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
            raise ValueError(f"frequency must be one of: {', '.join(VALID_FREQUENCIES)}")
        return v


class BillUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    is_variable: Optional[bool] = None
    due_date: Optional[str] = None
    frequency: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    reminder_lead_days: Optional[int] = None
    is_paid: Optional[bool] = None
    auto_create_expense: Optional[bool] = None
    description: Optional[str] = None


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
    created_at: str

    class Config:
        from_attributes = True


@router.post("", response_model=BillOut, status_code=status.HTTP_201_CREATED)
async def create_bill(body: BillCreate, current_user: CurrentUser, db: DB) -> BillOut:
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


@router.get("", response_model=list[BillOut])
async def list_bills(
    current_user: CurrentUser,
    db: DB,
    paid: Optional[bool] = None,
) -> list[BillOut]:
    q = select(Bill).where(Bill.user_id == current_user.id)
    if paid is not None:
        q = q.where(Bill.is_paid == paid)
    q = q.order_by(Bill.due_date.asc())
    result = await db.execute(q)
    return [BillOut.model_validate(b) for b in result.scalars().all()]


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
    for field, value in body.model_dump(exclude_unset=True).items():
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

    bill.is_paid = True

    if bill.auto_create_expense:
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
