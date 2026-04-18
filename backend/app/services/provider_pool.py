"""Rotating API-key pool with soft quarantine on failure.

Used by LLM + embedding callers so a transient 429 or a fully-exhausted key
does not take down the feature: the pool rotates to the next healthy key and
quarantines the bad one for a short TTL.
"""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import AsyncIterator, Iterable, Optional

logger = logging.getLogger(__name__)


# Default quarantine windows (seconds). Override per-call when needed.
QUARANTINE_AUTH = 15 * 60  # 401 / 403 — bad or rotated key, longer cool-down
QUARANTINE_RATE_LIMIT = 60  # 429 — short cool-down, key is fine
QUARANTINE_GENERIC = 30  # network / 5xx — brief cool-down


def _redact(key: str) -> str:
    """Log-safe key identifier — never leak the full secret."""
    if not key:
        return "<empty>"
    if len(key) <= 8:
        return "…" + key[-2:]
    return f"{key[:3]}…{key[-4:]}"


@dataclass
class _KeyState:
    key: str
    quarantined_until: float = 0.0
    last_failure_reason: Optional[str] = None
    failures_in_window: int = 0


@dataclass
class KeyPool:
    """Round-robin pool with per-key quarantine.

    Create from a comma-separated env value via :meth:`from_csv`. Use as::

        async with pool.borrow("op_name") as key:
            ... call API with ``key`` ...
    """

    keys: list[_KeyState] = field(default_factory=list)
    label: str = "pool"
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _cursor: int = 0

    # ── construction ──────────────────────────────────────────────────────
    @classmethod
    def from_csv(cls, raw: str, label: str = "pool") -> "KeyPool":
        parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
        # Preserve order, drop dupes.
        seen: set[str] = set()
        uniq: list[_KeyState] = []
        for p in parts:
            if p not in seen:
                uniq.append(_KeyState(key=p))
                seen.add(p)
        return cls(keys=uniq, label=label)

    @classmethod
    def from_values(cls, values: Iterable[str], label: str = "pool") -> "KeyPool":
        return cls.from_csv(",".join(v for v in values if v), label=label)

    # ── state inspection ──────────────────────────────────────────────────
    @property
    def size(self) -> int:
        return len(self.keys)

    def healthy_count(self) -> int:
        now = time.monotonic()
        return sum(1 for k in self.keys if k.quarantined_until <= now)

    def __bool__(self) -> bool:
        return self.size > 0

    # ── quarantine ops ────────────────────────────────────────────────────
    async def _pick(self) -> Optional[_KeyState]:
        """Return the next healthy key, or None if none are available."""
        if not self.keys:
            return None
        now = time.monotonic()
        async with self._lock:
            n = len(self.keys)
            for _ in range(n):
                idx = self._cursor % n
                self._cursor = (self._cursor + 1) % n
                state = self.keys[idx]
                if state.quarantined_until <= now:
                    return state
            return None

    async def quarantine(
        self, key: str, reason: str, ttl: float = QUARANTINE_GENERIC
    ) -> None:
        """Mark a key as unavailable for ``ttl`` seconds."""
        now = time.monotonic()
        async with self._lock:
            for state in self.keys:
                if state.key == key:
                    state.quarantined_until = max(state.quarantined_until, now + ttl)
                    state.last_failure_reason = reason
                    state.failures_in_window += 1
                    logger.warning(
                        "keypool.quarantine",
                        extra={
                            "pool": self.label,
                            "key": _redact(key),
                            "reason": reason,
                            "ttl_s": ttl,
                        },
                    )
                    return

    async def mark_success(self, key: str) -> None:
        async with self._lock:
            for state in self.keys:
                if state.key == key:
                    state.failures_in_window = 0
                    state.last_failure_reason = None
                    return

    def classify_and_ttl(self, exc: BaseException) -> tuple[str, float]:
        """Map an exception to (reason_label, quarantine_ttl).

        Accepts httpx / OpenAI / generic HTTP status-aware exceptions.
        """
        status = getattr(exc, "status_code", None)
        if status is None:
            status = getattr(getattr(exc, "response", None), "status_code", None)

        if status in (401, 403):
            return (f"http_{status}", QUARANTINE_AUTH)
        if status == 429:
            return ("http_429", QUARANTINE_RATE_LIMIT)
        if isinstance(status, int) and 500 <= status < 600:
            return (f"http_{status}", QUARANTINE_GENERIC)

        # OpenAI SDK exception classes (lazy-imported so openai isn't required here).
        exc_name = type(exc).__name__
        if exc_name == "AuthenticationError":
            return ("auth_error", QUARANTINE_AUTH)
        if exc_name == "PermissionDeniedError":
            return ("permission_denied", QUARANTINE_AUTH)
        if exc_name == "RateLimitError":
            return ("rate_limit", QUARANTINE_RATE_LIMIT)

        return ("transient", QUARANTINE_GENERIC)

    # ── public context manager ────────────────────────────────────────────
    @asynccontextmanager
    async def borrow(self, op_name: str = "call") -> AsyncIterator[str]:
        """Yield a healthy key. On exception, auto-quarantine based on type."""
        state = await self._pick()
        if state is None:
            raise NoHealthyKeyAvailable(
                f"{self.label}: no healthy API key available "
                f"(pool size={self.size})"
            )
        try:
            yield state.key
        except BaseException as exc:
            reason, ttl = self.classify_and_ttl(exc)
            await self.quarantine(state.key, reason=f"{op_name}:{reason}", ttl=ttl)
            raise
        else:
            await self.mark_success(state.key)


class NoHealthyKeyAvailable(RuntimeError):
    """All keys in the pool are quarantined or the pool is empty."""
