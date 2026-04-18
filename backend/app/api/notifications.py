"""Notifications API: list, mark-read, bill-reminder dispatch."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import select, update

from app.api.exceptions import ResourceNotFound
from app.db.models import Bill, Notification
from app.dependencies import DB, CurrentUser

router = APIRouter()


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    message: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    current_user: CurrentUser,
    db: DB,
    unread_only: bool = False,
    limit: int = 50,
) -> list[NotificationOut]:
    q = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))
    q = q.order_by(Notification.created_at.desc()).limit(min(limit, 100))
    result = await db.execute(q)
    return [NotificationOut.model_validate(n) for n in result.scalars().all()]


@router.get("/unread-count")
async def unread_count(current_user: CurrentUser, db: DB) -> dict:
    from sqlalchemy import func

    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    )
    return {"count": int(result.scalar_one() or 0)}


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: str, current_user: CurrentUser, db: DB
) -> NotificationOut:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise ResourceNotFound("Notification")
    notif.is_read = True
    db.add(notif)
    await db.flush()
    return NotificationOut.model_validate(notif)


@router.post("/mark-all-read", status_code=status.HTTP_200_OK)
async def mark_all_read(current_user: CurrentUser, db: DB) -> dict:
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.flush()
    return {"detail": "All notifications marked as read"}


async def dispatch_bill_reminders(db: DB, user_id: str) -> int:
    """Create notifications for unpaid bills due within their reminder window.

    Returns the number of new notifications created. Dedup key is
    (user_id, "bill_due", bill_id) so each bill only fires one reminder
    per due-date cycle.
    """
    today = date.today()
    bills_result = await db.execute(
        select(Bill).where(
            Bill.user_id == user_id,
            Bill.is_paid.is_(False),
        )
    )
    bills = bills_result.scalars().all()
    created = 0

    for bill in bills:
        try:
            due = date.fromisoformat(bill.due_date)
        except (ValueError, TypeError):
            continue

        days_until = (due - today).days
        if days_until < 0 or days_until > bill.reminder_lead_days:
            continue

        existing = await db.execute(
            select(Notification.id).where(
                Notification.user_id == user_id,
                Notification.type == "bill_due",
                Notification.resource_id == bill.id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        if days_until == 0:
            title = f"{bill.name} is due today"
        elif days_until == 1:
            title = f"{bill.name} is due tomorrow"
        else:
            title = f"{bill.name} is due in {days_until} days"

        db.add(
            Notification(
                user_id=user_id,
                type="bill_due",
                title=title,
                message=f"Amount: {bill.amount:.2f}",
                resource_type="bill",
                resource_id=bill.id,
            )
        )
        created += 1

    if created:
        await db.flush()
    return created
