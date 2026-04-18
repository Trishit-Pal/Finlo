"""Analytics API: monthly summary and expense tracking insights."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.db.models import Bill, Transaction
from app.dependencies import DB, CurrentUser
from app.utils.dates import month_date_range, prefix_date_range

router = APIRouter()


class CategoryRow(BaseModel):
    name: str
    value: float
    prev_value: float | None = None


class MonthlyRow(BaseModel):
    month: str
    income: float
    expenses: float


class AnalyticsOverview(BaseModel):
    category_breakdown: list[CategoryRow]
    monthly_trend: list[MonthlyRow]


@router.get("", response_model=AnalyticsOverview)
async def get_analytics_overview(
    current_user: CurrentUser,
    db: DB,
) -> AnalyticsOverview:
    """Aggregate analytics: category breakdown (current vs previous month) and 6-month trend."""
    from app.services.cache import cache_get, cache_set

    cache_key = f"user:{current_user.id}:analytics_overview"
    cached = await cache_get(cache_key)
    if cached is not None:
        return AnalyticsOverview(**cached)

    today = date.today()
    cur_prefix = f"{today.year:04d}-{today.month:02d}"
    prev = today.replace(day=1) - timedelta(days=1)
    prev_prefix = f"{prev.year:04d}-{prev.month:02d}"

    async def _cat_totals(prefix: str) -> dict[str, float]:
        d_start, d_end = prefix_date_range(prefix)
        rows = await db.execute(
            select(Transaction.category, func.sum(Transaction.amount).label("total"))
            .where(
                Transaction.user_id == current_user.id,
                Transaction.date >= d_start,
                Transaction.date < d_end,
            )
            .group_by(Transaction.category)
        )
        return {(r.category or "Uncategorized"): round(float(r.total), 2) for r in rows}

    cur_cats = await _cat_totals(cur_prefix)
    prev_cats = await _cat_totals(prev_prefix)

    all_cat_names = sorted(set(cur_cats) | set(prev_cats))
    category_breakdown = [
        CategoryRow(
            name=c,
            value=cur_cats.get(c, 0.0),
            prev_value=prev_cats.get(c) if c in prev_cats else None,
        )
        for c in all_cat_names
    ]

    monthly_trend: list[MonthlyRow] = []
    for i in range(5, -1, -1):
        d = today.replace(day=1) - timedelta(days=30 * i)
        m_prefix = f"{d.year:04d}-{d.month:02d}"
        m_start, m_end = prefix_date_range(m_prefix)
        row = await db.execute(
            select(func.sum(Transaction.amount).label("total"))
            .where(
                Transaction.user_id == current_user.id,
                Transaction.date >= m_start,
                Transaction.date < m_end,
            )
        )
        expenses = round(float(row.scalar() or 0), 2)
        income = 0.0
        si = (current_user.settings or {}).get("monthly_income")
        if si:
            try:
                income = float(si)
            except (TypeError, ValueError):
                pass
        elif current_user.monthly_budget_inr:
            income = float(current_user.monthly_budget_inr)
        monthly_trend.append(
            MonthlyRow(month=f"{d.year:04d}-{d.month:02d}", income=round(income, 2), expenses=expenses)
        )

    resp = AnalyticsOverview(category_breakdown=category_breakdown, monthly_trend=monthly_trend)
    await cache_set(cache_key, resp.model_dump(), ttl=300)
    return resp


class MonthlySummaryOut(BaseModel):
    month: int
    year: int
    total_income: float
    total_expenses: float
    category_breakdown: dict[str, float]
    top_places: dict[str, float]


@router.get("/summary", response_model=MonthlySummaryOut)
async def get_monthly_summary(
    current_user: CurrentUser,
    db: DB,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
) -> MonthlySummaryOut:
    """Calculate aggregated transactions for the given month.

    Only counts transactions to avoid double-counting — bills that
    auto-create expenses already produce a transaction with source='bill'.
    Unpaid bills are excluded from the expense total.
    """
    d_start, d_end = month_date_range(year, month)

    # Aggregate expenses by category in SQL
    cat_result = await db.execute(
        select(
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.date >= d_start,
            Transaction.date < d_end,
        )
        .group_by(Transaction.category)
    )

    total_expenses = 0.0
    categories: dict[str, float] = {}
    for row in cat_result:
        cat = row.category or "Uncategorized"
        amount = float(row.total)
        categories[cat] = round(amount, 2)
        total_expenses += amount

    # Add unpaid bills that don't have a corresponding transaction yet
    unpaid_bills = await db.execute(
        select(Bill).where(
            Bill.user_id == current_user.id,
            Bill.due_date >= d_start,
            Bill.due_date < d_end,
            Bill.is_paid.is_(False),
        )
    )
    for b in unpaid_bills.scalars().all():
        total_expenses += b.amount
        cat = b.category or "Uncategorized"
        categories[cat] = round(categories.get(cat, 0.0) + b.amount, 2)

    # Top 5 merchants by spend (SQL aggregation)
    place_result = await db.execute(
        select(
            Transaction.merchant,
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.date >= d_start,
            Transaction.date < d_end,
            Transaction.merchant.isnot(None),
        )
        .group_by(Transaction.merchant)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(5)
    )
    top_places_dict = {r.merchant: round(float(r.total), 2) for r in place_result}

    # Income from user settings
    total_income = 0.0
    settings_income = (current_user.settings or {}).get("monthly_income")
    if settings_income:
        try:
            total_income = float(settings_income)
        except (TypeError, ValueError):
            total_income = 0.0
    elif current_user.monthly_budget_inr:
        total_income = float(current_user.monthly_budget_inr)

    return MonthlySummaryOut(
        month=month,
        year=year,
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        category_breakdown=categories,
        top_places=top_places_dict,
    )


@router.get("/report")
async def monthly_report_html(
    current_user: CurrentUser,
    db: DB,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
) -> Any:
    """Return a printable HTML monthly finance report (zero new dependencies).

    The browser can use File > Print > Save as PDF to produce a PDF.
    """
    from fastapi.responses import HTMLResponse

    d_start, d_end = month_date_range(year, month)
    month_label = f"{year:04d}-{month:02d}"

    # Category breakdown
    cat_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.user_id == current_user.id,
            Transaction.date >= d_start,
            Transaction.date < d_end,
            Transaction.type == "expense",
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
    )
    categories: dict[str, float] = {}
    total_expenses = 0.0
    for row in cat_result:
        cat = row.category or "Uncategorized"
        val = round(float(row.total), 2)
        categories[cat] = val
        total_expenses += val

    # Income
    total_income = 0.0
    settings_income = (current_user.settings or {}).get("monthly_income")
    if settings_income:
        try:
            total_income = float(settings_income)
        except (TypeError, ValueError):
            pass
    elif current_user.monthly_budget_inr:
        total_income = float(current_user.monthly_budget_inr)

    net = round(total_income - total_expenses, 2)
    savings_rate = round((net / total_income * 100), 1) if total_income > 0 else 0.0

    # Top merchants
    merchant_result = await db.execute(
        select(Transaction.merchant, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.user_id == current_user.id,
            Transaction.date >= d_start,
            Transaction.date < d_end,
            Transaction.type == "expense",
            Transaction.merchant.isnot(None),
        )
        .group_by(Transaction.merchant)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(5)
    )
    top_merchants = [
        (r.merchant, round(float(r.total), 2)) for r in merchant_result
    ]

    # Build bar chart widths (relative to max category)
    max_val = max(categories.values()) if categories else 1.0
    cat_rows = "".join(
        f"""<tr>
          <td style="padding:4px 8px;width:180px">{cat}</td>
          <td style="padding:4px 8px">
            <div style="background:#4f46e5;height:16px;border-radius:3px;display:inline-block;
                 width:{round(val/max_val*300)}px"></div>
            <span style="margin-left:8px">₹{val:,.2f}</span>
          </td>
        </tr>"""
        for cat, val in categories.items()
    )
    merchant_rows = "".join(
        f"<tr><td style='padding:3px 8px'>{m}</td><td style='padding:3px 8px;text-align:right'>₹{v:,.2f}</td></tr>"
        for m, v in top_merchants
    )

    name = current_user.full_name or current_user.email
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Finlo Monthly Report — {month_label}</title>
  <style>
    body{{font-family:sans-serif;margin:32px;color:#111;max-width:800px}}
    h1{{color:#4f46e5}}h2{{color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:4px}}
    table{{border-collapse:collapse;width:100%}}
    .summary{{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0}}
    .card{{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 24px;min-width:140px}}
    .card-label{{font-size:12px;color:#6b7280;text-transform:uppercase}}
    .card-value{{font-size:24px;font-weight:700;margin-top:4px}}
    .income{{color:#059669}}.expense{{color:#dc2626}}.net{{color:#4f46e5}}
    @media print{{body{{margin:8px}}}}
  </style>
</head>
<body>
  <h1>Finlo Monthly Report</h1>
  <p style="color:#6b7280">{month_label} &nbsp;·&nbsp; {name}</p>

  <div class="summary">
    <div class="card"><div class="card-label">Income</div>
      <div class="card-value income">₹{total_income:,.2f}</div></div>
    <div class="card"><div class="card-label">Expenses</div>
      <div class="card-value expense">₹{total_expenses:,.2f}</div></div>
    <div class="card"><div class="card-label">Net</div>
      <div class="card-value net">₹{net:,.2f}</div></div>
    <div class="card"><div class="card-label">Savings Rate</div>
      <div class="card-value">{savings_rate}%</div></div>
  </div>

  <h2>Spending by Category</h2>
  <table>{cat_rows}</table>

  <h2>Top Merchants</h2>
  <table><thead><tr><th style="text-align:left;padding:3px 8px">Merchant</th>
    <th style="text-align:right;padding:3px 8px">Amount</th></tr></thead>
    <tbody>{merchant_rows}</tbody></table>

  <p style="margin-top:32px;font-size:11px;color:#9ca3af">
    Generated by Finlo · {month_label} · Print this page to save as PDF
  </p>
</body>
</html>"""
    return HTMLResponse(content=html)
