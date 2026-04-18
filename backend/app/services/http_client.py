"""Application-scoped httpx.AsyncClient with connection pooling."""

from __future__ import annotations

import httpx

_client: httpx.AsyncClient | None = None

DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
DEFAULT_LIMITS = httpx.Limits(max_connections=50, max_keepalive_connections=20)


async def init_http_client() -> None:
    global _client
    _client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, limits=DEFAULT_LIMITS)


async def close_http_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


def get_http_client() -> httpx.AsyncClient:
    """Return the shared httpx client. Falls back to a fresh client if not initialized."""
    if _client is None:
        return httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, limits=DEFAULT_LIMITS)
    return _client
