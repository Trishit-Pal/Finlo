"""Tests for the shared HTTP retry helper."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.services.http_retry import (
    RetryableHTTPError,
    http_request_with_retry,
    parse_retry_after,
    retry_call,
)


@pytest.mark.asyncio
async def test_retry_call_returns_on_first_success():
    calls: list[int] = []

    async def _op():
        calls.append(1)
        return "ok"

    result = await retry_call(_op, op_name="test.ok")
    assert result == "ok"
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_retry_call_retries_on_retryable_error():
    calls: list[int] = []

    async def _op():
        calls.append(1)
        if len(calls) < 2:
            raise RetryableHTTPError(503)
        return "recovered"

    result = await retry_call(
        _op, op_name="test.retry", base_delay=0.01, max_delay=0.05
    )
    assert result == "recovered"
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_retry_call_does_not_retry_on_non_retryable():
    calls: list[int] = []

    async def _op():
        calls.append(1)
        raise ValueError("logic bug")

    with pytest.raises(ValueError):
        await retry_call(_op, op_name="test.logic", max_attempts=3)
    # ValueError is NOT retryable — must not retry.
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_retry_call_gives_up_after_max_attempts():
    calls: list[int] = []

    async def _op():
        calls.append(1)
        raise RetryableHTTPError(502)

    with pytest.raises(RetryableHTTPError):
        await retry_call(
            _op, op_name="test.exhaust", max_attempts=3,
            base_delay=0.01, max_delay=0.05,
        )
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_retry_call_propagates_cancel():
    async def _op():
        raise asyncio.CancelledError()

    with pytest.raises(asyncio.CancelledError):
        await retry_call(_op, op_name="test.cancel")


def test_parse_retry_after_numeric():
    assert parse_retry_after("3") == 3.0
    assert parse_retry_after("0.5") == 0.5


def test_parse_retry_after_missing_or_bad():
    assert parse_retry_after(None) is None
    assert parse_retry_after("") is None
    # HTTP-date form — current parser returns None, which is fine (backoff used).
    assert parse_retry_after("Wed, 21 Oct 2015 07:28:00 GMT") is None


@pytest.mark.asyncio
async def test_http_request_with_retry_retries_503_then_succeeds():
    attempts: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        if len(attempts) < 2:
            return httpx.Response(503, headers={"Retry-After": "0"})
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        resp = await http_request_with_retry(
            client, "GET", "https://example.test/",
            max_attempts=3, op_name="test.mock",
        )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert len(attempts) == 2


@pytest.mark.asyncio
async def test_http_request_with_retry_passes_4xx_through():
    """A 404 should NOT be retried — it's a logic error, not transient."""
    attempts: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(404, json={"error": "not found"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        resp = await http_request_with_retry(
            client, "GET", "https://example.test/", op_name="test.404"
        )
    assert resp.status_code == 404
    assert len(attempts) == 1
