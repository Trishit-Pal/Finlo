"""Analytics API: monthly summary and expense tracking insights."""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.db.models import Bill, Transaction
from app.dependencies import DB, CurrentUser

router = APIRouter()


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
    year: int = Query(..., ge=2020, le=2100)
) -> MonthlySummaryOut:
    """Calculate aggregated transactions and bills for the given month."""
    month_prefix = f"{year:04d}-{month:02d}"

    # 1. Transactions (usually parsed from receipts)
    result_trx = await db.execute(
        select(Transaction).where(
            Transaction.user_id == current_user.id,
            Transaction.date.like(f"{month_prefix}%")
        )
    )
    transactions = result_trx.scalars().all()

    # 2. Bills (manual entries)
    result_bills = await db.execute(
        select(Bill).where(
            Bill.user_id == current_user.id,
            Bill.due_date.like(f"{month_prefix}%")
        )
    )
    bills = result_bills.scalars().all()

    total_income = 0.0
    total_expenses = 0.0
    categories = {}
    places = {}

    # Process transactions
    for t in transactions:
        amount = t.amount
        # Note: frontend usually uses 'amount' and sometimes 'type'.
        # If only 'amount' is present, assume it's an expense unless negative
        # or the category indicates otherwise. Receipts default to expenses.
        total_expenses += amount
        if t.category:
            categories[t.category] = categories.get(t.category, 0.0) + amount
        if t.merchant:
            places[t.merchant] = places.get(t.merchant, 0.0) + amount

    # Process bills
    for b in bills:
        amount = b.amount
        total_expenses += amount
        if b.category:
            categories[b.category] = categories.get(b.category, 0.0) + amount
        places[b.name] = places.get(b.name, 0.0) + amount

    # Grab top 5 places
    top_places_list = sorted(places.items(), key=lambda x: x[1], reverse=True)[:5]
    top_places_dict = {k: round(v, 2) for k, v in top_places_list}

    # Round categories
    categories_dict = {k: round(v, 2) for k, v in categories.items()}

    # Income comes from user-configured monthly budget (INR/base currency) or user settings
    settings_income = (current_user.settings or {}).get("monthly_income")
    if settings_income:
        total_income = float(settings_income)
    elif current_user.monthly_budget_inr:
        total_income = float(current_user.monthly_budget_inr)

    return MonthlySummaryOut(
        month=month,
        year=year,
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        category_breakdown=categories_dict,
        top_places=top_places_dict
    )
