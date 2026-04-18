"""Budgets API: CRUD + monthly edit governance + versioned snapshots."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.exceptions import ResourceConflict, ResourceNotFound
from app.db.models import Budget, BudgetVersion, Transaction
from app.dependencies import DB, CurrentUser
from app.services.audit import log_audit_event

router = APIRouter()


class BudgetCreate(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2020, le=2100)
    category: str
    limit_amount: float = Field(..., gt=0)
    soft_alert: float = Field(0.8, ge=0.0, le=1.0)
    hard_alert: float = Field(1.0, ge=0.0, le=1.0)
    rollover_enabled: bool = False
    is_percentage: bool = False


class BudgetUpdate(BaseModel):
    limit_amount: Optional[float] = Field(None, gt=0)
    soft_alert: Optional[float] = Field(None, ge=0.0, le=1.0)
    hard_alert: Optional[float] = Field(None, ge=0.0, le=1.0)
    rollover_enabled: Optional[bool] = None
    is_percentage: Optional[bool] = None


class BudgetOut(BaseModel):
    id: str
    month: int
    year: int
    category: str
    limit_amount: float
    soft_alert: float
    hard_alert: float
    rollover_enabled: bool = False
    is_percentage: bool = False
    spent: float = 0.0
    remaining: float = 0.0
    alert_level: str = "ok"
    edit_count: int = 0
    version: int = 1
    last_edited_at: Optional[Any] = None
    can_edit: bool = True
    created_at: Any

    class Config:
        from_attributes = True


class BudgetListResponse(BaseModel):
    items: list[BudgetOut]


class BudgetVersionOut(BaseModel):
    id: str
    budget_id: str
    version: int
    change_reason: str
    snapshot: dict[str, Any]
    created_at: Any

    class Config:
        from_attributes = True


async def _batch_enrich_budgets(budgets: list[Budget], db: Any) -> list[BudgetOut]:
    if not budgets:
        return []

    user_id = budgets[0].user_id
    month_prefixes = {f"{b.year:04d}-{b.month:02d}" for b in budgets}
    categories = {b.category for b in budgets}

    prefix_filters = [Transaction.date.like(f"{p}%") for p in month_prefixes]
    from sqlalchemy import literal_column, or_

    spend_query = (
        select(
            Transaction.category,
            func.substr(Transaction.date, 1, 7).label("month_prefix"),
            func.coalesce(func.sum(Transaction.amount), 0.0).label("spent"),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.category.in_(categories),
            or_(*prefix_filters),
        )
        .group_by(Transaction.category, literal_column("month_prefix"))
    )
    spend_result = await db.execute(spend_query)

    spend_map: dict[tuple[str, str], float] = {}
    for row in spend_result:
        spend_map[(row.category, row.month_prefix)] = float(row.spent)

    result: list[BudgetOut] = []
    for budget in budgets:
        prefix = f"{budget.year:04d}-{budget.month:02d}"
        spent = spend_map.get((budget.category, prefix), 0.0)
        ratio = spent / budget.limit_amount if budget.limit_amount > 0 else 0.0

        if ratio >= budget.hard_alert:
            alert_level = "hard"
        elif ratio >= budget.soft_alert:
            alert_level = "soft"
        else:
            alert_level = "ok"

        out = BudgetOut.model_validate(budget)
        out.spent = round(spent, 2)
        out.remaining = round(budget.limit_amount - spent, 2)
        out.alert_level = alert_level

        # Logic for can_edit: allowed if (no edits yet OR within 24-hour grace period)
        now = datetime.now(timezone.utc)
        is_grace_period = (now - budget.created_at.replace(tzinfo=timezone.utc)) < timedelta(hours=24)
        out.can_edit = (budget.edit_count or 0) < 1 or is_grace_period

        result.append(out)

    return result


def _budget_snapshot(budget: Budget) -> dict[str, Any]:
    return {
        "id": budget.id,
        "month": budget.month,
        "year": budget.year,
        "category": budget.category,
        "limit_amount": budget.limit_amount,
        "soft_alert": budget.soft_alert,
        "hard_alert": budget.hard_alert,
        "rollover_enabled": budget.rollover_enabled,
        "is_percentage": budget.is_percentage,
        "edit_count": budget.edit_count,
        "version": budget.version,
        "last_edited_at": budget.last_edited_at.isoformat() if budget.last_edited_at else None,
    }


async def _record_budget_version(db: Any, budget: Budget, reason: str) -> None:
    version = BudgetVersion(
        budget_id=budget.id,
        user_id=budget.user_id,
        month=budget.month,
        year=budget.year,
        category=budget.category,
        version=budget.version,
        snapshot=_budget_snapshot(budget),
        change_reason=reason,
    )
    db.add(version)
    await db.flush()


async def _enrich_budget(budget: Budget, db: Any) -> BudgetOut:
    rows = await _batch_enrich_budgets([budget], db)
    return rows[0]


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
async def create_budget(body: BudgetCreate, request: Request, current_user: CurrentUser, db: DB) -> BudgetOut:
    existing = await db.execute(
        select(Budget).where(
            Budget.user_id == current_user.id,
            Budget.category == body.category,
            Budget.month == body.month,
            Budget.year == body.year,
        )
    )
    if existing.scalar_one_or_none():
        raise ResourceConflict("Budget already exists for this category and period")

    budget = Budget(
        user_id=current_user.id,
        month=body.month,
        year=body.year,
        category=body.category,
        limit_amount=body.limit_amount,
        soft_alert=body.soft_alert,
        hard_alert=body.hard_alert,
        rollover_enabled=body.rollover_enabled,
        is_percentage=body.is_percentage,
    )
    db.add(budget)
    await db.flush()

    await _record_budget_version(db, budget, "create")
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="budget.created",
        resource_type="budget",
        resource_id=budget.id,
        metadata={"month": budget.month, "year": budget.year, "category": budget.category},
        request=request,
    )
    return await _enrich_budget(budget, db)


@router.get("", response_model=BudgetListResponse)
async def list_budgets(
    current_user: CurrentUser,
    db: DB,
    month: Optional[int] = None,
    year: Optional[int] = None,
) -> BudgetListResponse:
    query = select(Budget).where(Budget.user_id == current_user.id)
    if month:
        query = query.where(Budget.month == month)
    if year:
        query = query.where(Budget.year == year)

    result = await db.execute(query.order_by(Budget.year.desc(), Budget.month.desc(), Budget.category.asc()))
    budgets = result.scalars().all()
    return BudgetListResponse(items=await _batch_enrich_budgets(list(budgets), db))


@router.patch("/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: str,
    body: BudgetUpdate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> BudgetOut:
    query = select(Budget).where(Budget.id == budget_id, Budget.user_id == current_user.id)
    bind = db.get_bind()
    if bind.dialect.name != "sqlite":
        query = query.with_for_update()

    result = await db.execute(query)
    budget = result.scalar_one_or_none()
    if not budget:
        raise ResourceNotFound("Budget")

    now = datetime.now(timezone.utc)
    is_grace_period = (now - budget.created_at.replace(tzinfo=timezone.utc)) < timedelta(hours=24)

    if (budget.edit_count or 0) >= 1 and not is_grace_period:
        raise ResourceConflict("Monthly budget can be edited only once for this month after 24-hour grace period")

    changed = False
    if body.limit_amount is not None:
        budget.limit_amount = body.limit_amount
        changed = True
    if body.soft_alert is not None:
        budget.soft_alert = body.soft_alert
        changed = True
    if body.hard_alert is not None:
        budget.hard_alert = body.hard_alert
        changed = True
    if body.rollover_enabled is not None:
        budget.rollover_enabled = body.rollover_enabled
        changed = True
    if body.is_percentage is not None:
        budget.is_percentage = body.is_percentage
        changed = True

    if changed:
        budget.edit_count = (budget.edit_count or 0) + 1
        budget.version = (budget.version or 1) + 1
        budget.last_edited_at = datetime.now(timezone.utc)

    db.add(budget)
    await db.flush()

    if changed:
        await _record_budget_version(db, budget, "update")
        await log_audit_event(
            db,
            user_id=current_user.id,
            action="budget.updated",
            resource_type="budget",
            resource_id=budget.id,
            metadata={"month": budget.month, "year": budget.year, "edit_count": budget.edit_count},
            request=request,
        )

    return await _enrich_budget(budget, db)


@router.get("/{budget_id}/history", response_model=list[BudgetVersionOut])
async def get_budget_history(budget_id: str, current_user: CurrentUser, db: DB) -> list[BudgetVersionOut]:
    result = await db.execute(
        select(BudgetVersion)
        .where(BudgetVersion.budget_id == budget_id, BudgetVersion.user_id == current_user.id)
        .order_by(BudgetVersion.version.asc())
    )
    return [BudgetVersionOut.model_validate(v) for v in result.scalars().all()]


@router.delete("/{budget_id}", status_code=status.HTTP_200_OK)
async def delete_budget(budget_id: str, request: Request, current_user: CurrentUser, db: DB) -> dict:
    result = await db.execute(select(Budget).where(Budget.id == budget_id, Budget.user_id == current_user.id))
    budget = result.scalar_one_or_none()
    if not budget:
        raise ResourceNotFound("Budget")
    await db.delete(budget)
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="budget.deleted",
        resource_type="budget",
        resource_id=budget_id,
        metadata={"month": budget.month, "year": budget.year, "category": budget.category},
        request=request,
    )
    return {"detail": "Budget deleted"}
