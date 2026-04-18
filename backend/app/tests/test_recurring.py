"""End-to-end tests for recurring-rules endpoints."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _seed_tx(
    client: AsyncClient,
    tx_date: str,
    merchant: str,
    amount: float,
    category: str = "Food & Dining",
) -> None:
    resp = await client.post(
        "/transactions",
        json={
            "date": tx_date,
            "merchant": merchant,
            "amount": amount,
            "category": category,
            "type": "expense",
        },
    )
    assert resp.status_code == 201, resp.text


async def test_list_empty(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/recurring-rules")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_and_list(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/recurring-rules",
        json={
            "label": "Netflix",
            "type": "expense",
            "frequency": "monthly",
            "expected_amount": 649.0,
            "next_due_date": "2026-05-01",
            "category": "Entertainment",
            "merchant_pattern": "netflix",
        },
    )
    assert resp.status_code == 201, resp.text
    rule = resp.json()
    assert rule["label"] == "Netflix"
    assert rule["frequency"] == "monthly"
    assert rule["expected_amount"] == 649.0
    assert rule["next_due_date"] == "2026-05-01"

    listed = await auth_client.get("/recurring-rules")
    assert listed.status_code == 200
    assert any(r["label"] == "Netflix" for r in listed.json())


async def test_create_minimal(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/recurring-rules",
        json={
            "label": "Rent",
            "type": "expense",
            "frequency": "monthly",
            "expected_amount": 15000.0,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["next_due_date"] is None
    assert resp.json()["merchant_pattern"] is None


async def test_create_invalid_frequency(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/recurring-rules",
        json={
            "label": "Bad",
            "type": "expense",
            "frequency": "daily",
            "expected_amount": 100.0,
        },
    )
    assert resp.status_code == 422


async def test_create_invalid_type(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/recurring-rules",
        json={
            "label": "Bad",
            "type": "both",
            "frequency": "monthly",
            "expected_amount": 100.0,
        },
    )
    assert resp.status_code == 422


async def test_create_negative_amount(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/recurring-rules",
        json={
            "label": "Bad",
            "type": "expense",
            "frequency": "monthly",
            "expected_amount": -50.0,
        },
    )
    assert resp.status_code == 422


async def test_delete(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/recurring-rules",
        json={
            "label": "Gym",
            "type": "expense",
            "frequency": "monthly",
            "expected_amount": 1200.0,
        },
    )
    assert create.status_code == 201
    rule_id = create.json()["id"]

    resp = await auth_client.delete(f"/recurring-rules/{rule_id}")
    assert resp.status_code == 204

    # confirm gone
    listed = await auth_client.get("/recurring-rules")
    assert not any(r["id"] == rule_id for r in listed.json())


async def test_delete_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.delete(
        "/recurring-rules/00000000-0000-0000-0000-000000000000"
    )
    assert resp.status_code == 404


# ── GET single ────────────────────────────────────────────────────────────────

async def test_get_single(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/recurring-rules",
        json={"label": "GetSingle", "type": "expense", "frequency": "monthly", "expected_amount": 500.0},
    )
    assert create.status_code == 201
    rule_id = create.json()["id"]

    resp = await auth_client.get(f"/recurring-rules/{rule_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == rule_id
    assert resp.json()["label"] == "GetSingle"


async def test_get_single_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/recurring-rules/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


# ── PATCH ─────────────────────────────────────────────────────────────────────

async def test_patch_label_and_amount(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/recurring-rules",
        json={"label": "OldLabel", "type": "expense", "frequency": "monthly", "expected_amount": 100.0},
    )
    rule_id = create.json()["id"]

    upd = await auth_client.patch(
        f"/recurring-rules/{rule_id}",
        json={"label": "NewLabel", "expected_amount": 250.0},
    )
    assert upd.status_code == 200
    assert upd.json()["label"] == "NewLabel"
    assert upd.json()["expected_amount"] == 250.0


async def test_patch_frequency(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/recurring-rules",
        json={"label": "FreqTest", "type": "expense", "frequency": "monthly", "expected_amount": 300.0},
    )
    rule_id = create.json()["id"]

    upd = await auth_client.patch(f"/recurring-rules/{rule_id}", json={"frequency": "yearly"})
    assert upd.status_code == 200
    assert upd.json()["frequency"] == "yearly"


async def test_patch_deactivate(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/recurring-rules",
        json={"label": "ActiveRule", "type": "expense", "frequency": "monthly", "expected_amount": 800.0},
    )
    rule_id = create.json()["id"]

    upd = await auth_client.patch(f"/recurring-rules/{rule_id}", json={"is_active": False})
    assert upd.status_code == 200
    assert upd.json()["is_active"] is False


async def test_patch_invalid_frequency(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/recurring-rules",
        json={"label": "BadFreq", "type": "expense", "frequency": "monthly", "expected_amount": 100.0},
    )
    rule_id = create.json()["id"]

    resp = await auth_client.patch(f"/recurring-rules/{rule_id}", json={"frequency": "daily"})
    assert resp.status_code == 422


async def test_patch_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.patch(
        "/recurring-rules/00000000-0000-0000-0000-000000000000",
        json={"label": "X"},
    )
    assert resp.status_code == 404


async def test_detect_candidates(auth_client: AsyncClient) -> None:
    today = date.today()
    merchant = "Swiggy_detect_test"

    # Two transactions for the same merchant in two different months
    month1 = (today - timedelta(days=45)).replace(day=10).isoformat()
    month2 = today.replace(day=5).isoformat() if today.day >= 5 else today.isoformat()

    await _seed_tx(auth_client, month1, merchant, 350.0)
    await _seed_tx(auth_client, month2, merchant, 420.0)

    resp = await auth_client.post(
        "/recurring-rules/detect",
        params={"min_months": 2, "lookback_days": 90},
    )
    assert resp.status_code == 200
    merchants = [c["merchant"] for c in resp.json()]
    assert merchant in merchants


async def test_detect_single_month_excluded(auth_client: AsyncClient) -> None:
    today = date.today()
    merchant = "OneMonth_detect_test"

    # Both transactions in the same month — should NOT appear
    same_month = today.replace(day=1).isoformat()
    await _seed_tx(auth_client, same_month, merchant, 200.0)

    resp = await auth_client.post(
        "/recurring-rules/detect",
        params={"min_months": 2, "lookback_days": 90},
    )
    assert resp.status_code == 200
    merchants = [c["merchant"] for c in resp.json()]
    assert merchant not in merchants
