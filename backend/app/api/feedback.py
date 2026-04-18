"""Feedback API: collect ratings + classify + admin analytics."""

import logging
from typing import Optional

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.db.models import Feedback, Receipt, Suggestion, Transaction
from app.dependencies import DB, AdminUser, CurrentUser
from app.services.feedback_pipeline import classify_feedback

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Schemas ───────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    text: Optional[str] = Field(None, max_length=5000)
    feature_request: Optional[str] = Field(None, max_length=2000)
    screen: Optional[str] = Field(None, max_length=100)
    is_bug_report: bool = False
    classification: Optional[str] = Field(None, max_length=100)


class FeedbackOut(BaseModel):
    feedback_id: str
    classification: Optional[str]
    priority: Optional[str]


class AnalyticsOut(BaseModel):
    correction_rate: float
    suggestion_acceptance_rate: float
    dau_approx: int
    receipts_total: int
    feedback_volume: int
    feedback_by_classification: dict


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def create_feedback(body: FeedbackCreate, current_user: CurrentUser, db: DB) -> FeedbackOut:
    """Collect in-app feedback and run the classification pipeline."""
    feedback = Feedback(
        user_id=current_user.id,
        rating=body.rating,
        text=body.text,
        feature_request=body.feature_request,
        screen=body.screen,
        is_bug_report=body.is_bug_report,
        classification=body.classification,
    )
    db.add(feedback)
    await db.flush()

    # Classify asynchronously (best-effort)
    try:
        result = await classify_feedback(body.text or "", body.feature_request or "", rating=body.rating)
        feedback.classification = result.get("classification")
        feedback.top_improvements = result.get("top_improvements", [])
        feedback.priority = result.get("priority")
        feedback.processed = True
        db.add(feedback)
        await db.flush()
    except Exception as exc:
        logger.warning("Feedback classification failed for feedback_id=%s: %s", feedback.id, exc)

    return FeedbackOut(
        feedback_id=feedback.id,
        classification=feedback.classification,
        priority=feedback.priority,
    )


@router.get("/admin/analytics", response_model=AnalyticsOut)
async def admin_analytics(admin: AdminUser, db: DB) -> AnalyticsOut:
    """Admin-only: correction rate, suggestion acceptance rate, DAU, receipts."""
    # Correction rate: receipts with status "confirmed" whose items were edited
    # Approximated as ratio of confirmed receipts to total
    total_receipts = (await db.execute(select(func.count(Receipt.id)))).scalar_one()
    confirmed_query = select(func.count(Receipt.id)).where(Receipt.status == "confirmed")
    confirmed_receipts = (await db.execute(confirmed_query)).scalar_one()
    correction_rate = round((confirmed_receipts / total_receipts * 100) if total_receipts else 0.0, 1)

    # Suggestion acceptance rate
    total_responded_query = select(func.count(Suggestion.id)).where(Suggestion.status != "pending")
    total_responded = (await db.execute(total_responded_query)).scalar_one()
    accepted_query = select(func.count(Suggestion.id)).where(Suggestion.status == "accepted")
    accepted = (await db.execute(accepted_query)).scalar_one()
    acceptance_rate = round((accepted / total_responded * 100) if total_responded else 0.0, 1)

    # DAU (distinct users with a transaction today)
    from datetime import date
    today = date.today().isoformat()
    dau_query = select(func.count(func.distinct(Transaction.user_id))).where(Transaction.date == today)
    dau = (await db.execute(dau_query)).scalar_one()

    # Feedback stats
    feedback_vol = (await db.execute(select(func.count(Feedback.id)))).scalar_one()
    fb_by_class_select = select(Feedback.classification, func.count(Feedback.id)).group_by(Feedback.classification)
    fb_by_class_rows = await db.execute(fb_by_class_select)
    fb_by_class = {r.classification or "unclassified": r[1] for r in fb_by_class_rows}

    return AnalyticsOut(
        correction_rate=correction_rate,
        suggestion_acceptance_rate=acceptance_rate,
        dau_approx=dau,
        receipts_total=total_receipts,
        feedback_volume=feedback_vol,
        feedback_by_classification=fb_by_class,
    )
