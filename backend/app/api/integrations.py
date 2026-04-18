"""Integration and consent endpoints for transaction ingestion."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.config import get_settings
from app.db.models import UserConsent
from app.dependencies import DB, CurrentUser
from app.services.audit import log_audit_event
from app.services.consent import upsert_user_consent

settings = get_settings()
router = APIRouter(prefix="/integrations", tags=["Integrations"])


class IngestionOption(BaseModel):
    key: str
    label: str
    status: Literal["implemented", "partial", "blocked", "gated"]
    reason: str
    requires_consent: bool = True
    feature_flag: Optional[str] = None


class IngestionOptionsResponse(BaseModel):
    options: list[IngestionOption]
    security_notes: list[str]


class ConsentRequest(BaseModel):
    consent_type: Literal[
        "statement_import", "aggregator_link", "email_parse", "sms_parse"
    ]
    scope: str = Field(default="transactions", min_length=3, max_length=128)
    status: Literal["granted", "revoked"] = "granted"
    metadata: dict[str, Any] = {}


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    consent_type: str
    scope: str
    status: str
    metadata: dict[str, Any] | None = Field(default=None, alias="metadata_")
    granted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


@router.get("/transaction-ingestion/options", response_model=IngestionOptionsResponse)
async def transaction_ingestion_options(
    current_user: CurrentUser,
) -> IngestionOptionsResponse:
    options = [
        IngestionOption(
            key="statement_csv_import",
            label="Statement CSV Import",
            status="implemented",
            reason="Supported in backend with explicit consent requirement.",
        ),
        IngestionOption(
            key="statement_pdf_import",
            label="Statement PDF Import",
            status="partial",
            reason=(
                "Receipt-style PDF extraction is available; "
                "bank statement normalization varies by issuer."
            ),
        ),
        IngestionOption(
            key="bank_aggregator_sync",
            label="Bank Aggregator Sync",
            status=(
                "gated"
                if settings.FEATURE_BANK_AGGREGATOR_CONNECT
                else "blocked"
            ),
            reason=(
                "Requires provider contracts, compliance "
                "checks, and explicit user authorization."
            ),
            feature_flag="FEATURE_BANK_AGGREGATOR_CONNECT",
        ),
        IngestionOption(
            key="upi_direct_fetch",
            label="Direct UPI Feed",
            status="blocked",
            reason=(
                "No secure universal public API for direct "
                "end-user UPI pull in this stack."
            ),
        ),
        IngestionOption(
            key="email_statement_parse",
            label="Email Statement Parse",
            status=(
                "gated"
                if settings.FEATURE_EMAIL_STATEMENT_PARSE
                else "blocked"
            ),
            reason=(
                "Requires mailbox-scope consent and secure "
                "parsing pipeline hardening."
            ),
            feature_flag="FEATURE_EMAIL_STATEMENT_PARSE",
        ),
        IngestionOption(
            key="sms_parse_mobile",
            label="SMS Parse (Mobile)",
            status="partial",
            reason=(
                "Feasible on device with explicit permission; "
                "currently not wired in web backend."
            ),
        ),
    ]
    notes = [
        "CVV and full PAN storage is prohibited and not implemented.",
        "User consent must be recorded before ingestion or sync actions.",
        "High-risk integrations stay feature-flagged "
        "until compliance readiness is verified.",
    ]
    return IngestionOptionsResponse(options=options, security_notes=notes)


@router.get("/consents", response_model=list[ConsentOut])
async def list_consents(current_user: CurrentUser, db: DB) -> list[ConsentOut]:
    result = await db.execute(
        select(UserConsent)
        .where(UserConsent.user_id == current_user.id)
        .order_by(UserConsent.updated_at.desc())
    )
    return [ConsentOut.model_validate(c) for c in result.scalars().all()]


@router.post("/consents", response_model=ConsentOut)
async def upsert_consent(
    body: ConsentRequest, request: Request, current_user: CurrentUser, db: DB
) -> ConsentOut:
    consent = await upsert_user_consent(
        db,
        user_id=current_user.id,
        consent_type=body.consent_type,
        scope=body.scope,
        status=body.status,
        metadata=body.metadata,
    )
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="consent.updated",
        resource_type="consent",
        resource_id=consent.id,
        metadata={
            "consent_type": body.consent_type,
            "scope": body.scope,
            "status": body.status,
        },
        request=request,
    )
    return ConsentOut.model_validate(consent)
