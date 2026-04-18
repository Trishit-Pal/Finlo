"""Tests for the KeyPool rotation / quarantine behavior."""

from __future__ import annotations

import time

import pytest

from app.services.provider_pool import (
    QUARANTINE_AUTH,
    QUARANTINE_GENERIC,
    QUARANTINE_RATE_LIMIT,
    KeyPool,
    NoHealthyKeyAvailable,
)


def test_from_csv_dedupes_and_preserves_order():
    pool = KeyPool.from_csv("a, b , a , c,  ", label="test")
    assert [k.key for k in pool.keys] == ["a", "b", "c"]


def test_from_values_filters_empty():
    pool = KeyPool.from_values(["x", "", None, "y"] if False else ["x", "", "y"])  # type: ignore[list-item]
    assert [k.key for k in pool.keys] == ["x", "y"]


def test_empty_pool_is_falsy():
    pool = KeyPool.from_csv("")
    assert not pool
    assert pool.healthy_count() == 0


@pytest.mark.asyncio
async def test_borrow_rotates_round_robin():
    pool = KeyPool.from_csv("a,b,c", label="rr")
    seen: list[str] = []
    for _ in range(6):
        async with pool.borrow("op") as key:
            seen.append(key)
    # Round-robin → each key used twice in order.
    assert seen == ["a", "b", "c", "a", "b", "c"]


@pytest.mark.asyncio
async def test_borrow_raises_when_pool_empty():
    pool = KeyPool.from_csv("")
    with pytest.raises(NoHealthyKeyAvailable):
        async with pool.borrow("op"):
            pass


@pytest.mark.asyncio
async def test_failure_quarantines_key_and_rotates_to_next():
    pool = KeyPool.from_csv("a,b", label="fail")

    class _Http429(Exception):
        status_code = 429

    # First borrow picks "a"; raising rotates quarantine to it.
    with pytest.raises(_Http429):
        async with pool.borrow("op") as key:
            assert key == "a"
            raise _Http429()

    # Next borrow must skip "a" and pick "b".
    async with pool.borrow("op") as key:
        assert key == "b"


def test_classify_rate_limit_vs_auth_vs_generic():
    pool = KeyPool.from_csv("x")

    class _Err:
        def __init__(self, code):
            self.status_code = code

    reason, ttl = pool.classify_and_ttl(_Err(429))
    assert reason == "http_429" and ttl == QUARANTINE_RATE_LIMIT

    reason, ttl = pool.classify_and_ttl(_Err(401))
    assert reason == "http_401" and ttl == QUARANTINE_AUTH

    reason, ttl = pool.classify_and_ttl(_Err(500))
    assert reason == "http_500" and ttl == QUARANTINE_GENERIC

    # Unknown exceptions default to generic.
    reason, ttl = pool.classify_and_ttl(RuntimeError("boom"))
    assert reason == "transient" and ttl == QUARANTINE_GENERIC


@pytest.mark.asyncio
async def test_all_keys_exhausted_raises():
    pool = KeyPool.from_csv("a")
    # Force-quarantine the only key.
    await pool.quarantine("a", reason="test", ttl=3600)
    with pytest.raises(NoHealthyKeyAvailable):
        async with pool.borrow("op"):
            pass


@pytest.mark.asyncio
async def test_mark_success_resets_failure_window():
    pool = KeyPool.from_csv("a", label="reset")
    state = pool.keys[0]
    state.failures_in_window = 3
    state.last_failure_reason = "x"
    await pool.mark_success("a")
    assert state.failures_in_window == 0
    assert state.last_failure_reason is None


@pytest.mark.asyncio
async def test_quarantine_extends_ttl_not_resets():
    pool = KeyPool.from_csv("a")
    await pool.quarantine("a", reason="first", ttl=60)
    first_until = pool.keys[0].quarantined_until
    # A shorter TTL must not shorten an existing longer quarantine.
    await pool.quarantine("a", reason="second", ttl=1)
    assert pool.keys[0].quarantined_until >= first_until


@pytest.mark.asyncio
async def test_healthy_count_reflects_expired_quarantines():
    pool = KeyPool.from_csv("a,b")
    # Immediately-expired quarantine — key a is healthy again.
    pool.keys[0].quarantined_until = time.monotonic() - 1
    assert pool.healthy_count() == 2
