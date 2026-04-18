"""Rule-based insights engine — deterministic, no external API dependency.

Generates financial insights from user transaction data using simple
heuristics: category concentration, spending spikes, budget overruns,
uncategorized ratio, recurring charge detection, and savings rate.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Budget, Insight, Transaction

logger = logging.getLogger(__name__)


def _month_prefix(d: date) -> str:
    return d.strftime("%Y-%m")


async def generate_insights(db: AsyncSession, user_id: str) -> list[dict]:
    """Compute and persist rule-based insights for the current user.
    Returns a list of newly created insight dicts."""

    today = date.today()
    current_prefix = _month_prefix(today)

    # Gather last 4 months of data for comparison
    months = []
    for offset in range(4):
        d = today.replace(day=1) - timedelta(days=offset * 28)
        months.append(_month_prefix(d))
    months = list(dict.fromkeys(months))  # dedupe, preserve order

    # ── Fetch all transactions for these months ───────────────────────────
    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.date >= f"{months[-1]}-01",
        )
        .order_by(Transaction.date)
    )
    all_txns = result.scalars().all()

    # Bucket by month prefix
    monthly: dict[str, list] = defaultdict(list)
    for t in all_txns:
        prefix = t.date[:7]
        monthly[prefix].append(t)

    current_txns = monthly.get(current_prefix, [])
    prev_months = [m for m in months if m != current_prefix and monthly.get(m)]

    insights: list[dict] = []

    # ── 1. Spending spike per category vs 3-month avg ─────────────────────
    if prev_months:
        curr_cats: dict[str, float] = defaultdict(float)
        for t in current_txns:
            if t.type != "income":
                curr_cats[t.category or "Uncategorized"] += t.amount

        hist_cats: dict[str, list[float]] = defaultdict(list)
        for m in prev_months:
            month_cats: dict[str, float] = defaultdict(float)
            for t in monthly[m]:
                if t.type != "income":
                    month_cats[t.category or "Uncategorized"] += t.amount
            for cat, amt in month_cats.items():
                hist_cats[cat].append(amt)

        for cat, curr_total in curr_cats.items():
            hist_vals = hist_cats.get(cat, [])
            if not hist_vals:
                continue
            avg = sum(hist_vals) / len(hist_vals)
            if avg > 0 and curr_total > avg * 1.25:
                pct_change = round(((curr_total - avg) / avg) * 100)
                insights.append(
                    {
                        "type": "spending_spike",
                        "severity": "warning" if pct_change < 50 else "critical",
                        "title": f"{cat} spending is up {pct_change}% this month",
                        "explanation": (
                            f"You spent {_fmt(curr_total)} on "
                            f"{cat} this month vs a "
                            f"{len(hist_vals)}-month avg of "
                            f"{_fmt(avg)}."
                        ),
                        "recommendation": (
                            f"Review your {cat} expenses "
                            f"to identify unusual charges."
                        ),
                        "metric_basis": {
                            "category": cat,
                            "current": curr_total,
                            "average": round(avg, 2),
                            "pct_change": pct_change,
                        },
                    }
                )

    # ── 2. Budget overspend warnings ──────────────────────────────────────
    budget_result = await db.execute(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.month == today.month,
            Budget.year == today.year,
        )
    )
    budgets = budget_result.scalars().all()
    for b in budgets:
        spent = sum(
            t.amount
            for t in current_txns
            if (t.category or "Uncategorized") == b.category and t.type != "income"
        )
        if b.limit_amount > 0 and spent > b.limit_amount:
            over_pct = round(((spent - b.limit_amount) / b.limit_amount) * 100)
            insights.append(
                {
                    "type": "budget_risk",
                    "severity": "critical",
                    "title": f"Budget exceeded for {b.category} by {over_pct}%",
                    "explanation": (
                        f"You set a limit of "
                        f"{_fmt(b.limit_amount)} for "
                        f"{b.category} but spent "
                        f"{_fmt(spent)}."
                    ),
                    "recommendation": (
                        f"Reduce {b.category} spending "
                        f"or adjust your budget."
                    ),
                    "metric_basis": {
                        "category": b.category,
                        "limit": b.limit_amount,
                        "spent": round(spent, 2),
                        "over_pct": over_pct,
                    },
                }
            )
        elif b.limit_amount > 0 and spent > b.limit_amount * 0.8:
            used_pct = round((spent / b.limit_amount) * 100)
            insights.append(
                {
                    "type": "budget_risk",
                    "severity": "warning",
                    "title": f"{b.category} budget is {used_pct}% used",
                    "explanation": (
                        f"You've used {_fmt(spent)} of your "
                        f"{_fmt(b.limit_amount)} "
                        f"{b.category} budget."
                    ),
                    "recommendation": (
                        f"Pace your {b.category} spending "
                        f"for the remaining days."
                    ),
                    "metric_basis": {
                        "category": b.category,
                        "limit": b.limit_amount,
                        "spent": round(spent, 2),
                        "used_pct": used_pct,
                    },
                }
            )

    # ── 3. Category concentration ─────────────────────────────────────────
    total_expense = sum(t.amount for t in current_txns if t.type != "income")
    if total_expense > 0:
        cat_totals: dict[str, float] = defaultdict(float)
        for t in current_txns:
            if t.type != "income":
                cat_totals[t.category or "Uncategorized"] += t.amount
        sorted_cats = sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)
        top3 = sorted_cats[:3]
        top3_total = sum(v for _, v in top3)
        top3_pct = round((top3_total / total_expense) * 100)
        if top3_pct > 60:
            labels = ", ".join(c for c, _ in top3)
            insights.append(
                {
                    "type": "spending_spike",
                    "severity": "info",
                    "title": f"Top 3 categories make up {top3_pct}% of spending",
                    "explanation": (
                        f"Spending is concentrated in "
                        f"{labels} ({_fmt(top3_total)} of "
                        f"{_fmt(total_expense)} total)."
                    ),
                    "recommendation": (
                        "Review whether these are all "
                        "essential expenses."
                    ),
                    "metric_basis": {
                        "top3": [{"cat": c, "amount": round(v, 2)} for c, v in top3],
                        "total": round(total_expense, 2),
                    },
                }
            )

    # ── 4. Uncategorized ratio ────────────────────────────────────────────
    if current_txns:
        uncat_count = sum(
            1
            for t in current_txns
            if not t.category or t.category in ("Other", "Uncategorized")
        )
        uncat_pct = round((uncat_count / len(current_txns)) * 100)
        if uncat_pct > 15:
            insights.append(
                {
                    "type": "data_quality",
                    "severity": "warning",
                    "title": f"{uncat_pct}% of transactions are uncategorized",
                    "explanation": (
                        f"{uncat_count} out of "
                        f"{len(current_txns)} transactions "
                        f"this month lack categorization."
                    ),
                    "recommendation": (
                        "Categorize transactions for "
                        "accurate trends and budgeting."
                    ),
                    "metric_basis": {
                        "uncategorized": uncat_count,
                        "total": len(current_txns),
                        "pct": uncat_pct,
                    },
                }
            )

    # ── 5. Recurring charge detection ─────────────────────────────────────
    merchant_months: dict[str, set] = defaultdict(set)
    for t in all_txns:
        if t.type != "income":
            merchant_months[t.merchant.lower().strip()].add(t.date[:7])
    for merchant, appearing_months in merchant_months.items():
        if len(appearing_months) >= 3:
            amounts = [
                t.amount
                for t in all_txns
                if t.merchant.lower().strip() == merchant and t.type != "income"
            ]
            avg_amount = sum(amounts) / len(amounts) if amounts else 0
            insights.append(
                {
                    "type": "recurring_obligation",
                    "severity": "info",
                    "title": f"Recurring charge detected: {merchant.title()}",
                    "explanation": (
                        f"'{merchant.title()}' appeared in "
                        f"{len(appearing_months)} months "
                        f"with an avg of {_fmt(avg_amount)}."
                    ),
                    "recommendation": (
                        "Verify this is expected. "
                        "Cancel if no longer needed."
                    ),
                    "metric_basis": {
                        "merchant": merchant,
                        "months": len(appearing_months),
                        "avg_amount": round(avg_amount, 2),
                    },
                }
            )

    # ── 6. Savings rate ───────────────────────────────────────────────────
    total_income = sum(t.amount for t in current_txns if t.type == "income")
    if total_income > 0 and total_expense > 0:
        savings = total_income - total_expense
        savings_rate = round((savings / total_income) * 100)
        if savings_rate < 10:
            insights.append(
                {
                    "type": "savings_opportunity",
                    "severity": "warning",
                    "title": f"Savings rate is only {savings_rate}% this month",
                    "explanation": (
                        f"Income: {_fmt(total_income)}. "
                        f"Expenses: {_fmt(total_expense)}. "
                        f"Net: {_fmt(savings)}."
                    ),
                    "recommendation": (
                        "Target saving at least 20%. "
                        "Review discretionary spending."
                    ),
                    "metric_basis": {
                        "income": round(total_income, 2),
                        "expense": round(total_expense, 2),
                        "savings_rate": savings_rate,
                    },
                }
            )
        elif savings_rate >= 30:
            insights.append(
                {
                    "type": "positive_progress",
                    "severity": "positive",
                    "title": f"Strong savings rate of {savings_rate}% this month",
                    "explanation": (
                        f"You saved {_fmt(savings)} from "
                        f"{_fmt(total_income)} income."
                    ),
                    "recommendation": (
                        "Allocate surplus to savings "
                        "goals or investments."
                    ),
                    "metric_basis": {
                        "income": round(total_income, 2),
                        "savings": round(savings, 2),
                        "savings_rate": savings_rate,
                    },
                }
            )

    # ── 7. Month-over-month total change ──────────────────────────────────
    if prev_months and total_expense > 0:
        prev = prev_months[0]
        prev_expense = sum(
            t.amount for t in monthly.get(prev, []) if t.type != "income"
        )
        if prev_expense > 0:
            mom_change = round(((total_expense - prev_expense) / prev_expense) * 100)
            if abs(mom_change) > 15:
                direction = "up" if mom_change > 0 else "down"
                sev = "warning" if mom_change > 15 else "positive"
                insights.append(
                    {
                        "type": "spending_spike"
                        if mom_change > 0
                        else "positive_progress",
                        "severity": sev,
                        "title": (
                            f"Total spending is {direction} "
                            f"{abs(mom_change)}% vs last month"
                        ),
                        "explanation": (
                            f"This month: "
                            f"{_fmt(total_expense)}. "
                            f"Last month ({prev}): "
                            f"{_fmt(prev_expense)}."
                        ),
                        "recommendation": (
                            "Review category breakdowns."
                            if mom_change > 0
                            else "Keep up the good trend."
                        ),
                        "metric_basis": {
                            "current": round(total_expense, 2),
                            "previous": round(prev_expense, 2),
                            "mom_pct": mom_change,
                        },
                    }
                )

    # ── Persist insights ──────────────────────────────────────────────────
    # Clear old insights for this user (keep last 30 days)
    cutoff = (today - timedelta(days=30)).isoformat()
    old = await db.execute(
        select(Insight).where(
            Insight.user_id == user_id,
            Insight.created_at < cutoff,
        )
    )
    for old_insight in old.scalars().all():
        await db.delete(old_insight)

    created = []
    for data in insights:
        insight = Insight(
            user_id=user_id,
            type=data["type"],
            severity=data["severity"],
            title=data["title"],
            explanation=data["explanation"],
            recommendation=data.get("recommendation"),
            metric_basis=data.get("metric_basis", {}),
        )
        db.add(insight)
        created.append(data)

    await db.flush()
    return created


def _fmt(v: float) -> str:
    """Format INR amount."""
    return f"₹{v:,.0f}"
