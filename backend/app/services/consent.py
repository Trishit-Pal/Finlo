"""Consent management for transaction ingestion and sensitive integrations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UserConsent

CONSENT_STATUSES = {"granted", "revoked"}


async def upsert_user_consent(
    db: AsyncSession,
    *,
    user_id: str,
    consent_type: str,
    scope: str = "transactions",
    status: str = "granted",
    metadata: Optional[dict] = None,
) -> UserConsent:
    if status not in CONSENT_STATUSES:
        raise ValueError("Invalid consent status")

    result = await db.execute(
        select(UserConsent).where(
            UserConsent.user_id == user_id,
            UserConsent.consent_type == consent_type,
            UserConsent.scope == scope,
        )
    )
    consent = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if consent is None:
        consent = UserConsent(
            user_id=user_id,
            consent_type=consent_type,
            scope=scope,
            status=status,
            metadata_=metadata or {},
            granted_at=now if status == "granted" else None,
            revoked_at=now if status == "revoked" else None,
        )
        db.add(consent)
    else:
        consent.status = status
        if metadata is not None:
            consent.metadata_ = metadata
        if status == "granted":
            consent.granted_at = now
            consent.revoked_at = None
        else:
            consent.revoked_at = now
        db.add(consent)

    await db.flush()
    return consent


async def has_active_consent(
    db: AsyncSession,
    *,
    user_id: str,
    consent_type: str,
    scope: str = "transactions",
) -> bool:
    result = await db.execute(
        select(UserConsent).where(
            UserConsent.user_id == user_id,
            UserConsent.consent_type == consent_type,
            UserConsent.scope == scope,
            UserConsent.status == "granted",
        )
    )
    return result.scalar_one_or_none() is not None
