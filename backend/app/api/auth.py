"""Auth API: signup, signin, Google OAuth, password reset, me."""

import hashlib
import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request, status
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import delete, func, select

from app.api.exceptions import (
    EmailAlreadyRegistered,
    InvalidCredentials,
    ResourceConflict,
)
from app.config import get_settings
from app.db.models import LoginAttempt, OTPToken, RefreshToken, User
from app.dependencies import DB, CurrentUser
from app.services.audit import log_audit_event
from app.services.encryption import compute_blind_index, decrypt_value, encrypt_value
from app.services.http_client import get_http_client
from app.services.http_retry import http_request_with_retry
from app.services.otp_provider import get_otp_provider

# ── Security constants ──────────────────────────────────────────────────────
# Failed-signin lockout: block an email after N failures in WINDOW.
SIGNIN_LOCKOUT_THRESHOLD = 5
SIGNIN_LOCKOUT_WINDOW_MINUTES = 15
# OTP verification attempts per issued token before it is invalidated.
OTP_MAX_ATTEMPTS = 5

# Upstream auth-provider HTTP timeout: fail fast rather than hang user requests.
_AUTH_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

settings = get_settings()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)


# ── Pydantic schemas ─────────────────────────────────────────────────────────


def _validate_password_strength(password: str) -> str:
    """Enforce strong password policy."""
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters")
    if len(password) > 128:
        raise ValueError("Password must be at most 128 characters")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r"[^a-zA-Z0-9]", password):
        raise ValueError("Password must contain at least one special character")
    # Reject passwords that are just the email prefix or obvious repeats.
    if re.fullmatch(r"(.)\1+", password):
        raise ValueError("Password cannot be a single repeated character")
    return password


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=12, max_length=128)
    full_name: Optional[str] = Field(None, max_length=200)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class SigninRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class GoogleOAuthRequest(BaseModel):
    id_token: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr


class UserProfile(BaseModel):
    username: Optional[str] = None
    username_source: Optional[str] = None
    date_of_birth: Optional[str] = None
    date_of_birth_source: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    mobile_number: Optional[str] = None
    monthly_budget_inr: Optional[float] = None
    is_username_editable: bool = True
    is_date_of_birth_editable: bool = True


class UserProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: Optional[str] = Field(None, min_length=3, max_length=64)
    date_of_birth: Optional[str] = Field(None, max_length=10)
    city: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = Field(None, max_length=500)
    country: Optional[str] = Field(None, max_length=100)
    mobile_number: Optional[str] = Field(None, max_length=20)
    monthly_budget_inr: Optional[float] = Field(None, ge=0, le=100_000_000)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        cleaned = v.strip()
        if not cleaned:
            return None
        if not re.fullmatch(r"[A-Za-z0-9_.\- ]{3,64}", cleaned):
            raise ValueError(
                "Username may only contain letters, numbers, "
                "spaces, dot, underscore, or hyphen"
            )
        return cleaned


class UpdateMeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = Field(None, max_length=200)
    profile: Optional[UserProfileUpdate] = None
    settings: Optional[dict[str, object]] = None

    @field_validator("settings")
    @classmethod
    def limit_settings_size(cls, v: dict | None) -> dict | None:
        if v is not None and len(v) > 50:
            raise ValueError("Settings cannot have more than 50 keys")
        return v


class UserOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    avatar_url: Optional[str]
    oauth_provider: Optional[str]
    settings: Optional[dict]
    profile: Optional[UserProfile] = None
    city: Optional[str] = None
    currency: Optional[str] = "INR"
    created_at: datetime

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):
        # We need to extract the profile fields from the flat ORM object
        if (
            hasattr(obj, "date_of_birth")
            or hasattr(obj, "country")
            or hasattr(obj, "mobile_number")
        ):
            profile = UserProfile(
                username=getattr(obj, "username", None),
                username_source=getattr(obj, "username_source", None),
                date_of_birth=getattr(obj, "date_of_birth", None),
                date_of_birth_source=getattr(obj, "date_of_birth_source", None),
                city=getattr(obj, "city", None),
                address=getattr(obj, "address", None),
                country=getattr(obj, "country", None),
                mobile_number=decrypt_value(getattr(obj, "mobile_number", None)),
                monthly_budget_inr=getattr(obj, "monthly_budget_inr", None),
                is_username_editable=getattr(obj, "username", None) is None,
                is_date_of_birth_editable=getattr(obj, "date_of_birth", None) is None,
            )
            # convert ORM object to dict essentially
            res = super().model_validate(obj, *args, **kwargs)
            res.profile = profile
            return res
        return super().model_validate(obj, *args, **kwargs)

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut

    # Keep backward-compat alias for frontend migration
    @property
    def jwt(self) -> str:
        return self.access_token


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_access_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "iat": now,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _create_refresh_token(user_id: str, email: str, jti: str) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_REFRESH_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "iat": now,
        "type": "refresh",
        "jti": jti,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, expire


async def _issue_token_pair(
    db: DB,
    *,
    user_id: str,
    email: str,
    family_id: Optional[str] = None,
) -> tuple[str, str]:
    """Issue access+refresh, persist refresh JTI for rotation tracking.

    ``family_id`` groups rotated refresh tokens. Replaying a revoked token
    within a family triggers a cascade revocation (token-theft response).
    """
    jti = uuid.uuid4().hex
    family = family_id or uuid.uuid4().hex
    refresh_token_value, expires_at = _create_refresh_token(user_id, email, jti)
    db.add(
        RefreshToken(
            user_id=user_id,
            jti=jti,
            family_id=family,
            expires_at=expires_at,
        )
    )
    await db.flush()
    return _create_access_token(user_id, email), refresh_token_value


def _hash_identifier(value: str) -> str:
    """Stable HMAC-like hash for storing attempt/lockout identifiers."""
    normalized = (value or "").strip().lower()
    secret = settings.JWT_SECRET.encode()
    return hashlib.sha256(secret + normalized.encode("utf-8")).hexdigest()


async def _check_signin_lockout(db: DB, *, email: str, ip: Optional[str]) -> None:
    """Raise 429 if too many failed attempts in the lockout window."""
    window_start = datetime.now(timezone.utc) - timedelta(
        minutes=SIGNIN_LOCKOUT_WINDOW_MINUTES
    )
    email_hash = _hash_identifier(email)
    result = await db.execute(
        select(func.count())
        .select_from(LoginAttempt)
        .where(
            LoginAttempt.email_hash == email_hash,
            LoginAttempt.success.is_(False),
            LoginAttempt.created_at >= window_start,
        )
    )
    failures = int(result.scalar_one() or 0)
    if failures >= SIGNIN_LOCKOUT_THRESHOLD:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Too many failed sign-in attempts. Please wait "
                f"{SIGNIN_LOCKOUT_WINDOW_MINUTES} minutes and try again."
            ),
        )


async def _record_signin_attempt(
    db: DB, *, email: str, ip: Optional[str], success: bool
) -> None:
    db.add(
        LoginAttempt(
            email_hash=_hash_identifier(email),
            ip_hash=_hash_identifier(ip) if ip else None,
            success=success,
        )
    )
    await db.flush()


async def _clear_signin_attempts(db: DB, *, email: str) -> None:
    """Clear failed-signin records on successful login."""
    await db.execute(
        delete(LoginAttempt).where(
            LoginAttempt.email_hash == _hash_identifier(email),
            LoginAttempt.success.is_(False),
        )
    )
    await db.flush()


IMMUTABLE_SOURCE_VALUES = {"manual", "google", "migration", "admin"}


def _resolve_profile_source(source: Optional[str], default: str = "manual") -> str:
    candidate = (source or default).strip().lower()
    return candidate if candidate in IMMUTABLE_SOURCE_VALUES else default


def _set_immutable_field(
    *,
    current_value: Optional[str],
    new_value: Optional[str],
    field_name: str,
    created_at: Optional[datetime] = None,
) -> Optional[str]:
    value = (new_value or "").strip()
    if not value:
        return current_value

    # 24-hour grace period for corrections
    is_grace_period = False
    if created_at:
        now = datetime.now(timezone.utc)
        if (now - created_at.replace(tzinfo=timezone.utc)) < timedelta(hours=24):
            is_grace_period = True

    if current_value and current_value != value and not is_grace_period:
        raise ResourceConflict(f"{field_name} is immutable after 24-hour grace period")
    return value if value else current_value


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post(
    "/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("10/minute")
async def signup(request: Request, body: SignupRequest, db: DB) -> AuthResponse:
    """Register with email + password (local JWT mode or Supabase)."""
    # Check duplicate
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise EmailAlreadyRegistered()

    username = (body.full_name or "").strip() or None

    if settings.use_supabase:
        # Delegate to Supabase Admin API
        client = get_http_client()
        resp = await http_request_with_retry(
            client,
            "POST",
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            },
            json={
                "email": body.email,
                "password": body.password,
                "email_confirm": True,
            },
            op_name="auth.supabase.admin_signup",
        )
        if resp.status_code not in (200, 201):
            _raw = resp.json().get("message", "")
            if "already registered" in _raw.lower():
                detail_msg = "An account with this email already exists"
            else:
                detail_msg = "Signup failed. Please try again."
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail_msg,
            )
        supabase_user = resp.json()
        user_id = supabase_user["id"]
        user = User(
            id=user_id,
            email=body.email,
            full_name=body.full_name,
            username=username,
            username_source="manual" if username else None,
            settings={},
        )
    else:
        # Local auth mode
        user = User(
            email=body.email,
            hashed_password=_hash_password(body.password),
            full_name=body.full_name,
            username=username,
            username_source="manual" if username else None,
            settings={},
        )

    db.add(user)
    await db.flush()
    access, refresh = await _issue_token_pair(
        db, user_id=user.id, email=user.email
    )

    await log_audit_event(
        db,
        user_id=user.id,
        action="auth.signup",
        resource_type="user",
        resource_id=user.id,
        metadata={
            "method": "email",
            "supabase": settings.use_supabase,
        },
        request=request,
    )

    return AuthResponse(
        access_token=access, refresh_token=refresh, user=UserOut.model_validate(user)
    )


@router.post("/signin", response_model=AuthResponse)
@limiter.limit("20/minute")
async def signin(request: Request, body: SigninRequest, db: DB) -> AuthResponse:
    """Sign in with email + password."""
    client_ip = request.client.host if request.client else None
    await _check_signin_lockout(db, email=body.email, ip=client_ip)

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        await _record_signin_attempt(
            db, email=body.email, ip=client_ip, success=False
        )
        raise InvalidCredentials()

    if settings.use_supabase:
        # Verify via Supabase
        client = get_http_client()
        resp = await http_request_with_retry(
            client,
            "POST",
            f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
            },
            json={
                "email": body.email,
                "password": body.password,
            },
            op_name="auth.supabase.signin",
        )
        if resp.status_code != 200:
            await _record_signin_attempt(
                db, email=body.email, ip=client_ip, success=False
            )
            raise InvalidCredentials()
        supabase_data = resp.json()
        supabase_access = supabase_data.get("access_token", "")
        supabase_refresh = supabase_data.get("refresh_token", "")
        await _clear_signin_attempts(db, email=body.email)
        return AuthResponse(
            access_token=supabase_access,
            refresh_token=supabase_refresh,
            user=UserOut.model_validate(user),
        )
    else:
        if not user.hashed_password or not _verify_password(
            body.password, user.hashed_password
        ):
            await _record_signin_attempt(
                db, email=body.email, ip=client_ip, success=False
            )
            raise InvalidCredentials()
        access, refresh = await _issue_token_pair(
            db, user_id=user.id, email=user.email
        )
        await _clear_signin_attempts(db, email=body.email)

        await log_audit_event(
            db,
            user_id=user.id,
            action="auth.signin",
            resource_type="user",
            resource_id=user.id,
            metadata={
                "method": "email",
            },
            request=request,
        )

        return AuthResponse(
            access_token=access,
            refresh_token=refresh,
            user=UserOut.model_validate(user),
        )


@router.post("/oauth/google", response_model=AuthResponse)
@limiter.limit("10/minute")
async def google_oauth(
    request: Request, body: GoogleOAuthRequest, db: DB
) -> AuthResponse:
    """Exchange Google id_token for app JWT."""
    # Verify Google token
    client = get_http_client()
    resp = await http_request_with_retry(
        client,
        "GET",
        "https://oauth2.googleapis.com/tokeninfo",
        params={"id_token": body.id_token},
        op_name="auth.google.tokeninfo",
    )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token"
        )

    google_data = resp.json()
    email = google_data.get("email")
    google_sub = google_data.get("sub")
    token_aud = google_data.get("aud")
    full_name = google_data.get("name")
    avatar_url = google_data.get("picture")

    if not email or not google_sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing email in Google token",
        )
    if not settings.OAUTH_GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth client is not configured",
        )
    if token_aud != settings.OAUTH_GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token audience mismatch",
        )

    # Upsert user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            oauth_provider="google",
            oauth_sub=google_sub,
            full_name=full_name,
            username=(full_name.strip()[:64] if full_name else None),
            username_source=("google" if full_name else None),
            avatar_url=avatar_url,
            settings={},
        )
        db.add(user)
        await db.flush()
    elif not user.oauth_sub:
        user.oauth_sub = google_sub
        user.oauth_provider = "google"
        if not user.username and full_name:
            user.username = full_name.strip()[:64]
            user.username_source = "google"

    access, refresh = await _issue_token_pair(
        db, user_id=user.id, email=user.email
    )

    await log_audit_event(
        db,
        user_id=user.id,
        action="auth.oauth_login",
        resource_type="user",
        resource_id=user.id,
        metadata={
            "provider": "google",
            "new_user": not user.oauth_sub,
        },
        request=request,
    )

    return AuthResponse(
        access_token=access, refresh_token=refresh, user=UserOut.model_validate(user)
    )


class OAuthCallbackRequest(BaseModel):
    provider: str
    access_token: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    date_of_birth: Optional[str] = None


async def _fetch_supabase_user(access_token: str) -> dict:
    if not settings.use_supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OAuth callback requires Supabase auth configuration",
        )

    client = get_http_client()
    resp = await http_request_with_retry(
        client,
        "GET",
        f"{settings.SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": settings.SUPABASE_ANON_KEY or "",
            "Authorization": f"Bearer {access_token}",
        },
        op_name="auth.supabase.fetch_user",
    )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OAuth access token",
        )
    return resp.json()


@router.post("/oauth/callback", response_model=AuthResponse)
@limiter.limit("10/minute")
async def oauth_callback(
    request: Request, body: OAuthCallbackRequest, db: DB
) -> AuthResponse:
    """Exchange a Supabase OAuth session for app JWT. Creates user if needed."""
    provider = body.provider.strip().lower()
    supabase_user = await _fetch_supabase_user(body.access_token)
    token_email = supabase_user.get("email")
    user_meta = supabase_user.get("user_metadata") or {}
    app_meta = supabase_user.get("app_metadata") or {}
    token_provider = (app_meta.get("provider") or "").strip().lower()

    if not token_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required from OAuth provider",
        )
    if body.email and body.email.lower() != token_email.lower():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OAuth identity mismatch",
        )
    if provider and token_provider and provider != token_provider:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OAuth provider mismatch",
        )

    _raw_name = body.full_name or user_meta.get("full_name") or user_meta.get("name")
    full_name = _raw_name[:128] if isinstance(_raw_name, str) else None
    _raw_avatar = body.avatar_url or user_meta.get("avatar_url")
    avatar_url = _raw_avatar[:512] if isinstance(_raw_avatar, str) else None
    _raw_dob = body.date_of_birth or user_meta.get("birthdate")
    date_of_birth = _raw_dob[:10] if isinstance(_raw_dob, str) else None

    result = await db.execute(select(User).where(User.email == token_email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=token_email,
            oauth_provider=provider or token_provider or "oauth",
            oauth_sub=supabase_user.get("id"),
            full_name=full_name,
            username=(full_name.strip()[:64] if full_name else None),
            username_source=("google" if full_name else None),
            date_of_birth=date_of_birth,
            date_of_birth_source=("google" if date_of_birth else None),
            avatar_url=avatar_url,
            settings={},
        )
        db.add(user)
        await db.flush()
    else:
        if full_name and not user.full_name:
            user.full_name = full_name
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
        if not user.oauth_provider:
            user.oauth_provider = provider or token_provider or "oauth"
        if not user.oauth_sub and supabase_user.get("id"):
            user.oauth_sub = supabase_user.get("id")
        if not user.username and full_name:
            user.username = full_name.strip()[:64]
            user.username_source = "google"
        if not user.date_of_birth and date_of_birth:
            user.date_of_birth = date_of_birth
            user.date_of_birth_source = "google"
        db.add(user)
        await db.flush()

    access, refresh = await _issue_token_pair(
        db, user_id=user.id, email=user.email
    )
    return AuthResponse(
        access_token=access, refresh_token=refresh, user=UserOut.model_validate(user)
    )


@router.post("/reset-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordRequest, db: DB) -> dict:
    """Trigger password reset email."""
    if settings.use_supabase:
        client = get_http_client()
        try:
            await http_request_with_retry(
                client,
                "POST",
                f"{settings.SUPABASE_URL}/auth/v1/recover",
                headers={"apikey": settings.SUPABASE_ANON_KEY},
                json={"email": body.email},
                op_name="auth.supabase.recover",
            )
        except Exception as e:
            logger.warning(
                "auth.supabase.recover_failed",
                extra={"err": repr(e)[:200]},
            )
    # Always return 202 to avoid email enumeration
    return {"message": "If that email is registered, a reset link has been sent."}


@router.get("/me", response_model=UserOut)
async def get_me(current_user: CurrentUser) -> UserOut:
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UpdateMeRequest,
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> UserOut:
    """Update profile fields."""
    profile_source = _resolve_profile_source(
        request.headers.get("X-Profile-Source"), default="manual"
    )
    old_username = current_user.username
    old_dob = current_user.date_of_birth

    if "full_name" in body.model_fields_set:
        current_user.full_name = body.full_name

    # Handle profile fields explicitly instead of dumping into settings
    if body.profile:
        if "username" in body.profile.model_fields_set:
            next_username = _set_immutable_field(
                current_value=current_user.username,
                new_value=body.profile.username,
                field_name="username",
                created_at=current_user.created_at,
            )
            if next_username and (
                current_user.username is None or next_username != current_user.username
            ):
                current_user.username = next_username
                current_user.username_source = profile_source
        if "date_of_birth" in body.profile.model_fields_set:
            next_dob = _set_immutable_field(
                current_value=current_user.date_of_birth,
                new_value=body.profile.date_of_birth,
                field_name="date_of_birth",
                created_at=current_user.created_at,
            )
            if next_dob and (
                current_user.date_of_birth is None
                or next_dob != current_user.date_of_birth
            ):
                current_user.date_of_birth = next_dob
                current_user.date_of_birth_source = profile_source
        if "city" in body.profile.model_fields_set:
            current_user.city = body.profile.city
        if "address" in body.profile.model_fields_set:
            current_user.address = body.profile.address
        if "country" in body.profile.model_fields_set:
            current_user.country = body.profile.country
        if "mobile_number" in body.profile.model_fields_set:
            if body.profile.mobile_number:
                current_user.mobile_number = encrypt_value(body.profile.mobile_number)
                current_user.mobile_number_hash = compute_blind_index(
                    body.profile.mobile_number
                )
            else:
                current_user.mobile_number = None
                current_user.mobile_number_hash = None
        if "monthly_budget_inr" in body.profile.model_fields_set:
            current_user.monthly_budget_inr = body.profile.monthly_budget_inr

    if body.settings is not None:
        # Prevent sensitive financial values from being stored in the free-form
        # settings dict — they have dedicated encrypted columns instead.
        _BLOCKED_SETTINGS_KEYS = {"monthly_income", "income", "salary", "password"}
        filtered_settings = {
            k: v for k, v in body.settings.items() if k not in _BLOCKED_SETTINGS_KEYS
        }
        current_user.settings = {**(current_user.settings or {}), **filtered_settings}

    db.add(current_user)
    await db.flush()

    immutable_changes: dict[str, str] = {}
    if old_username is None and current_user.username:
        immutable_changes["username"] = current_user.username_source or profile_source
    if old_dob is None and current_user.date_of_birth:
        immutable_changes["date_of_birth"] = (
            current_user.date_of_birth_source or profile_source
        )

    await log_audit_event(
        db,
        user_id=current_user.id,
        action="profile.updated",
        resource_type="user",
        resource_id=current_user.id,
        metadata={
            "immutable_updates": immutable_changes,
            "source": profile_source,
        },
        request=request,
    )

    return UserOut.model_validate(current_user)


# ── Token Refresh ────────────────────────────────────────────────────────────


async def _revoke_refresh_family(db: DB, *, family_id: str) -> None:
    """Cascade-revoke every refresh token in a family (theft response)."""
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.family_id == family_id)
    )
    for row in result.scalars().all():
        row.revoked = True
        db.add(row)
    await db.flush()


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("30/minute")
async def refresh_token(request: Request, body: RefreshRequest, db: DB) -> AuthResponse:
    """Rotate refresh tokens: single-use, family-revoke on replay."""
    try:
        payload = jwt.decode(
            body.refresh_token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not a refresh token",
        )

    jti = payload.get("jti")
    user_id = payload.get("sub")
    if not jti or not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing required claims",
        )

    token_row = (
        await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    ).scalar_one_or_none()

    if token_row is None:
        # Unknown jti: could be a forgery or a token from before rotation was
        # tracked. Deny, but we cannot cascade-revoke without a family id.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown refresh token"
        )

    if token_row.revoked:
        # Replay of an already-rotated token → assume theft, nuke the family.
        await _revoke_refresh_family(db, family_id=token_row.family_id)
        await log_audit_event(
            db,
            user_id=token_row.user_id,
            action="auth.refresh_replay_detected",
            resource_type="refresh_token",
            resource_id=token_row.id,
            metadata={"family_id": token_row.family_id},
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected; all sessions revoked.",
        )

    if token_row.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired"
        )

    if token_row.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token user mismatch",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    # Reject refresh tokens minted before the user's latest password change.
    iat = payload.get("iat")
    if user.password_changed_at and (not iat or int(iat) < int(
        user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()
    )):
        await _revoke_refresh_family(db, family_id=token_row.family_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalidated. Please sign in again.",
        )

    # Issue the next pair in the same family, then mark the presented token
    # as revoked and point rotated_to_jti at the successor.
    new_jti = uuid.uuid4().hex
    new_refresh_value, new_expires = _create_refresh_token(
        user.id, user.email, new_jti
    )
    db.add(
        RefreshToken(
            user_id=user.id,
            jti=new_jti,
            family_id=token_row.family_id,
            expires_at=new_expires,
        )
    )
    token_row.revoked = True
    token_row.rotated_to_jti = new_jti
    db.add(token_row)
    await db.flush()

    new_access = _create_access_token(user.id, user.email)

    return AuthResponse(
        access_token=new_access,
        refresh_token=new_refresh_value,
        user=UserOut.model_validate(user),
    )


# ── OTP Password Reset Routing ────────────────────────────────────────────────


class OTPRequest(BaseModel):
    mobile_number: str = Field(..., min_length=7, max_length=20)


class OTPResetRequest(BaseModel):
    mobile_number: str = Field(..., min_length=7, max_length=20)
    otp: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password_strength(v)


@router.post("/forgot-password/request-otp", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def request_otp(request: Request, body: OTPRequest, db: DB) -> dict:
    """OTP delivery system — uses HMAC blind index for O(1) lookup."""
    mobile_hash = compute_blind_index(body.mobile_number)
    result = await db.execute(
        select(User).where(User.mobile_number_hash == mobile_hash)
    )
    user = result.scalar_one_or_none()

    if not user:
        # Prevent user enumeration silently
        return {"message": "If a matching account exists, an OTP has been sent."}

    # Generate cryptographically secure 6-digit OTP
    otp_code = f"{secrets.randbelow(900000) + 100000}"

    # Store token securely hashed with blind index for O(1) lookup
    token = OTPToken(
        mobile_number=encrypt_value(body.mobile_number),
        mobile_number_hash=mobile_hash,
        otp_hash=_hash_password(otp_code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
    )
    db.add(token)
    await db.flush()

    try:
        provider = get_otp_provider()
        await provider.send_otp(body.mobile_number, otp_code)
        logger.info(
            "otp_request_sent user_id=%s provider=%s",
            user.id,
            settings.OTP_PROVIDER,
        )
        await log_audit_event(
            db,
            user_id=user.id,
            action="auth.otp_requested",
            resource_type="user",
            resource_id=user.id,
            metadata={"mobile_hash": mobile_hash},
            request=request,
        )
    except Exception as exc:
        logger.warning(
            "otp_request_delivery_failed user_id=%s provider=%s error=%s",
            user.id,
            settings.OTP_PROVIDER,
            exc,
        )

    return {"message": "If a matching account exists, an OTP has been sent."}


@router.post("/forgot-password/reset-with-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def reset_with_otp(request: Request, body: OTPResetRequest, db: DB) -> dict:
    """Validates OTP logic and overwrites user password via bcrypt hashing."""
    # Look up token by mobile blind index (O(1), no timing leak)
    mobile_hash = compute_blind_index(body.mobile_number)
    result = await db.execute(
        select(OTPToken)
        .where(
            OTPToken.used.is_(False),
            OTPToken.expires_at > datetime.now(timezone.utc),
            OTPToken.mobile_number_hash == mobile_hash,
        )
        .order_by(OTPToken.created_at.desc())
        .limit(1)
    )
    token = result.scalar_one_or_none()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP."
        )

    if token.attempts >= OTP_MAX_ATTEMPTS:
        # Already burned through the budget on an earlier request — invalidate.
        token.used = True
        db.add(token)
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP."
        )

    if not _verify_password(body.otp, token.otp_hash):
        # Track attempts so we bound the brute-force window. After
        # OTP_MAX_ATTEMPTS wrong guesses we mark the token used; until then
        # the user can retry without forcing a whole new issuance.
        token.attempts = (token.attempts or 0) + 1
        if token.attempts >= OTP_MAX_ATTEMPTS:
            token.used = True
        db.add(token)
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP."
        )

    # Match User via blind index (O(1) lookup)
    user_result = await db.execute(
        select(User).where(User.mobile_number_hash == mobile_hash)
    )
    target_user = user_result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User account not found."
        )

    # Mutate DB: mark token used, hash new password, and stamp
    # password_changed_at so outstanding access tokens are invalidated.
    now = datetime.now(timezone.utc)
    token.used = True
    target_user.hashed_password = _hash_password(body.new_password)
    target_user.password_changed_at = now
    db.add(token)
    db.add(target_user)

    # Also revoke all outstanding refresh tokens for this user — a password
    # reset must terminate every existing session.
    refresh_rows = (
        await db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == target_user.id,
                RefreshToken.revoked.is_(False),
            )
        )
    ).scalars().all()
    for row in refresh_rows:
        row.revoked = True
        db.add(row)

    await db.flush()

    await log_audit_event(
        db,
        user_id=target_user.id,
        action="auth.password_reset_otp",
        resource_type="user",
        resource_id=target_user.id,
        metadata={"success": True, "sessions_revoked": len(refresh_rows)},
        request=request,
    )

    return {"message": "Password successfully reset!"}


# ── Account Deletion ─────────────────────────────────────────────────────────


@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_account(request: Request, current_user: CurrentUser, db: DB) -> dict:
    """Permanently delete the user account and all associated data (cascades via FK)."""
    user_id = current_user.id
    await db.delete(current_user)
    await db.flush()

    await log_audit_event(
        db,
        user_id=user_id,
        action="auth.account_deleted",
        resource_type="user",
        resource_id=user_id,
        request=request,
    )

    return {"message": "Account deleted successfully"}


# ── Data Export ──────────────────────────────────────────────────────────────


@router.get("/me/export")
@limiter.limit("3/hour")
async def export_my_data(request: Request, current_user: CurrentUser, db: DB) -> dict:
    """Export all user data as JSON."""
    from app.db.models import (
        Bill,
        Budget,
        Category,
        Debt,
        Feedback,
        Receipt,
        SavingsGoal,
        Suggestion,
        Transaction,
    )

    async def _rows(model):
        result = await db.execute(select(model).where(model.user_id == current_user.id))
        rows = result.scalars().all()
        return [
            {
                c.name: getattr(r, c.name)
                for c in model.__table__.columns
                if c.name != "user_id"
            }
            for r in rows
        ]

    export_data = {
        "user": {
            "email": current_user.email,
            "full_name": current_user.full_name,
            "city": current_user.city,
            "currency": current_user.currency,
            "created_at": str(current_user.created_at),
        },
        "transactions": await _rows(Transaction),
        "receipts": await _rows(Receipt),
        "bills": await _rows(Bill),
        "budgets": await _rows(Budget),
        "debts": await _rows(Debt),
        "savings_goals": await _rows(SavingsGoal),
        "suggestions": await _rows(Suggestion),
        "feedback": await _rows(Feedback),
        "categories": await _rows(Category),
    }

    await log_audit_event(
        db,
        user_id=current_user.id,
        action="auth.data_exported",
        resource_type="user",
        resource_id=current_user.id,
        request=request,
    )

    return export_data
