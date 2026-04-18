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
from app.utils.dates import month_date_range

# ── Rollover helper ───────────────────────────────────────────────────────────


async def _apply_rollover(user_id: str, db: Any) -> None:
    """Carry forward unspent budget from previous month when rollover_enabled=True.

    Called lazily on GET /budgets. Skips months that already have a rollover
    BudgetVersion so the operation is idempotent.
    """
    from datetime import date

    today = date.today()
    cur_month, cur_year = today.month, today.year
    # Compute previous month
    if cur_month == 1:
        prev_month, prev_year = 12, cur_year - 1
    else:
        prev_month, prev_year = cur_month - 1, cur_year

    # Find rollover-enabled budgets from last month
    prev_result = await db.execute(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.month == prev_month,
            Budget.year == prev_year,
            Budget.rollover_enabled.is_(True),
        )
    )
    prev_budgets = prev_result.scalars().all()
    if not prev_budgets:
        return

    for prev_b in prev_budgets:
        # Skip if a rollover version already exists for current month/category
        rollover_check = await db.execute(
            select(BudgetVersion).where(
                BudgetVersion.user_id == user_id,
                BudgetVersion.category == prev_b.category,
                BudgetVersion.month == cur_month,
                BudgetVersion.year == cur_year,
                BudgetVersion.change_reason == "rollover",
            )
        )
        if rollover_check.scalar_one_or_none():
            continue

        # Compute last month's actual spend
        d_start, d_end = month_date_range(prev_year, prev_month)
        spent_res = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0.0)).where(
                Transaction.user_id == user_id,
                Transaction.category == prev_b.category,
                Transaction.type == "expense",
                Transaction.date >= d_start,
                Transaction.date < d_end,
            )
        )
        spent = float(spent_res.scalar_one())
        surplus = prev_b.limit_amount - spent
        if surplus <= 0:
            continue

        # Find or create current month's budget for this category
        cur_result = await db.execute(
            select(Budget).where(
                Budget.user_id == user_id,
                Budget.category == prev_b.category,
                Budget.month == cur_month,
                Budget.year == cur_year,
            )
        )
        cur_b = cur_result.scalar_one_or_none()
        if cur_b:
            cur_b.limit_amount = round(cur_b.limit_amount + surplus, 2)
            db.add(cur_b)
            await db.flush()
        else:
            cur_b = Budget(
                user_id=user_id,
                month=cur_month,
                year=cur_year,
                category=prev_b.category,
                limit_amount=round(prev_b.limit_amount + surplus, 2),
                soft_alert=prev_b.soft_alert,
                hard_alert=prev_b.hard_alert,
                rollover_enabled=True,
            )
            db.add(cur_b)
            await db.flush()

        # Record rollover snapshot so we don't repeat
        db.add(
            BudgetVersion(
                budget_id=cur_b.id,
                user_id=user_id,
                month=cur_month,
                year=cur_year,
                category=prev_b.category,
                version=cur_b.version or 1,
                snapshot=_budget_snapshot(cur_b),
                change_reason="rollover",
            )
        )
        await db.flush()

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
    categories = {b.category for b in budgets}

    date_ranges = [month_date_range(b.year, b.month) for b in budgets]
    overall_start = min(r[0] for r in date_ranges)
    overall_end = max(r[1] for r in date_ranges)

    from sqlalchemy import literal_column

    spend_query = (
        select(
            Transaction.category,
            func.substr(Transaction.date, 1, 7).label("month_prefix"),
            func.coalesce(func.sum(Transaction.amount), 0.0).label("spent"),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.category.in_(categories),
            Transaction.date >= overall_start,
            Transaction.date < overall_end,
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
        is_grace_period = (
            now - budget.created_at.replace(tzinfo=timezone.utc)
        ) < timedelta(hours=24)
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
        "last_edited_at": budget.last_edited_at.isoformat()
        if budget.last_edited_at
        else None,
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
async def create_budget(
    body: BudgetCreate, request: Request, current_user: CurrentUser, db: DB
) -> BudgetOut:
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
        metadata={
            "month": budget.month,
            "year": budget.year,
            "category": budget.category,
        },
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
    from app.services.cache import cache_get, cache_set

    cache_key = f"user:{current_user.id}:budgets:{month or 'all'}:{year or 'all'}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return BudgetListResponse(**cached)

    # Apply rollover from previous month (idempotent)
    await _apply_rollover(current_user.id, db)

    query = select(Budget).where(Budget.user_id == current_user.id)
    if month:
        query = query.where(Budget.month == month)
    if year:
        query = query.where(Budget.year == year)

    result = await db.execute(
        query.order_by(Budget.year.desc(), Budget.month.desc(), Budget.category.asc())
    )
    budgets = result.scalars().all()
    resp = BudgetListResponse(items=await _batch_enrich_budgets(list(budgets), db))
    await cache_set(cache_key, resp.model_dump(), ttl=60)
    return resp


@router.patch("/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: str,
    body: BudgetUpdate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> BudgetOut:
    query = select(Budget).where(
        Budget.id == budget_id, Budget.user_id == current_user.id
    )
    bind = db.get_bind()
    if bind.dialect.name != "sqlite":
        query = query.with_for_update()

    result = await db.execute(query)
    budget = result.scalar_one_or_none()
    if not budget:
        raise ResourceNotFound("Budget")

    now = datetime.now(timezone.utc)
    is_grace_period = (
        now - budget.created_at.replace(tzinfo=timezone.utc)
    ) < timedelta(hours=24)

    if (budget.edit_count or 0) >= 1 and not is_grace_period:
        raise ResourceConflict(
            "Monthly budget can be edited only once "
            "after 24-hour grace period"
        )

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
            metadata={
                "month": budget.month,
                "year": budget.year,
                "edit_count": budget.edit_count,
            },
            request=request,
        )

    return await _enrich_budget(budget, db)


@router.get("/{budget_id}/history", response_model=list[BudgetVersionOut])
async def get_budget_history(
    budget_id: str, current_user: CurrentUser, db: DB
) -> list[BudgetVersionOut]:
    result = await db.execute(
        select(BudgetVersion)
        .where(
            BudgetVersion.budget_id == budget_id,
            BudgetVersion.user_id == current_user.id,
        )
        .order_by(BudgetVersion.version.asc())
    )
    return [BudgetVersionOut.model_validate(v) for v in result.scalars().all()]


@router.delete("/{budget_id}", status_code=status.HTTP_200_OK)
async def delete_budget(
    budget_id: str, request: Request, current_user: CurrentUser, db: DB
) -> dict:
    result = await db.execute(
        select(Budget).where(Budget.id == budget_id, Budget.user_id == current_user.id)
    )
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
        metadata={
            "month": budget.month,
            "year": budget.year,
            "category": budget.category,
        },
        request=request,
    )
    return {"detail": "Budget deleted"}
