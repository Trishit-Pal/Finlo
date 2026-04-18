"""Shared retry helper for outbound HTTP / SDK calls.

Exponential backoff with jitter. Retries only on transient failures (network,
timeouts, 429/5xx). Honors Retry-After on 429. Does not retry auth/logic errors
(400/401/403/404/422).
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Awaitable, Callable, Optional, TypeVar

import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Status codes that indicate a transient failure safe to retry.
RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}

# Per-call defaults. Callers may override per invocation.
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BASE_DELAY = 0.5
DEFAULT_FACTOR = 2.0
DEFAULT_MAX_DELAY = 8.0


class RetryableHTTPError(Exception):
    """Raised internally to mark a status-coded response as retryable."""

    def __init__(self, status_code: int, retry_after: Optional[float] = None) -> None:
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code
        self.retry_after = retry_after


def _is_retryable(exc: BaseException) -> bool:
    """True if the exception represents a transient failure."""
    if isinstance(exc, RetryableHTTPError):
        return True
    if isinstance(exc, (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout,
                        httpx.PoolTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError)):
        return True
    # OpenAI SDK surfaces these; imported lazily so tests without openai work.
    try:
        from openai import (
            APIConnectionError,
            APITimeoutError,
            InternalServerError,
            RateLimitError,
        )

        if isinstance(exc, (APIConnectionError, APITimeoutError,
                            InternalServerError, RateLimitError)):
            return True
    except ImportError:
        pass
    return False


def parse_retry_after(value: Optional[str]) -> Optional[float]:
    """Parse a Retry-After header (seconds as int or HTTP-date)."""
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        # HTTP-date form is rare on APIs we call; don't block if we can't parse.
        return None


async def retry_call(
    func: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_delay: float = DEFAULT_BASE_DELAY,
    factor: float = DEFAULT_FACTOR,
    max_delay: float = DEFAULT_MAX_DELAY,
    op_name: str = "http_call",
) -> T:
    """Run ``func`` with exponential backoff + jitter on transient failures.

    Non-retryable exceptions propagate immediately.
    """
    last_exc: Optional[BaseException] = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await func()
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except BaseException as exc:
            last_exc = exc
            if not _is_retryable(exc) or attempt >= max_attempts:
                logger.warning(
                    "retry.exhausted",
                    extra={"op": op_name, "attempt": attempt, "err": repr(exc)[:200]},
                )
                raise

            # Compute sleep; honor Retry-After on the RetryableHTTPError wrapper.
            explicit = getattr(exc, "retry_after", None)
            if isinstance(explicit, (int, float)) and explicit > 0:
                sleep_for = min(float(explicit), max_delay)
            else:
                backoff = base_delay * (factor ** (attempt - 1))
                jitter = random.uniform(0, base_delay)
                sleep_for = min(backoff + jitter, max_delay)

            logger.info(
                "retry.waiting",
                extra={
                    "op": op_name,
                    "attempt": attempt,
                    "sleep_s": round(sleep_for, 2),
                    "err": type(exc).__name__,
                },
            )
            await asyncio.sleep(sleep_for)

    # Unreachable in practice — the loop either returns or raises.
    assert last_exc is not None
    raise last_exc


async def http_request_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    op_name: Optional[str] = None,
    **request_kwargs,
) -> httpx.Response:
    """httpx.request wrapper that retries on transient failures.

    A 4xx response (other than 408/425/429) is returned as-is — not retried —
    so callers can inspect structured error bodies like authentication errors.
    """
    label = op_name or f"{method.upper()} {url}"

    async def _once() -> httpx.Response:
        resp = await client.request(method, url, **request_kwargs)
        if resp.status_code in RETRYABLE_STATUS:
            retry_after = parse_retry_after(resp.headers.get("Retry-After"))
            # Drain the body so the connection can be reused.
            await resp.aread()
            raise RetryableHTTPError(resp.status_code, retry_after=retry_after)
        return resp

    return await retry_call(_once, max_attempts=max_attempts, op_name=label)
