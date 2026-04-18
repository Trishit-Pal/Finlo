"""Coach API: suggestions list + Accept/Modify/Reject responses."""

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.exceptions import ResourceConflict, ResourceNotFound
from app.db.models import Budget, Suggestion, Transaction
from app.dependencies import DB, CurrentUser
from app.utils.dates import prefix_date_range

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class CoachActionOut(BaseModel):
    text: str
    weekly_savings: Optional[float] = None
    rationale: Optional[str] = None
    source_receipts: list[str] = []


class SuggestionOut(BaseModel):
    id: str
    summary: Optional[str]
    actions: Optional[list]
    estimated_savings: Optional[float]
    confidence: Optional[float]
    status: str
    categories: Optional[list]
    user_edit: Optional[str]
    created_at: Any

    class Config:
        from_attributes = True


class RespondRequest(BaseModel):
    action: Literal["accepted", "modified", "rejected"]
    user_edit: Optional[str] = Field(None, max_length=2000)


class DashboardResponse(BaseModel):
    totals_by_category: list[dict]
    weekly_trend: list[dict]
    budget_status: list[dict]
    coach_suggestions: list[SuggestionOut]


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/suggestions", response_model=list[SuggestionOut])
async def get_suggestions(
    current_user: CurrentUser, db: DB, limit: int = Query(5, ge=1, le=50)
) -> list[SuggestionOut]:
    """Return the latest coach suggestions for the current user."""
    result = await db.execute(
        select(Suggestion)
        .where(Suggestion.user_id == current_user.id)
        .order_by(Suggestion.created_at.desc())
        .limit(limit)
    )
    return [SuggestionOut.model_validate(s) for s in result.scalars().all()]


@router.post("/suggestions/{suggestion_id}/respond", response_model=SuggestionOut)
async def respond_to_suggestion(
    suggestion_id: str,
    body: RespondRequest,
    current_user: CurrentUser,
    db: DB,
) -> SuggestionOut:
    """Store user's Accept/Modify/Reject decision as a feedback signal."""
    query = select(Suggestion).where(
        Suggestion.id == suggestion_id,
        Suggestion.user_id == current_user.id,
    )
    result = await db.execute(query)
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise ResourceNotFound("Suggestion")

    # State machine: only "pending" suggestions can be responded to
    if suggestion.status != "pending":
        raise ResourceConflict(
            f"Suggestion already {suggestion.status} — cannot change to {body.action}"
        )

    suggestion.status = body.action
    suggestion.user_edit = body.user_edit
    suggestion.responded_at = datetime.now(timezone.utc)
    db.add(suggestion)
    await db.flush()
    return SuggestionOut.model_validate(suggestion)


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(current_user: CurrentUser, db: DB) -> DashboardResponse:
    """Totals by category, weekly trend, budget status."""
    from datetime import date, timedelta

    from sqlalchemy import Date, func

    from app.config import get_settings as _get_settings
    from app.services.cache import cache_get, cache_set

    _is_sqlite = "sqlite" in _get_settings().get_database_url

    today = date.today()
    month_prefix = today.strftime("%Y-%m")

    cache_key = f"user:{current_user.id}:dashboard:{month_prefix}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return DashboardResponse(**cached)
    four_weeks_ago = (today - timedelta(weeks=4)).isoformat()

    # Totals by category (current month)
    d_start, d_end = prefix_date_range(month_prefix)
    cat_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.user_id == current_user.id,
            Transaction.date >= d_start,
            Transaction.date < d_end,
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
    )
    totals_by_category = [
        {"category": (r.category or "Uncategorized"), "total": round(r.total, 2)}
        for r in cat_result
    ]

    # Weekly trend (last 4 weeks, summed per ISO week)
    week_label = (
        func.strftime("%Y-%W", Transaction.date)
        if _is_sqlite
        else func.to_char(func.cast(Transaction.date, Date), "IYYY-IW")
    )
    week_result = await db.execute(
        select(
            week_label.label("week"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.user_id == current_user.id, Transaction.date >= four_weeks_ago
        )
        .group_by(week_label)
        .order_by(week_label)
    )
    weekly_trend = [{"week": r.week, "total": round(r.total, 2)} for r in week_result]

    # Budget status (current month) — single aggregated query
    budget_query = select(Budget).where(
        Budget.user_id == current_user.id,
        Budget.month == today.month,
        Budget.year == today.year,
    )
    budget_result = await db.execute(budget_query)
    budgets = budget_result.scalars().all()
    budget_categories = [b.category for b in budgets]

    # Batch fetch all category spends in one query
    spend_map: dict[str, float] = {}
    if budget_categories:
        spend_rows = await db.execute(
            select(
                Transaction.category,
                func.coalesce(func.sum(Transaction.amount), 0.0).label("spent"),
            )
            .where(
                Transaction.user_id == current_user.id,
                Transaction.category.in_(budget_categories),
                Transaction.date >= d_start,
                Transaction.date < d_end,
            )
            .group_by(Transaction.category)
        )
        spend_map = {r.category: float(r.spent) for r in spend_rows}

    budget_status = []
    for b in budgets:
        spent = spend_map.get(b.category, 0.0)
        ratio = spent / b.limit_amount if b.limit_amount > 0 else 0.0
        if ratio >= b.hard_alert:
            alert = "hard"
        elif ratio >= b.soft_alert:
            alert = "soft"
        else:
            alert = "ok"

        budget_status.append(
            {
                "budget_id": b.id,
                "category": b.category,
                "limit": b.limit_amount,
                "spent": round(spent, 2),
                "remaining": round(b.limit_amount - spent, 2),
                "percent": round(ratio * 100, 1),
                "alert": alert,
            }
        )

    # Latest coach suggestions
    sug_result = await db.execute(
        select(Suggestion)
        .where(Suggestion.user_id == current_user.id, Suggestion.status == "pending")
        .order_by(Suggestion.created_at.desc())
        .limit(3)
    )
    suggestions = [SuggestionOut.model_validate(s) for s in sug_result.scalars().all()]

    resp = DashboardResponse(
        totals_by_category=totals_by_category,
        weekly_trend=weekly_trend,
        budget_status=budget_status,
        coach_suggestions=suggestions,
    )
    await cache_set(cache_key, resp.model_dump(), ttl=120)
    return resp
