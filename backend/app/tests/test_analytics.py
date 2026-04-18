"""End-to-end tests for analytics endpoints."""

from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

_YEAR = date.today().year
_MONTH = date.today().month
_TODAY = date.today().isoformat()


async def _seed(client: AsyncClient, merchant: str, amount: float, category: str) -> None:
    resp = await client.post(
        "/transactions",
        json={"date": _TODAY, "merchant": merchant, "amount": amount, "category": category, "type": "expense"},
    )
    assert resp.status_code == 201, resp.text


# ── Overview ──────────────────────────────────────────────────────────────────

async def test_overview_empty_schema(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/analytics")
    assert resp.status_code == 200
    body = resp.json()
    assert "category_breakdown" in body
    assert "monthly_trend" in body
    assert isinstance(body["category_breakdown"], list)
    assert isinstance(body["monthly_trend"], list)
    assert len(body["monthly_trend"]) == 6


async def test_overview_aggregates_categories(auth_client: AsyncClient) -> None:
    await _seed(auth_client, "Big Basket", 1500.0, "Groceries")
    await _seed(auth_client, "Zomato", 600.0, "Food & Dining")
    await _seed(auth_client, "Swiggy", 400.0, "Food & Dining")

    resp = await auth_client.get("/analytics")
    assert resp.status_code == 200
    breakdown = {r["name"]: r["value"] for r in resp.json()["category_breakdown"]}

    assert breakdown.get("Food & Dining", 0) >= 1000.0
    assert breakdown.get("Groceries", 0) >= 1500.0


async def test_monthly_trend_has_six_months(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/analytics")
    trend = resp.json()["monthly_trend"]
    assert len(trend) == 6
    for row in trend:
        assert "month" in row
        assert "income" in row
        assert "expenses" in row


# ── Monthly summary ───────────────────────────────────────────────────────────

async def test_monthly_summary_structure(auth_client: AsyncClient) -> None:
    resp = await auth_client.get(
        "/analytics/summary",
        params={"month": _MONTH, "year": _YEAR},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["month"] == _MONTH
    assert body["year"] == _YEAR
    assert "total_expenses" in body
    assert "category_breakdown" in body
    assert "top_places" in body


async def test_monthly_summary_aggregates_transactions(auth_client: AsyncClient) -> None:
    await _seed(auth_client, "Netflix_S", 649.0, "Entertainment")
    await _seed(auth_client, "Netflix_S", 649.0, "Entertainment")

    resp = await auth_client.get(
        "/analytics/summary",
        params={"month": _MONTH, "year": _YEAR},
    )
    assert resp.status_code == 200
    cats = resp.json()["category_breakdown"]
    assert cats.get("Entertainment", 0) >= 1298.0


async def test_monthly_summary_top_places(auth_client: AsyncClient) -> None:
    await _seed(auth_client, "TopMerchant_A", 3000.0, "Shopping")
    await _seed(auth_client, "TopMerchant_A", 2000.0, "Shopping")

    resp = await auth_client.get(
        "/analytics/summary",
        params={"month": _MONTH, "year": _YEAR},
    )
    top = resp.json()["top_places"]
    assert "TopMerchant_A" in top
    assert top["TopMerchant_A"] >= 5000.0


async def test_monthly_summary_invalid_month(auth_client: AsyncClient) -> None:
    resp = await auth_client.get(
        "/analytics/summary",
        params={"month": 13, "year": _YEAR},
    )
    assert resp.status_code == 422


# ── HTML report ───────────────────────────────────────────────────────────────

async def test_report_returns_html(auth_client: AsyncClient) -> None:
    resp = await auth_client.get(
        "/analytics/report",
        params={"month": _MONTH, "year": _YEAR},
    )
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")
    assert "Finlo Monthly Report" in resp.text


async def test_report_invalid_year(auth_client: AsyncClient) -> None:
    resp = await auth_client.get(
        "/analytics/report",
        params={"month": 1, "year": 2019},
    )
    assert resp.status_code == 422
