"""Recurring rules API: detect candidate recurring merchants and manage rules."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.exceptions import ResourceNotFound
from app.db.models import RecurringRule, Transaction
from app.dependencies import DB, CurrentUser

router = APIRouter()


class RecurringCandidate(BaseModel):
    merchant: str
    months_seen: int
    avg_amount: float
    category: Optional[str] = None


class RecurringRuleCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=255)
    type: str = Field("expense", pattern="^(income|expense)$")
    frequency: str = Field("monthly", pattern="^(weekly|monthly|quarterly|yearly)$")
    expected_amount: float = Field(..., ge=0)
    next_due_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: Optional[str] = Field(None, max_length=128)
    merchant_pattern: Optional[str] = Field(None, max_length=255)


class RecurringRuleUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=255)
    type: Optional[str] = Field(None, pattern="^(income|expense)$")
    frequency: Optional[str] = Field(None, pattern="^(weekly|monthly|quarterly|yearly)$")
    expected_amount: Optional[float] = Field(None, ge=0)
    next_due_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: Optional[str] = Field(None, max_length=128)
    merchant_pattern: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class RecurringRuleOut(BaseModel):
    id: str
    label: str
    type: str
    frequency: str
    expected_amount: float
    next_due_date: Optional[str]
    category: Optional[str]
    merchant_pattern: Optional[str]
    is_active: bool = True

    class Config:
        from_attributes = True


@router.post("/detect", response_model=list[RecurringCandidate])
async def detect_recurring_candidates(
    current_user: CurrentUser,
    db: DB,
    min_months: int = Query(2, ge=2, le=12),
    lookback_days: int = Query(90, ge=30, le=365),
) -> list[RecurringCandidate]:
    """Detect merchants that appear in 2+ distinct months (no LLM required).

    Returns candidates the user can confirm and turn into RecurringRule rows.
    """
    from datetime import date, timedelta

    cutoff = (date.today() - timedelta(days=lookback_days)).isoformat()

    rows = await db.execute(
        select(
            Transaction.merchant,
            func.count(
                func.distinct(func.substr(Transaction.date, 1, 7))
            ).label("month_count"),
            func.round(func.avg(Transaction.amount), 2).label("avg_amount"),
            Transaction.category,
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.merchant.isnot(None),
            Transaction.date >= cutoff,
            Transaction.type == "expense",
        )
        .group_by(Transaction.merchant, Transaction.category)
        .having(
            func.count(func.distinct(func.substr(Transaction.date, 1, 7))) >= min_months
        )
        .order_by(func.avg(Transaction.amount).desc())
        .limit(20)
    )

    return [
        RecurringCandidate(
            merchant=r.merchant,
            months_seen=r.month_count,
            avg_amount=float(r.avg_amount),
            category=r.category,
        )
        for r in rows
    ]


@router.get("", response_model=list[RecurringRuleOut])
async def list_recurring_rules(
    current_user: CurrentUser,
    db: DB,
    limit: int = Query(50, ge=1, le=200),
) -> list[RecurringRuleOut]:
    result = await db.execute(
        select(RecurringRule)
        .where(RecurringRule.user_id == current_user.id)
        .order_by(RecurringRule.created_at.desc())
        .limit(limit)
    )
    return [RecurringRuleOut.model_validate(r) for r in result.scalars().all()]


@router.post("", response_model=RecurringRuleOut, status_code=status.HTTP_201_CREATED)
async def create_recurring_rule(
    body: RecurringRuleCreate,
    current_user: CurrentUser,
    db: DB,
) -> RecurringRuleOut:
    rule = RecurringRule(
        user_id=current_user.id,
        label=body.label,
        type=body.type,
        frequency=body.frequency,
        expected_amount=body.expected_amount,
        next_due_date=body.next_due_date,
        category=body.category,
        merchant_pattern=body.merchant_pattern,
    )
    db.add(rule)
    await db.flush()
    return RecurringRuleOut.model_validate(rule)


@router.get("/{rule_id}", response_model=RecurringRuleOut)
async def get_recurring_rule(
    rule_id: str,
    current_user: CurrentUser,
    db: DB,
) -> RecurringRuleOut:
    result = await db.execute(
        select(RecurringRule).where(
            RecurringRule.id == rule_id,
            RecurringRule.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise ResourceNotFound("RecurringRule")
    return RecurringRuleOut.model_validate(rule)


@router.patch("/{rule_id}", response_model=RecurringRuleOut)
async def update_recurring_rule(
    rule_id: str,
    body: RecurringRuleUpdate,
    current_user: CurrentUser,
    db: DB,
) -> RecurringRuleOut:
    result = await db.execute(
        select(RecurringRule).where(
            RecurringRule.id == rule_id,
            RecurringRule.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise ResourceNotFound("RecurringRule")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await db.flush()
    return RecurringRuleOut.model_validate(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring_rule(
    rule_id: str,
    current_user: CurrentUser,
    db: DB,
) -> Response:
    result = await db.execute(
        select(RecurringRule).where(
            RecurringRule.id == rule_id,
            RecurringRule.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise ResourceNotFound("RecurringRule")
    await db.delete(rule)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
