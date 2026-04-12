"""Async SQLAlchemy session factory and DB initialization."""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db.models import Base

settings = get_settings()
logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.get_database_url,
    echo=settings.ENVIRONMENT == "development",
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def init_db() -> None:
    """Initialize DB safely for non-production environments."""
    if settings.ENVIRONMENT == "production":
        # Production schema changes must run via Alembic migrations.
        return

    async with engine.begin() as conn:
        try:
            if conn.dialect.name == "postgresql":
                await conn.execute(__import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception as exc:
            logger.warning("Failed to ensure vector extension: %s", exc)
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:  # type: ignore[return]
    """FastAPI dependency that yields a DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
