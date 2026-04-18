"""Scheduled cleanup service: purge expired tokens and stale audit logs."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

logger = logging.getLogger(__name__)


async def purge_expired_tokens(db: AsyncSession) -> dict[str, int]:
    """Delete expired/revoked auth tokens and old login attempts.

    Called from the cron endpoint so it runs on the same schedule as bill
    reminder dispatch — no extra infra needed.
    """
    now = datetime.now(timezone.utc)

    from app.db.models import LoginAttempt, OTPToken, RefreshToken

    # OTP tokens: expired ones (any status) or used ones older than 24 h
    otp_result = await db.execute(
        delete(OTPToken).where(
            (OTPToken.expires_at < now)
            | (OTPToken.used.is_(True) & (OTPToken.created_at < now - timedelta(hours=24)))
        )
    )
    otp_deleted: int = otp_result.rowcount

    # Refresh tokens: revoked AND past their expiry window
    rt_result = await db.execute(
        delete(RefreshToken).where(
            RefreshToken.revoked.is_(True),
            RefreshToken.expires_at < now - timedelta(days=7),
        )
    )
    rt_deleted: int = rt_result.rowcount

    # Login attempts older than 30 days (not needed for lockout logic)
    la_result = await db.execute(
        delete(LoginAttempt).where(
            LoginAttempt.created_at < now - timedelta(days=30)
        )
    )
    la_deleted: int = la_result.rowcount

    logger.info(
        "cleanup.tokens",
        extra={
            "otp_deleted": otp_deleted,
            "refresh_deleted": rt_deleted,
            "attempts_deleted": la_deleted,
        },
    )
    return {
        "otp_deleted": otp_deleted,
        "refresh_deleted": rt_deleted,
        "attempts_deleted": la_deleted,
    }


async def purge_old_audit_logs(db: AsyncSession) -> int:
    """Delete audit log rows older than AUDIT_LOG_RETENTION_DAYS (default 90)."""
    settings = get_settings()
    retention_days: int = settings.AUDIT_LOG_RETENTION_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    from app.db.models import AuditLog

    result = await db.execute(
        delete(AuditLog).where(AuditLog.created_at < cutoff)
    )
    deleted: int = result.rowcount
    logger.info("cleanup.audit_logs", extra={"deleted": deleted, "cutoff_days": retention_days})
    return deleted
