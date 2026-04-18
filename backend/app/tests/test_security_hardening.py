"""Tests for security hardening: JWT revocation, refresh rotation, signin lockout,
OTP attempt limits, receipt idempotency, notifications, and account balance sync."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Account,
    Bill,
    LoginAttempt,
    Notification,
    OTPToken,
    RefreshToken,
    Transaction,
    User,
)
from app.tests.conftest import TEST_JWT_SECRET

# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_refresh_jwt(user: User, jti: str, expired: bool = False) -> str:
    now = datetime.now(timezone.utc)
    exp = now + (timedelta(hours=-1) if expired else timedelta(hours=24))
    return jwt.encode(
        {
            "sub": user.id,
            "email": user.email,
            "exp": exp,
            "iat": now,
            "type": "refresh",
            "jti": jti,
        },
        TEST_JWT_SECRET,
        algorithm="HS256",
    )


def _make_access_jwt_with_iat(user: User, iat: datetime) -> str:
    return jwt.encode(
        {
            "sub": user.id,
            "email": user.email,
            "exp": iat + timedelta(hours=24),
            "iat": iat,
            "type": "access",
        },
        TEST_JWT_SECRET,
        algorithm="HS256",
    )


# ── JWT token-type confusion ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_token_rejected_as_access_token(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    """Refresh JWT must not work as Authorization header."""
    jti = uuid.uuid4().hex
    refresh_jwt = _make_refresh_jwt(test_user, jti)
    client.headers["Authorization"] = f"Bearer {refresh_jwt}"
    resp = await client.get("/auth/me")
    assert resp.status_code == 401
    assert "Wrong token type" in resp.json()["detail"]


# ── Password-change token revocation ────────────────────────────────────────


@pytest.mark.asyncio
async def test_access_token_rejected_after_password_change(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    """Access tokens issued before password_changed_at must be rejected."""
    old_iat = datetime.now(timezone.utc) - timedelta(hours=2)
    test_user.password_changed_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.add(test_user)
    await db.flush()

    old_token = _make_access_jwt_with_iat(test_user, old_iat)
    client.headers["Authorization"] = f"Bearer {old_token}"
    resp = await client.get("/auth/me")
    assert resp.status_code == 401
    assert "invalidated" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_access_token_accepted_after_password_change_if_newer(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    """Access tokens issued after password change must still work."""
    test_user.password_changed_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.add(test_user)
    await db.flush()

    new_iat = datetime.now(timezone.utc)
    fresh_token = _make_access_jwt_with_iat(test_user, new_iat)
    client.headers["Authorization"] = f"Bearer {fresh_token}"
    resp = await client.get("/auth/me")
    assert resp.status_code == 200


# ── Refresh token rotation ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_rotation_issues_new_pair(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    """A valid refresh token returns new access+refresh and revokes the old one."""
    jti = uuid.uuid4().hex
    family = uuid.uuid4().hex
    db.add(
        RefreshToken(
            user_id=test_user.id,
            jti=jti,
            family_id=family,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )
    await db.flush()

    refresh_jwt = _make_refresh_jwt(test_user, jti)
    resp = await client.post("/auth/refresh", json={"refresh_token": refresh_jwt})
    assert resp.status_code == 200
    data = resp.json()
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["refresh_token"] != refresh_jwt

    old_row = (
        await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    ).scalar_one()
    assert old_row.revoked is True
    assert old_row.rotated_to_jti is not None


@pytest.mark.asyncio
async def test_refresh_replay_revokes_entire_family(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    """Replaying an already-revoked refresh token must cascade-revoke the family."""
    family = uuid.uuid4().hex
    old_jti = uuid.uuid4().hex
    new_jti = uuid.uuid4().hex
    db.add(
        RefreshToken(
            user_id=test_user.id,
            jti=old_jti,
            family_id=family,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            revoked=True,
            rotated_to_jti=new_jti,
        )
    )
    db.add(
        RefreshToken(
            user_id=test_user.id,
            jti=new_jti,
            family_id=family,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )
    await db.flush()

    old_refresh_jwt = _make_refresh_jwt(test_user, old_jti)
    resp = await client.post("/auth/refresh", json={"refresh_token": old_refresh_jwt})
    assert resp.status_code == 401
    assert "reuse" in resp.json()["detail"].lower()

    successor = (
        await db.execute(select(RefreshToken).where(RefreshToken.jti == new_jti))
    ).scalar_one()
    assert successor.revoked is True


@pytest.mark.asyncio
async def test_refresh_with_expired_token_rejected(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    jti = uuid.uuid4().hex
    db.add(
        RefreshToken(
            user_id=test_user.id,
            jti=jti,
            family_id=uuid.uuid4().hex,
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    await db.flush()

    expired_jwt = _make_refresh_jwt(test_user, jti, expired=True)
    resp = await client.post("/auth/refresh", json={"refresh_token": expired_jwt})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_unknown_jti_rejected(
    client: AsyncClient, test_user: User
):
    unknown_jwt = _make_refresh_jwt(test_user, "nonexistent-jti")
    resp = await client.post("/auth/refresh", json={"refresh_token": unknown_jwt})
    assert resp.status_code == 401
    assert "unknown" in resp.json()["detail"].lower()


# ── Signin brute-force lockout ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_signin_lockout_after_failures(client: AsyncClient, db: AsyncSession):
    """After 5 failed logins, the 6th attempt should return 429."""
    from app.api.auth import _hash_identifier

    email = "lockout@example.com"
    for _ in range(5):
        db.add(
            LoginAttempt(
                email_hash=_hash_identifier(email),
                ip_hash=None,
                success=False,
            )
        )
    await db.flush()

    resp = await client.post(
        "/auth/signin",
        json={"email": email, "password": "DoesNotMatter1!"},
    )
    assert resp.status_code == 429
    assert "too many" in resp.json()["detail"].lower()


# ── OTP attempt limits ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_otp_max_attempts_invalidates_token(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    """After OTP_MAX_ATTEMPTS wrong guesses the token should be marked used."""
    from passlib.context import CryptContext

    from app.services.encryption import compute_blind_index, encrypt_value

    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    mobile = "+15551234567"
    test_user.mobile_number = encrypt_value(mobile)
    test_user.mobile_number_hash = compute_blind_index(mobile)
    test_user.hashed_password = pwd.hash("OriginalPass123!")
    db.add(test_user)
    await db.flush()

    otp_token = OTPToken(
        mobile_number=encrypt_value(mobile),
        mobile_number_hash=compute_blind_index(mobile),
        otp_hash=pwd.hash("123456"),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        attempts=4,
    )
    db.add(otp_token)
    await db.flush()

    resp = await client.post(
        "/auth/forgot-password/reset-with-otp",
        json={
            "mobile_number": mobile,
            "otp": "000000",
            "new_password": "NewSecurePass1!",
        },
    )
    assert resp.status_code == 400

    await db.refresh(otp_token)
    assert otp_token.used is True
    assert otp_token.attempts >= 5


@pytest.mark.asyncio
async def test_otp_success_sets_password_changed_at(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    """Successful OTP reset must stamp password_changed_at on the user."""
    from passlib.context import CryptContext

    from app.services.encryption import compute_blind_index, encrypt_value

    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    mobile = "+15559876543"
    test_user.mobile_number = encrypt_value(mobile)
    test_user.mobile_number_hash = compute_blind_index(mobile)
    test_user.hashed_password = pwd.hash("OriginalPass123!")
    db.add(test_user)
    await db.flush()

    otp_code = "654321"
    otp_token = OTPToken(
        mobile_number=encrypt_value(mobile),
        mobile_number_hash=compute_blind_index(mobile),
        otp_hash=pwd.hash(otp_code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        attempts=0,
    )
    db.add(otp_token)
    await db.flush()

    resp = await client.post(
        "/auth/forgot-password/reset-with-otp",
        json={
            "mobile_number": mobile,
            "otp": otp_code,
            "new_password": "BrandNewPass99!",
        },
    )
    assert resp.status_code == 200

    await db.refresh(test_user)
    assert test_user.password_changed_at is not None


# ── Notifications & bill reminders ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_bill_reminder_creates_notification(
    auth_client: AsyncClient, test_user: User, db: AsyncSession
):
    from datetime import date

    from app.api.notifications import dispatch_bill_reminders

    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    db.add(
        Bill(
            user_id=test_user.id,
            name="Electricity",
            amount=120.00,
            due_date=tomorrow,
            reminder_lead_days=3,
        )
    )
    await db.flush()

    count = await dispatch_bill_reminders(db, test_user.id)
    assert count == 1

    resp = await auth_client.get("/notifications?unread_only=true")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert "Electricity" in data[0]["title"]


@pytest.mark.asyncio
async def test_bill_reminder_dedup(test_user: User, db: AsyncSession):
    """Running dispatch twice must not duplicate the notification."""
    from datetime import date

    from app.api.notifications import dispatch_bill_reminders

    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    db.add(
        Bill(
            user_id=test_user.id,
            name="Internet",
            amount=50.00,
            due_date=tomorrow,
            reminder_lead_days=7,
        )
    )
    await db.flush()

    first = await dispatch_bill_reminders(db, test_user.id)
    second = await dispatch_bill_reminders(db, test_user.id)
    assert first == 1
    assert second == 0


@pytest.mark.asyncio
async def test_notification_mark_read(
    auth_client: AsyncClient, test_user: User, db: AsyncSession
):
    db.add(
        Notification(
            user_id=test_user.id,
            type="system",
            title="Welcome",
            message="Hello!",
        )
    )
    await db.flush()

    resp = await auth_client.get("/notifications")
    assert resp.status_code == 200
    nid = resp.json()[0]["id"]

    resp2 = await auth_client.patch(f"/notifications/{nid}/read")
    assert resp2.status_code == 200
    assert resp2.json()["is_read"] is True


# ── Account balance synchronization ────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_expense_decreases_account_balance(
    auth_client: AsyncClient, test_user: User, db: AsyncSession
):
    acct = Account(
        user_id=test_user.id,
        name="Checking",
        type="bank",
        opening_balance=1000.0,
        current_balance=1000.0,
    )
    db.add(acct)
    await db.flush()

    resp = await auth_client.post(
        "/transactions",
        json={
            "date": "2026-04-16",
            "merchant": "Grocery Store",
            "amount": 200.0,
            "type": "expense",
            "account_id": acct.id,
        },
    )
    assert resp.status_code == 201

    await db.refresh(acct)
    assert acct.current_balance == pytest.approx(800.0)


@pytest.mark.asyncio
async def test_create_income_increases_account_balance(
    auth_client: AsyncClient, test_user: User, db: AsyncSession
):
    acct = Account(
        user_id=test_user.id,
        name="Salary Account",
        type="bank",
        opening_balance=500.0,
        current_balance=500.0,
    )
    db.add(acct)
    await db.flush()

    resp = await auth_client.post(
        "/transactions",
        json={
            "date": "2026-04-16",
            "merchant": "Employer",
            "amount": 3000.0,
            "type": "income",
            "account_id": acct.id,
        },
    )
    assert resp.status_code == 201

    await db.refresh(acct)
    assert acct.current_balance == pytest.approx(3500.0)


@pytest.mark.asyncio
async def test_delete_transaction_reverses_balance(
    auth_client: AsyncClient, test_user: User, db: AsyncSession
):
    acct = Account(
        user_id=test_user.id,
        name="Wallet",
        type="cash",
        opening_balance=500.0,
        current_balance=500.0,
    )
    db.add(acct)
    await db.flush()

    resp = await auth_client.post(
        "/transactions",
        json={
            "date": "2026-04-16",
            "merchant": "Coffee Shop",
            "amount": 50.0,
            "type": "expense",
            "account_id": acct.id,
        },
    )
    assert resp.status_code == 201
    txn_id = resp.json()["id"]

    await db.refresh(acct)
    assert acct.current_balance == pytest.approx(450.0)

    del_resp = await auth_client.delete(f"/transactions/{txn_id}")
    assert del_resp.status_code == 204

    await db.refresh(acct)
    assert acct.current_balance == pytest.approx(500.0)


@pytest.mark.asyncio
async def test_transfer_adjusts_both_accounts(
    auth_client: AsyncClient, test_user: User, db: AsyncSession
):
    src = Account(
        user_id=test_user.id,
        name="Source",
        type="bank",
        opening_balance=1000.0,
        current_balance=1000.0,
    )
    dest = Account(
        user_id=test_user.id,
        name="Dest",
        type="wallet",
        opening_balance=0.0,
        current_balance=0.0,
    )
    db.add_all([src, dest])
    await db.flush()

    resp = await auth_client.post(
        "/transactions",
        json={
            "date": "2026-04-16",
            "merchant": "Self Transfer",
            "amount": 300.0,
            "type": "transfer",
            "account_id": src.id,
            "transfer_to_account_id": dest.id,
            "transfer_direction": "debit",
        },
    )
    assert resp.status_code == 201

    await db.refresh(src)
    await db.refresh(dest)
    assert src.current_balance == pytest.approx(700.0)
    assert dest.current_balance == pytest.approx(300.0)


# ── CSV injection protection ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_export_sanitizes_formula_injection(
    auth_client: AsyncClient, test_user: User, db: AsyncSession
):
    """Merchant names starting with =, +, -, @ must be prefixed in CSV output."""
    txn = Transaction(
        user_id=test_user.id,
        date="2026-04-16",
        merchant="=CMD('calc')",
        amount=10.0,
        category="Test",
        source="manual",
    )
    db.add(txn)
    await db.flush()

    resp = await auth_client.get("/transactions/export")
    assert resp.status_code == 200
    body = resp.text
    assert "=CMD" not in body or "'=CMD" in body
