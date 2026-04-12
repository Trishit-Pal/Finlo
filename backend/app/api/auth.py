"""Auth API: signup, signin, Google OAuth, password reset, me."""

import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select

from app.api.exceptions import (
    EmailAlreadyRegistered,
    InvalidCredentials,
    ResourceConflict,
)
from app.config import get_settings
from app.db.models import OTPToken, User
from app.dependencies import DB, CurrentUser
from app.services.audit import log_audit_event
from app.services.encryption import compute_blind_index, decrypt_value, encrypt_value
from app.services.otp_provider import get_otp_provider

settings = get_settings()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)


# ── Pydantic schemas ─────────────────────────────────────────────────────────

def _validate_password_strength(password: str) -> str:
    """Enforce strong password policy."""
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters")
    if len(password) > 128:
        raise ValueError("Password must be at most 128 characters")
    if not re.search(r"[a-zA-Z]", password):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"[0-9].*[0-9]", password):
        raise ValueError("Password must contain at least 2 digits")
    return password


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=10, max_length=128)
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
            raise ValueError("Username may only contain letters, numbers, spaces, dot, underscore, or hyphen")
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
        if hasattr(obj, 'date_of_birth') or hasattr(obj, 'country') or hasattr(obj, 'mobile_number'):
            profile = UserProfile(
                username=getattr(obj, 'username', None),
                username_source=getattr(obj, 'username_source', None),
                date_of_birth=getattr(obj, 'date_of_birth', None),
                date_of_birth_source=getattr(obj, 'date_of_birth_source', None),
                city=getattr(obj, 'city', None),
                address=getattr(obj, 'address', None),
                country=getattr(obj, 'country', None),
                mobile_number=decrypt_value(getattr(obj, 'mobile_number', None)),
                monthly_budget_inr=getattr(obj, 'monthly_budget_inr', None),
                is_username_editable=getattr(obj, 'username', None) is None,
                is_date_of_birth_editable=getattr(obj, 'date_of_birth', None) is None,
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
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _create_refresh_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_REFRESH_EXPIRE_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _create_token_pair(user_id: str, email: str) -> tuple[str, str]:
    return _create_access_token(user_id, email), _create_refresh_token(user_id, email)


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

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
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
        async with httpx.AsyncClient() as client:
            resp = await client.post(
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
            )
        if resp.status_code not in (200, 201):
            detail_msg = resp.json().get("message", "Signup failed")
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
    access, refresh = _create_token_pair(user.id, user.email)

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

    return AuthResponse(access_token=access, refresh_token=refresh, user=UserOut.model_validate(user))


@router.post("/signin", response_model=AuthResponse)
@limiter.limit("20/minute")
async def signin(request: Request, body: SigninRequest, db: DB) -> AuthResponse:
    """Sign in with email + password."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        raise InvalidCredentials()

    if settings.use_supabase:
        # Verify via Supabase
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
                headers={
                    "apikey": settings.SUPABASE_ANON_KEY,
                },
                json={
                    "email": body.email,
                    "password": body.password,
                },
            )
        if resp.status_code != 200:
            raise InvalidCredentials()
        supabase_data = resp.json()
        supabase_access = supabase_data.get("access_token", "")
        supabase_refresh = supabase_data.get("refresh_token", "")
        return AuthResponse(
            access_token=supabase_access,
            refresh_token=supabase_refresh,
            user=UserOut.model_validate(user),
        )
    else:
        if not user.hashed_password or not _verify_password(body.password, user.hashed_password):
            raise InvalidCredentials()
        access, refresh = _create_token_pair(user.id, user.email)

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

        return AuthResponse(access_token=access, refresh_token=refresh, user=UserOut.model_validate(user))


@router.post("/oauth/google", response_model=AuthResponse)
@limiter.limit("10/minute")
async def google_oauth(request: Request, body: GoogleOAuthRequest, db: DB) -> AuthResponse:
    """Exchange Google id_token for app JWT."""
    # Verify Google token
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": body.id_token},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    google_data = resp.json()
    email = google_data.get("email")
    google_sub = google_data.get("sub")
    full_name = google_data.get("name")
    avatar_url = google_data.get("picture")

    if not email or not google_sub:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing email in Google token")

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

    access, refresh = _create_token_pair(user.id, user.email)

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

    return AuthResponse(access_token=access, refresh_token=refresh, user=UserOut.model_validate(user))


class OAuthCallbackRequest(BaseModel):
    provider: str
    access_token: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    date_of_birth: Optional[str] = None


@router.post("/oauth/callback", response_model=AuthResponse)
@limiter.limit("10/minute")
async def oauth_callback(request: Request, body: OAuthCallbackRequest, db: DB) -> AuthResponse:
    """Exchange a Supabase OAuth session for app JWT. Creates user if needed."""
    if not body.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required from OAuth provider")

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=body.email,
            oauth_provider=body.provider,
            full_name=body.full_name,
            username=(body.full_name.strip()[:64] if body.full_name else None),
            username_source=("google" if body.full_name else None),
            date_of_birth=body.date_of_birth,
            date_of_birth_source=("google" if body.date_of_birth else None),
            avatar_url=body.avatar_url,
            settings={},
        )
        db.add(user)
        await db.flush()
    else:
        if body.full_name and not user.full_name:
            user.full_name = body.full_name
        if body.avatar_url and not user.avatar_url:
            user.avatar_url = body.avatar_url
        if not user.oauth_provider:
            user.oauth_provider = body.provider
        if not user.username and body.full_name:
            user.username = body.full_name.strip()[:64]
            user.username_source = "google"
        if not user.date_of_birth and body.date_of_birth:
            user.date_of_birth = body.date_of_birth
            user.date_of_birth_source = "google"
        db.add(user)
        await db.flush()

    access, refresh = _create_token_pair(user.id, user.email)
    return AuthResponse(access_token=access, refresh_token=refresh, user=UserOut.model_validate(user))


@router.post("/reset-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordRequest, db: DB) -> dict:
    """Trigger password reset email."""
    if settings.use_supabase:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.SUPABASE_URL}/auth/v1/recover",
                headers={"apikey": settings.SUPABASE_ANON_KEY},
                json={"email": body.email},
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
    profile_source = _resolve_profile_source(request.headers.get("X-Profile-Source"), default="manual")
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
            if next_username and (current_user.username is None or next_username != current_user.username):
                current_user.username = next_username
                current_user.username_source = profile_source
        if "date_of_birth" in body.profile.model_fields_set:
            next_dob = _set_immutable_field(
                current_value=current_user.date_of_birth,
                new_value=body.profile.date_of_birth,
                field_name="date_of_birth",
                created_at=current_user.created_at,
            )
            if next_dob and (current_user.date_of_birth is None or next_dob != current_user.date_of_birth):
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
                current_user.mobile_number_hash = compute_blind_index(body.profile.mobile_number)
            else:
                current_user.mobile_number = None
                current_user.mobile_number_hash = None
        if "monthly_budget_inr" in body.profile.model_fields_set:
            current_user.monthly_budget_inr = body.profile.monthly_budget_inr

    if body.settings is not None:
        current_user.settings = {**(current_user.settings or {}), **body.settings}

    db.add(current_user)
    await db.flush()

    immutable_changes: dict[str, str] = {}
    if old_username is None and current_user.username:
        immutable_changes["username"] = current_user.username_source or profile_source
    if old_dob is None and current_user.date_of_birth:
        immutable_changes["date_of_birth"] = current_user.date_of_birth_source or profile_source

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

@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("30/minute")
async def refresh_token(request: Request, body: RefreshRequest, db: DB) -> AuthResponse:
    """Exchange a valid refresh token for a new access + refresh token pair."""
    try:
        payload = jwt.decode(body.refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token is not a refresh token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub claim")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access, refresh = _create_token_pair(user.id, user.email)
    return AuthResponse(access_token=access, refresh_token=refresh, user=UserOut.model_validate(user))


# ── OTP Password Reset Routing ────────────────────────────────────────────────

class OTPRequest(BaseModel):
    mobile_number: str = Field(..., min_length=7, max_length=20)

class OTPResetRequest(BaseModel):
    mobile_number: str = Field(..., min_length=7, max_length=20)
    otp: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=10, max_length=128)

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
        select(OTPToken).where(
            OTPToken.used.is_(False),
            OTPToken.expires_at > datetime.now(timezone.utc),
            OTPToken.mobile_number_hash == mobile_hash,
        ).order_by(OTPToken.created_at.desc()).limit(1)
    )
    token = result.scalar_one_or_none()

    if not token or not _verify_password(body.otp, token.otp_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP.")

    # Match User via blind index (O(1) lookup)
    user_result = await db.execute(select(User).where(User.mobile_number_hash == mobile_hash))
    target_user = user_result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    # Mutate DB
    token.used = True
    target_user.hashed_password = _hash_password(body.new_password)
    db.add(token)
    db.add(target_user)
    await db.flush()

    await log_audit_event(
        db,
        user_id=target_user.id,
        action="auth.password_reset_otp",
        resource_type="user",
        resource_id=target_user.id,
        metadata={"success": True},
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
            {c.name: getattr(r, c.name) for c in model.__table__.columns if c.name != 'user_id'}
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
