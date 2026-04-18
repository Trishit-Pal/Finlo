"""FastAPI dependencies: auth, DB session, admin guard."""

from __future__ import annotations

from datetime import timezone
from typing import Annotated, Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import User
from app.db.session import get_db

settings = get_settings()


def _decode_local_jwt(token: str) -> dict:
    """Decode a locally-issued access JWT (non-Supabase mode)."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc

    # Reject refresh tokens used as access tokens. Tokens minted before the
    # "type" claim was added have no type; treat those as access for backwards
    # compatibility with older sessions, but any explicit non-access type is
    # rejected.
    token_type = payload.get("type")
    if token_type is not None and token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wrong token type",
        )
    return payload


async def _decode_supabase_jwt(token: str) -> dict:
    """Decode and verify a Supabase-issued JWT.

    Requires SUPABASE_JWT_SECRET to be set explicitly; we never fall back to
    the local JWT_SECRET because that would allow locally-issued tokens to be
    accepted as Supabase tokens (cross-issuer confusion).
    """
    signing_secret = settings.SUPABASE_JWT_SECRET
    if not signing_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase auth not properly configured",
        )
    try:
        # Supabase tokens carry an `aud` claim of "authenticated"; PyJWT
        # rejects aud claims by default unless we opt out of audience check
        # or provide it explicitly. We supply the canonical Supabase aud.
        payload = jwt.decode(
            token,
            signing_secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Supabase token expired"
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Supabase token"
        ) from exc


def _token_predates_password_change(payload: dict, user: User) -> bool:
    """Return True if the token was issued before the user's latest password change.

    This lets us invalidate all outstanding access tokens immediately after a
    password reset. Requires JWTs to embed an ``iat`` claim.
    """
    if not user.password_changed_at:
        return False
    iat = payload.get("iat")
    if not iat:
        # Legacy tokens without iat are treated as stale once a password
        # change has been recorded — forces a re-login after any reset.
        return True
    pw_changed_epoch = int(
        user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
    )
    return int(iat) < pw_changed_epoch


async def get_current_user(
    authorization: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate JWT, return the User ORM instance."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token"
        )

    token = authorization.removeprefix("Bearer ").strip()

    if settings.use_supabase:
        payload = await _decode_supabase_jwt(token)
        user_id = payload.get("sub")
        email = payload.get("email")
    else:
        payload = _decode_local_jwt(token)
        user_id = payload.get("sub")
        email = payload.get("email")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub claim"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        # Auto-provision user from Supabase JWT on first call.
        if email and settings.use_supabase:
            user = User(id=user_id, email=email, settings={})
            db.add(user)
            await db.flush()
            # Record auto-provisioning so account creations via Supabase JWT are
            # discoverable in the audit log alongside native signups.
            from app.services.audit import log_audit_event

            await log_audit_event(
                db,
                user_id=user.id,
                action="auth.user_auto_provisioned",
                resource_type="user",
                resource_id=user.id,
                metadata={"source": "supabase_jwt"},
                request=None,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
            )

    # Reject access tokens that predate a password change (session revocation).
    if not settings.use_supabase and _token_predates_password_change(payload, user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalidated. Please sign in again.",
        )

    return user


async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return current_user


async def get_cron_auth(
    x_cron_secret: Annotated[Optional[str], Header(alias="x-cron-secret")] = None,
    authorization: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Allow cron callers via X-Cron-Secret header OR a valid admin JWT.

    X-Cron-Secret is preferred for scheduler use so no long-lived JWT needs to
    be stored in cron infrastructure. Falls back to admin JWT so the endpoint
    remains callable from the dashboard during development.
    """
    cron_secret = settings.CRON_SECRET
    if cron_secret and x_cron_secret:
        if x_cron_secret == cron_secret:
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid cron secret")
    if x_cron_secret and not cron_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CRON_SECRET not configured on server",
        )
    # Fall back to admin JWT validation
    user = await get_current_user(authorization=authorization, db=db)
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(get_admin_user)]
CronAuth = Annotated[None, Depends(get_cron_auth)]
DB = Annotated[AsyncSession, Depends(get_db)]
