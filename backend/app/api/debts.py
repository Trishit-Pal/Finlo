"""Debts & Loans API: track loans, credit cards, IOUs."""
from typing import Optional

from fastapi import APIRouter, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.api.exceptions import ResourceNotFound
from app.db.models import Debt
from app.dependencies import DB, CurrentUser

VALID_DEBT_TYPES = {"personal_loan", "credit_card", "owed_to", "owed_by"}

router = APIRouter()


class DebtCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    type: str
    total_amount: float = Field(..., ge=0, le=1_000_000_000)
    remaining_balance: float = Field(..., ge=0, le=1_000_000_000)
    interest_rate: Optional[float] = Field(None, ge=0, le=100)
    emi_amount: Optional[float] = Field(None, ge=0, le=100_000_000)
    next_due_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    lender_name: Optional[str] = Field(None, max_length=200)

    @field_validator("type")
    @classmethod
    def valid_debt_type(cls, v: str) -> str:
        if v not in VALID_DEBT_TYPES:
            raise ValueError(f"type must be one of: {', '.join(VALID_DEBT_TYPES)}")
        return v


class DebtUpdate(BaseModel):
    name: Optional[str] = None
    remaining_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    emi_amount: Optional[float] = None
    next_due_date: Optional[str] = None
    lender_name: Optional[str] = None
    is_settled: Optional[bool] = None


class DebtOut(BaseModel):
    id: str
    name: str
    type: str
    total_amount: float
    remaining_balance: float
    interest_rate: Optional[float]
    emi_amount: Optional[float]
    next_due_date: Optional[str]
    lender_name: Optional[str]
    is_settled: bool
    created_at: str

    class Config:
        from_attributes = True


class PaymentLog(BaseModel):
    amount: float = Field(..., gt=0, le=100_000_000)
    note: Optional[str] = Field(None, max_length=500)


@router.get("", response_model=list[DebtOut])
async def list_debts(current_user: CurrentUser, db: DB) -> list[DebtOut]:
    result = await db.execute(
        select(Debt).where(Debt.user_id == current_user.id).order_by(Debt.created_at.desc())
    )
    return [DebtOut.model_validate(d) for d in result.scalars().all()]


@router.post("", response_model=DebtOut, status_code=status.HTTP_201_CREATED)
async def create_debt(body: DebtCreate, current_user: CurrentUser, db: DB) -> DebtOut:
    debt = Debt(
        user_id=current_user.id,
        name=body.name,
        type=body.type,
        total_amount=body.total_amount,
        remaining_balance=body.remaining_balance,
        interest_rate=body.interest_rate,
        emi_amount=body.emi_amount,
        next_due_date=body.next_due_date,
        lender_name=body.lender_name,
    )
    db.add(debt)
    await db.flush()
    return DebtOut.model_validate(debt)


@router.patch("/{debt_id}", response_model=DebtOut)
async def update_debt(
    debt_id: str, body: DebtUpdate, current_user: CurrentUser, db: DB
) -> DebtOut:
    result = await db.execute(
        select(Debt).where(Debt.id == debt_id, Debt.user_id == current_user.id)
    )
    debt = result.scalar_one_or_none()
    if not debt:
        raise ResourceNotFound("Debt")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(debt, field, value)
    await db.flush()
    return DebtOut.model_validate(debt)


@router.post("/{debt_id}/payment", response_model=DebtOut)
async def log_payment(
    debt_id: str, body: PaymentLog, current_user: CurrentUser, db: DB
) -> DebtOut:
    """Log an EMI/payment — reduces remaining balance."""
    result = await db.execute(
        select(Debt).where(Debt.id == debt_id, Debt.user_id == current_user.id)
    )
    debt = result.scalar_one_or_none()
    if not debt:
        raise ResourceNotFound("Debt")

    debt.remaining_balance = max(0, debt.remaining_balance - body.amount)
    if debt.remaining_balance == 0:
        debt.is_settled = True
    await db.flush()
    return DebtOut.model_validate(debt)


@router.delete("/{debt_id}")
async def delete_debt(debt_id: str, current_user: CurrentUser, db: DB) -> dict:
    result = await db.execute(
        select(Debt).where(Debt.id == debt_id, Debt.user_id == current_user.id)
    )
    debt = result.scalar_one_or_none()
    if not debt:
        raise ResourceNotFound("Debt")
    await db.delete(debt)
    return {"detail": "Debt deleted"}


@router.get("/summary")
async def debt_summary(current_user: CurrentUser, db: DB) -> dict:
    """Return total outstanding, monthly EMI total, active count."""
    result = await db.execute(
        select(Debt).where(Debt.user_id == current_user.id, Debt.is_settled.is_(False))
    )
    active = result.scalars().all()
    total_outstanding = sum(d.remaining_balance for d in active)
    monthly_emi = sum(d.emi_amount or 0 for d in active)
    return {
        "total_outstanding": total_outstanding,
        "monthly_emi_total": monthly_emi,
        "active_count": len(active),
        "settled_count": 0,  # could query separately if needed
    }
