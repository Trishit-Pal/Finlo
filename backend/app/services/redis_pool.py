"""Singleton Redis connection pool shared across all services."""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_pool = None
_unavailable = False


async def init_redis_pool() -> None:
    """Create the shared Redis connection pool. Call once at app startup."""
    global _pool, _unavailable
    from app.config import get_settings

    url = get_settings().REDIS_URL
    if not url or not url.startswith(("redis://", "rediss://")):
        logger.info("redis_pool.skip: REDIS_URL not a valid redis:// URI")
        _unavailable = True
        return

    try:
        import redis.asyncio as aioredis

        _pool = aioredis.ConnectionPool.from_url(
            url, max_connections=30, decode_responses=True
        )
        r = aioredis.Redis(connection_pool=_pool)
        await r.ping()
        await r.aclose()
        logger.info("redis_pool.connected")
    except Exception as exc:
        logger.warning("redis_pool.init_failed: %s", repr(exc)[:200])
        _pool = None
        _unavailable = True


async def close_redis_pool() -> None:
    global _pool, _unavailable
    if _pool:
        try:
            await _pool.aclose()
        except Exception:
            pass
    _pool = None
    _unavailable = False


def get_redis() -> Optional[object]:
    """Return a Redis client using the shared pool, or None if unavailable."""
    if _unavailable or _pool is None:
        return None
    try:
        import redis.asyncio as aioredis

        return aioredis.Redis(connection_pool=_pool)
    except Exception:
        return None
