"""FastAPI dependencies: auth, DB session, admin guard."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import User
from app.db.session import get_db

settings = get_settings()


def _decode_local_jwt(token: str) -> dict:
    """Decode a locally-issued JWT (non-Supabase mode)."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


async def _decode_supabase_jwt(token: str) -> dict:
    """Decode and verify a Supabase-issued JWT."""
    signing_secret = settings.SUPABASE_JWT_SECRET or settings.JWT_SECRET
    try:
        payload = jwt.decode(token, signing_secret, algorithms=["HS256"])
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Supabase token") from exc


async def get_current_user(
    authorization: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate JWT, return the User ORM instance."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub claim")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        # Auto-provision user from Supabase JWT on first call
        if email:
            user = User(id=user_id, email=email, settings={})
            db.add(user)
            await db.flush()
        else:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(get_admin_user)]
DB = Annotated[AsyncSession, Depends(get_db)]
