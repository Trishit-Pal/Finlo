"""Test configuration and fixtures."""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Force test environment
TEST_DB_PATH = Path(tempfile.gettempdir()) / "financecoach_test.db"
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{TEST_DB_PATH.as_posix()}")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-testing-only")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_ANON_KEY", "")
os.environ.setdefault("LLM_PROVIDER_KEY", "")
os.environ.setdefault("EMBEDDING_PROVIDER_KEY", "")
os.environ.setdefault("STORAGE_ENCRYPTION_KEY", "a" * 64)
os.environ.setdefault("STORAGE_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("STORAGE_ACCESS_KEY", "minioadmin")
os.environ.setdefault("STORAGE_SECRET_KEY", "minioadmin")
os.environ.setdefault("STORAGE_BUCKET", "test-bucket")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ENVIRONMENT", "test")

from app.db.models import Base, User  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402

TEST_DB_URL = os.environ["DATABASE_URL"]
TEST_JWT_SECRET = os.environ.get("JWT_SECRET", "test-secret-key-for-testing-only")

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def setup_db():
    if test_engine.url.drivername.startswith("sqlite") and TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink(missing_ok=True)
    async with test_engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            await conn.execute(
                __import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS vector")
            )
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    if test_engine.url.drivername.startswith("sqlite") and TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink(missing_ok=True)


@pytest_asyncio.fixture
async def db(setup_db) -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    from passlib.context import CryptContext

    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user = User(
        email="test@example.com",
        hashed_password=pwd.hash("testpassword123"),
        full_name="Test User",
        settings={"monthly_income": 5000, "goals": "save money"},
        is_admin=False,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def admin_user(db: AsyncSession) -> User:
    from passlib.context import CryptContext

    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user = User(
        email="admin@example.com",
        hashed_password=pwd.hash("adminpassword123"),
        full_name="Admin User",
        settings={},
        is_admin=True,
    )
    db.add(user)
    await db.flush()
    return user


def _make_jwt(user: User) -> str:
    from datetime import datetime, timedelta, timezone

    import jwt

    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=24)
    return jwt.encode(
        {
            "sub": user.id,
            "email": user.email,
            "exp": expire,
            "iat": now,
            "type": "access",
        },
        TEST_JWT_SECRET,
        algorithm="HS256",
    )


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client with DB session override."""

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, test_user: User) -> AsyncClient:
    """Authenticated HTTP client."""
    token = _make_jwt(test_user)
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture
async def admin_client(client: AsyncClient, admin_user: User) -> AsyncClient:
    token = _make_jwt(admin_user)
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    """Reset the in-memory rate-limiter storage before every test so that
    tests which share the same endpoint (e.g. /transactions/import) do not
    bleed 429s into each other."""
    try:
        from app.api.transactions import _limiter

        _limiter.reset()
    except Exception:
        pass


# ── Sample receipt data ───────────────────────────────────────────────────────

SAMPLE_RECEIPT_LINES = [
    "WHOLE FOODS MARKET",
    "123 Main Street, Springfield",
    "Tel: (555) 123-4567",
    "",
    "Date: Jan 15, 2024",
    "",
    "Organic Bananas          1.49",
    "Greek Yogurt 32oz        4.99",
    "Sourdough Bread          5.49",
    "Almond Milk              3.99",
    "Free Range Eggs          6.99",
    "",
    "Subtotal                22.95",
    "Tax (8.5%)               1.95",
    "TOTAL                  $24.90",
    "",
    "Thank you for shopping!",
]

SAMPLE_GROCERY_RECEIPT_LINES = [
    "TRADER JOE'S",
    "456 Oak Ave",
    "02/20/2024",
    "Frozen Pizza             7.99",
    "Orange Juice             3.49",
    "Pasta Sauce              2.99",
    "TAX                      1.12",
    "TOTAL                  $15.59",
]
