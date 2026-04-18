"""Coach service: generate personalized suggestions and store feedback signals."""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Budget, Receipt, Suggestion, Transaction, User

logger = logging.getLogger(__name__)


async def _build_coach_context(user: User, db: AsyncSession) -> dict:
    """Gather recent spend, receipts, and budgets for the coach prompt."""
    today = date.today()
    thirty_days_ago = (today - timedelta(days=30)).isoformat()
    month_prefix = today.strftime("%Y-%m")

    # Recent spend by category
    spend_rows = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(Transaction.user_id == user.id, Transaction.date >= thirty_days_ago)
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(10)
    )
    recent_spend = {r.category or "Other": round(r.total, 2) for r in spend_rows}

    # Recent receipts
    receipt_rows = await db.execute(
        select(Receipt)
        .where(Receipt.user_id == user.id)
        .order_by(Receipt.created_at.desc())
        .limit(5)
    )
    recent_receipts = [
        {
            "merchant": r.merchant,
            "total": r.total,
            "date": r.date,
            "top_items": (r.items or [])[:3],
        }
        for r in receipt_rows.scalars().all()
    ]

    # Budget status
    budget_rows = await db.execute(
        select(Budget).where(Budget.user_id == user.id, Budget.month == today.month, Budget.year == today.year)
    )
    budgets = budget_rows.scalars().all()
    budget_status = []
    for b in budgets:
        spent_res = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0.0)).where(
                Transaction.user_id == user.id,
                Transaction.category == b.category,
                Transaction.date.like(f"{month_prefix}%"),
            )
        )
        spent = float(spent_res.scalar_one())
        budget_status.append({
            "category": b.category,
            "limit": b.limit_amount,
            "spent": round(spent, 2),
            "percent": round((spent / b.limit_amount * 100) if b.limit_amount else 0, 1),
        })

    # Detect recurring merchants (seen in 2+ distinct months over last 90 days)
    ninety_days_ago = (today - timedelta(days=90)).isoformat()
    recurring_rows = await db.execute(
        select(
            Transaction.merchant,
            func.count(func.distinct(func.substr(Transaction.date, 1, 7))).label("month_count"),
            func.round(func.avg(Transaction.amount), 2).label("avg_amount"),
        )
        .where(Transaction.user_id == user.id, Transaction.date >= ninety_days_ago)
        .group_by(Transaction.merchant)
        .having(func.count(func.distinct(func.substr(Transaction.date, 1, 7))) >= 2)
        .order_by(func.avg(Transaction.amount).desc())
        .limit(10)
    )
    recurring_bills = [
        {"merchant": r.merchant, "months_seen": r.month_count, "avg_amount": float(r.avg_amount)}
        for r in recurring_rows
    ]

    # User profile from settings
    settings = user.settings or {}

    return {
        "monthly_income": settings.get("monthly_income", "not specified"),
        "goals": settings.get("goals", "general savings"),
        "recent_spend": recent_spend,
        "recent_receipts": recent_receipts,
        "budget_status": budget_status,
        "recurring_bills": recurring_bills,
    }


async def _call_coach_llm(context: dict) -> Optional[dict]:
    """Call LLM with the coach prompt."""
    try:
        from openai import AsyncOpenAI

        from app.config import get_settings
        from app.services.prompts import COACH_PROMPT

        settings = get_settings()
        if not settings.LLM_PROVIDER_KEY:
            logger.warning("LLM_PROVIDER_KEY not set — returning mock coach output")
            return _mock_coach_output(context)

        client = AsyncOpenAI(
            api_key=settings.LLM_PROVIDER_KEY,
            base_url=settings.LLM_PROVIDER_BASE_URL,
        )
        prompt = COACH_PROMPT.format(
            monthly_income=context["monthly_income"],
            goals=context["goals"],
            recent_spend=json.dumps(context["recent_spend"], indent=2),
            recent_receipts=json.dumps(context["recent_receipts"], indent=2),
            budget_status=json.dumps(context["budget_status"], indent=2),
            recurring_bills=json.dumps(context.get("recurring_bills", []), indent=2),
        )

        system_msg = (
            "You are a helpful personal finance coach. Always respond with valid JSON only."
        )
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt},
        ]

        response = await client.chat.completions.create(
            model=settings.LLM_PROVIDER_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            max_tokens=800,
            temperature=0.3,
        )
        return json.loads(response.choices[0].message.content or "{}")

    except Exception as e:
        logger.error(f"Coach LLM call failed: {e}")
        return _mock_coach_output(context)


def _mock_coach_output(context: dict) -> dict:
    """Deterministic mock output when LLM key is not configured."""
    spend = context.get("recent_spend", {})
    top_cat = max(spend, key=spend.get, default="Dining & Restaurants") if spend else "Dining & Restaurants"
    top_amount = spend.get(top_cat, 150.0)
    return {
        "summary": (
            f"Your highest spending category this month is {top_cat} at ${top_amount:.2f}. "
            "There are opportunities to reduce discretionary spending."
        ),
        "actions": [
            {
                "text": f"Set a weekly budget of ${(top_amount * 0.75 / 4):.2f} for {top_cat}",
                "weekly_savings": round(top_amount * 0.25 / 4, 2),
                "rationale": f"You spent ${top_amount:.2f} on {top_cat} last month, 25% reduction is achievable.",
                "source_receipts": [],
            }
        ],
        "estimated_savings": round(top_amount * 0.25, 2),
        "confidence": 0.65,
        "sources": [f"30-day {top_cat} spend: ${top_amount:.2f}"],
    }


async def generate_suggestions(user: User, receipt: Receipt, db: AsyncSession) -> Optional[dict]:
    """Generate and persist coach suggestions after a receipt is confirmed."""
    context = await _build_coach_context(user, db)
    coach_output = await _call_coach_llm(context)
    if not coach_output:
        return None

    suggestion = Suggestion(
        user_id=user.id,
        receipt_ids=[receipt.id],
        categories=list((context.get("recent_spend") or {}).keys()),
        summary=coach_output.get("summary"),
        actions=coach_output.get("actions", []),
        estimated_savings=coach_output.get("estimated_savings"),
        confidence=coach_output.get("confidence"),
        status="pending",
    )
    db.add(suggestion)
    await db.flush()

    logger.info(f"Coach suggestion created for user={user.id}, id={suggestion.id}")
    return coach_output


async def generate_suggestions_background(user_id: str, db: AsyncSession) -> None:
    """Entrypoint for background worker to regenerate suggestions on demand."""
    from sqlalchemy import select as _select
    result = await db.execute(_select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    # Get latest receipt
    receipt_result = await db.execute(
        _select(Receipt).where(Receipt.user_id == user_id).order_by(Receipt.created_at.desc()).limit(1)
    )
    receipt = receipt_result.scalar_one_or_none()
    if receipt:
        await generate_suggestions(user, receipt, db)
