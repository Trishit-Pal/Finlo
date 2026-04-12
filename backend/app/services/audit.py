"""Audit logging helpers for sensitive or compliance-relevant actions."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog

SENSITIVE_KEYS = {"password", "token", "access_token", "refresh_token", "cvv", "pan", "card_number"}


def _sanitize_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata:
        return {}

    clean: dict[str, Any] = {}
    for key, value in metadata.items():
        lower_key = key.lower()
        if lower_key in SENSITIVE_KEYS:
            clean[key] = "***"
            continue
        if isinstance(value, dict):
            clean[key] = _sanitize_metadata(value)
            continue
        clean[key] = value
    return clean


def _extract_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


async def log_audit_event(
    db: AsyncSession,
    *,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    user_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    request: Request | None = None,
) -> None:
    """Write audit row. Exceptions should not break business flow."""
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=_extract_ip(request),
            user_agent=(request.headers.get("user-agent")[:255] if request else None),
            metadata_=_sanitize_metadata(metadata),
        )
        db.add(entry)
        await db.flush()
    except Exception:
        # Audit is best-effort by design.
        return
