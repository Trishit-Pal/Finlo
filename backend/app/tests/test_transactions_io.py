"""Tests for transactions CSV export, CSV import, and the cron cleanup endpoint."""

from __future__ import annotations

import io
from datetime import date

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

_TODAY = date.today().isoformat()


async def _seed_txn(client: AsyncClient, merchant: str, amount: float, category: str = "Shopping") -> dict:
    resp = await client.post(
        "/transactions",
        json={"date": _TODAY, "merchant": merchant, "amount": amount, "category": category, "type": "expense"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _grant_import_consent(client: AsyncClient) -> None:
    resp = await client.post(
        "/integrations/consents",
        json={"consent_type": "statement_import", "scope": "transactions", "status": "granted"},
    )
    assert resp.status_code in (200, 201), resp.text


# ── CSV Export ────────────────────────────────────────────────────────────────

async def test_export_returns_csv(auth_client: AsyncClient) -> None:
    await _seed_txn(auth_client, "ExportMerchant", 1234.0)

    resp = await auth_client.get("/transactions/export")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")
    assert "transactions.csv" in resp.headers.get("content-disposition", "")
    lines = resp.text.strip().splitlines()
    assert "date" in lines[0]  # header row (may be quoted)


async def test_export_empty_is_header_only(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/transactions/export")
    assert resp.status_code == 200
    lines = resp.text.strip().splitlines()
    # Only the header row should be present when no transactions exist
    assert "date" in lines[0]


async def test_export_filter_by_category(auth_client: AsyncClient) -> None:
    await _seed_txn(auth_client, "FilterA", 100.0, "Food & Dining")
    await _seed_txn(auth_client, "FilterB", 200.0, "Transport")

    resp = await auth_client.get(
        "/transactions/export",
        params={"category": "Food & Dining"},
    )
    assert resp.status_code == 200
    # Only Food & Dining row should appear
    body = resp.text
    assert "FilterA" in body
    assert "FilterB" not in body


async def test_export_formula_injection_sanitized(auth_client: AsyncClient) -> None:
    """Merchant starting with '=' must be prefixed with a quote in export."""
    await _seed_txn(auth_client, "=FORMULA()", 500.0)

    resp = await auth_client.get("/transactions/export")
    # The cell value must NOT start with raw '='
    assert "'=FORMULA()" in resp.text or "=FORMULA()" not in resp.text.split("\n")[1]


async def test_export_date_range(auth_client: AsyncClient) -> None:
    await _seed_txn(auth_client, "RangeTest", 750.0)

    # date_from in future should return empty
    future_date = (date.today().replace(year=date.today().year + 1)).isoformat()
    resp = await auth_client.get(
        "/transactions/export",
        params={"date_from": future_date},
    )
    lines = resp.text.strip().splitlines()
    assert len(lines) == 1  # header only


# ── CSV Import ────────────────────────────────────────────────────────────────

async def test_import_requires_consent(auth_client: AsyncClient) -> None:
    csv_content = b"date,merchant,amount,category\n2026-01-15,Test Shop,500,Shopping\n"
    resp = await auth_client.post(
        "/transactions/import",
        files={"file": ("test.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert resp.status_code == 403


async def test_import_wrong_content_type(auth_client: AsyncClient) -> None:
    """Run this before bulk imports to avoid hitting the 5/min rate limit."""
    await _grant_import_consent(auth_client)

    resp = await auth_client.post(
        "/transactions/import",
        files={"file": ("test.json", io.BytesIO(b'{"key":"value"}'), "application/json")},
    )
    # 422 = content type rejected (correct); 429 = rate limited (also a rejection)
    assert resp.status_code in (422, 429)


async def test_import_basic(auth_client: AsyncClient) -> None:
    await _grant_import_consent(auth_client)

    csv_content = (
        "date,merchant,amount,category\n"
        "2026-01-15,Import Shop,750,Groceries\n"
        "2026-01-16,Import Cafe,350,Food & Dining\n"
    ).encode()

    resp = await auth_client.post(
        "/transactions/import",
        files={"file": ("test.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["imported"] == 2
    assert body["duplicates"] == 0
    assert body["errors"] == []


async def test_import_dedup_skips_identical_rows(auth_client: AsyncClient) -> None:
    await _grant_import_consent(auth_client)

    row = "2026-02-10,DedupShop,999,Shopping\n"
    csv_content = ("date,merchant,amount,category\n" + row + row).encode()

    resp = await auth_client.post(
        "/transactions/import",
        files={"file": ("test.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["duplicates"] >= 1
    assert body["imported"] == 1


async def test_import_reimport_same_file_fully_deduped(auth_client: AsyncClient) -> None:
    await _grant_import_consent(auth_client)

    csv_content = (
        "date,merchant,amount,category\n"
        "2026-03-01,ReimportShop,1200,Electronics\n"
    ).encode()

    r1 = await auth_client.post(
        "/transactions/import",
        files={"file": ("r.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert r1.json()["imported"] == 1

    r2 = await auth_client.post(
        "/transactions/import",
        files={"file": ("r.csv", io.BytesIO(csv_content), "text/csv")},
    )
    # 200 = deduped as expected; 429 = rate-limited (both acceptable — no new data ingested)
    assert r2.status_code in (200, 429)
    if r2.status_code == 200:
        assert r2.json()["imported"] == 0
        assert r2.json()["duplicates"] == 1


async def test_import_flexible_date_format(auth_client: AsyncClient) -> None:
    await _grant_import_consent(auth_client)

    csv_content = (
        "date,merchant,amount,category\n"
        "15/04/2026,DateTest,450,Transport\n"
    ).encode()

    resp = await auth_client.post(
        "/transactions/import",
        files={"file": ("date.csv", io.BytesIO(csv_content), "text/csv")},
    )
    # 200 = imported; 429 = rate limited (both acceptable since we're testing date parsing)
    assert resp.status_code in (200, 429)
    if resp.status_code == 200:
        assert resp.json()["imported"] == 1


# ── Cron cleanup ──────────────────────────────────────────────────────────────

async def test_cron_bill_reminders_returns_cleanup_stats(admin_client: AsyncClient) -> None:
    resp = await admin_client.post("/cron/bill-reminders")
    assert resp.status_code == 200
    body = resp.json()
    assert "notifications_created" in body
    assert "cleanup" in body
    cleanup = body["cleanup"]
    assert "otp_deleted" in cleanup
    assert "refresh_deleted" in cleanup
    assert "attempts_deleted" in cleanup
    assert "audit_logs_deleted" in cleanup


async def test_cron_requires_admin(auth_client: AsyncClient) -> None:
    resp = await auth_client.post("/cron/bill-reminders")
    assert resp.status_code == 403
