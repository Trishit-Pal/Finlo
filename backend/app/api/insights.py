"""Insights API: rule-based financial insights and multi-month trends."""

from datetime import date, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.db.models import Insight, Transaction
from app.dependencies import DB, CurrentUser
from app.services.insights_engine import generate_insights

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class InsightOut(BaseModel):
    id: str
    type: str
    severity: str
    title: str
    explanation: str
    recommendation: Optional[str]
    metric_basis: Optional[dict]
    is_dismissed: bool
    created_at: Any

    class Config:
        from_attributes = True


class TrendPoint(BaseModel):
    month: str
    income: float
    expense: float
    net: float


class TrendResponse(BaseModel):
    months: list[TrendPoint]
    avg_daily_spend: float
    savings_rate: Optional[float]
    total_income: float
    total_expense: float


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[InsightOut])
async def get_insights(
    current_user: CurrentUser,
    db: DB,
    refresh: bool = Query(False, description="Force re-generation of insights"),
) -> list[InsightOut]:
    """Return current insights. If refresh=true, re-generate from transaction data."""
    if refresh:
        await generate_insights(db, current_user.id)

    result = await db.execute(
        select(Insight)
        .where(
            Insight.user_id == current_user.id,
            Insight.is_dismissed.is_(False),
        )
        .order_by(Insight.created_at.desc())
        .limit(30)
    )
    return [InsightOut.model_validate(i) for i in result.scalars().all()]


@router.post("/{insight_id}/dismiss", status_code=204)
async def dismiss_insight(insight_id: str, current_user: CurrentUser, db: DB) -> None:
    result = await db.execute(
        select(Insight).where(
            Insight.id == insight_id, Insight.user_id == current_user.id
        )
    )
    insight = result.scalar_one_or_none()
    if insight:
        insight.is_dismissed = True
        await db.flush()


@router.get("/trends", response_model=TrendResponse)
async def get_trends(
    current_user: CurrentUser,
    db: DB,
    months: int = Query(6, ge=1, le=24),
) -> TrendResponse:
    """Multi-month income vs expense trend with savings rate and daily avg."""
    from app.services.cache import cache_get, cache_set

    cache_key = f"user:{current_user.id}:trends:{months}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return TrendResponse(**cached)

    today = date.today()

    month_prefixes = []
    for offset in range(months - 1, -1, -1):
        d = today.replace(day=1) - timedelta(days=offset * 28)
        month_prefixes.append(d.strftime("%Y-%m"))

    month_col = func.substr(Transaction.date, 1, 7)
    rows = await db.execute(
        select(
            month_col.label("month"),
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), 0.0).label("total"),
        )
        .where(
            Transaction.user_id == current_user.id,
            month_col.in_(month_prefixes),
        )
        .group_by(month_col, Transaction.type)
    )
    agg: dict[str, dict[str, float]] = {p: {"income": 0.0, "expense": 0.0} for p in month_prefixes}
    for r in rows:
        bucket = "income" if r.type == "income" else "expense"
        if r.month in agg:
            agg[r.month][bucket] += float(r.total)

    points: list[TrendPoint] = []
    for prefix in month_prefixes:
        m_income = agg[prefix]["income"]
        m_expense = agg[prefix]["expense"]
        points.append(
            TrendPoint(
                month=prefix,
                income=round(m_income, 2),
                expense=round(m_expense, 2),
                net=round(m_income - m_expense, 2),
            )
        )

    # Current month stats
    current_prefix = today.strftime("%Y-%m")
    days_elapsed = today.day
    current_expense = next(
        (p.expense for p in points if p.month == current_prefix), 0.0
    )
    avg_daily = round(current_expense / max(days_elapsed, 1), 2)

    total_income = sum(p.income for p in points)
    total_expense = sum(p.expense for p in points)
    savings_rate = (
        round(((total_income - total_expense) / total_income) * 100, 1)
        if total_income > 0
        else None
    )

    resp = TrendResponse(
        months=points,
        avg_daily_spend=avg_daily,
        savings_rate=savings_rate,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
    )
    await cache_set(cache_key, resp.model_dump(), ttl=300)
    return resp
