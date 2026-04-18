"""Lightweight caching layer — Redis-backed with in-process TTL fallback."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_CACHE_VERSION = "v1"

_local_cache: dict[str, tuple[float, Any]] = {}
_LOCAL_MAX_SIZE = 512


def _prefixed(key: str) -> str:
    return f"{_CACHE_VERSION}:{key}"


async def cache_get(key: str) -> Optional[Any]:
    full_key = _prefixed(key)

    from app.services.redis_pool import get_redis

    rds = get_redis()
    if rds:
        try:
            raw = await rds.get(full_key)
            if raw is not None:
                return json.loads(raw)
            return None
        except Exception:
            pass

    import time

    entry = _local_cache.get(full_key)
    if entry and entry[0] > time.monotonic():
        return entry[1]
    _local_cache.pop(full_key, None)
    return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    full_key = _prefixed(key)
    serialized = json.dumps(value, default=str)

    from app.services.redis_pool import get_redis

    rds = get_redis()
    if rds:
        try:
            await rds.set(full_key, serialized, ex=ttl)
            return
        except Exception:
            pass

    import time

    if len(_local_cache) >= _LOCAL_MAX_SIZE:
        now = time.monotonic()
        expired = [k for k, (exp, _) in _local_cache.items() if exp <= now]
        for k in expired:
            del _local_cache[k]
        if len(_local_cache) >= _LOCAL_MAX_SIZE:
            oldest = min(_local_cache, key=lambda k: _local_cache[k][0])
            del _local_cache[oldest]

    _local_cache[full_key] = (time.monotonic() + ttl, json.loads(serialized))


async def cache_delete(key: str) -> None:
    full_key = _prefixed(key)
    _local_cache.pop(full_key, None)

    from app.services.redis_pool import get_redis

    rds = get_redis()
    if rds:
        try:
            await rds.delete(full_key)
        except Exception:
            pass


async def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching a glob pattern (e.g. 'user:abc:*')."""
    full_pattern = _prefixed(pattern)

    import fnmatch

    to_remove = [k for k in _local_cache if fnmatch.fnmatch(k, full_pattern)]
    for k in to_remove:
        del _local_cache[k]

    from app.services.redis_pool import get_redis

    rds = get_redis()
    if rds:
        try:
            cursor = None
            while cursor != 0:
                cursor, keys = await rds.scan(cursor=cursor or 0, match=full_pattern, count=100)
                if keys:
                    await rds.delete(*keys)
        except Exception:
            pass


async def invalidate_user_cache(user_id: str, *extra_keys: str) -> None:
    """Invalidate common per-user cache keys after mutations."""
    patterns = [
        f"user:{user_id}:dashboard:*",
        f"user:{user_id}:analytics_overview",
        f"user:{user_id}:budgets:*",
        f"user:{user_id}:trends:*",
    ]
    for p in patterns:
        await cache_delete_pattern(p)
    for key in extra_keys:
        await cache_delete(key)
