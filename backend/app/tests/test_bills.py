"""End-to-end tests for bills endpoints."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

_TODAY = date.today().isoformat()
_NEXT_WEEK = (date.today() + timedelta(days=5)).isoformat()
_LAST_MONTH = (date.today().replace(day=1) - timedelta(days=1)).isoformat()


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def test_create_and_list(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/bills",
        json={
            "name": "Rent",
            "amount": 15000.0,
            "due_date": _NEXT_WEEK,
            "frequency": "monthly",
            "reminder_lead_days": 3,
        },
    )
    assert resp.status_code == 201, resp.text
    bill = resp.json()
    assert bill["name"] == "Rent"
    assert bill["is_paid"] is False

    listed = await auth_client.get("/bills")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1
    names = [b["name"] for b in listed.json()["items"]]
    assert "Rent" in names


async def test_get_single(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/bills",
        json={"name": "Internet", "amount": 999.0, "due_date": _NEXT_WEEK},
    )
    assert create.status_code == 201
    bill_id = create.json()["id"]

    resp = await auth_client.get(f"/bills/{bill_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Internet"


async def test_get_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/bills/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


async def test_update_bill(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/bills",
        json={"name": "OTT", "amount": 500.0, "due_date": _NEXT_WEEK},
    )
    bill_id = create.json()["id"]

    upd = await auth_client.patch(f"/bills/{bill_id}", json={"amount": 649.0})
    assert upd.status_code == 200
    assert upd.json()["amount"] == 649.0


async def test_invalid_frequency(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/bills",
        json={"name": "Bad", "amount": 100.0, "due_date": _NEXT_WEEK, "frequency": "hourly"},
    )
    assert resp.status_code == 422


async def test_delete_bill(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/bills",
        json={"name": "ToDelete", "amount": 100.0, "due_date": _NEXT_WEEK},
    )
    bill_id = create.json()["id"]

    del_resp = await auth_client.delete(f"/bills/{bill_id}")
    assert del_resp.status_code == 200

    check = await auth_client.get(f"/bills/{bill_id}")
    assert check.status_code == 404


# ── Mark paid / unpaid ────────────────────────────────────────────────────────

async def test_mark_paid_and_unpaid(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/bills",
        json={"name": "Electric", "amount": 1200.0, "due_date": _NEXT_WEEK},
    )
    bill_id = create.json()["id"]

    paid = await auth_client.post(f"/bills/{bill_id}/mark-paid")
    assert paid.status_code == 200
    assert paid.json()["is_paid"] is True

    # Paying again → 409
    dup = await auth_client.post(f"/bills/{bill_id}/mark-paid")
    assert dup.status_code == 409

    # Unpay
    unpaid = await auth_client.post(f"/bills/{bill_id}/mark-unpaid")
    assert unpaid.status_code == 200
    assert unpaid.json()["is_paid"] is False


async def test_mark_paid_creates_transaction(auth_client: AsyncClient) -> None:
    """auto_create_expense=True must create a transaction on mark-paid."""
    create = await auth_client.post(
        "/bills",
        json={
            "name": "AutoExpenseBill",
            "amount": 2500.0,
            "due_date": _TODAY,
            "category": "Utilities",
            "auto_create_expense": True,
        },
    )
    assert create.status_code == 201
    bill_id = create.json()["id"]

    await auth_client.post(f"/bills/{bill_id}/mark-paid")

    txns = await auth_client.get(
        "/transactions",
        params={"limit": 50},
    )
    assert txns.status_code == 200
    merchants = [t["merchant"] for t in txns.json()["items"]]
    assert "AutoExpenseBill" in merchants


async def test_mark_paid_no_duplicate_transaction(auth_client: AsyncClient) -> None:
    """Calling mark-paid a second time (after unpay) must not double-create."""
    create = await auth_client.post(
        "/bills",
        json={
            "name": "NoDupBill",
            "amount": 300.0,
            "due_date": _TODAY,
            "auto_create_expense": True,
        },
    )
    bill_id = create.json()["id"]

    await auth_client.post(f"/bills/{bill_id}/mark-paid")
    await auth_client.post(f"/bills/{bill_id}/mark-unpaid")
    await auth_client.post(f"/bills/{bill_id}/mark-paid")

    txns = await auth_client.get("/transactions", params={"limit": 200})
    matching = [t for t in txns.json()["items"] if t["merchant"] == "NoDupBill"]
    assert len(matching) == 1, f"Expected 1 auto-created transaction, got {len(matching)}"


# ── Upcoming ──────────────────────────────────────────────────────────────────

async def test_upcoming_next7days(auth_client: AsyncClient) -> None:
    await auth_client.post(
        "/bills",
        json={"name": "UpcomingBill", "amount": 500.0, "due_date": _NEXT_WEEK},
    )
    resp = await auth_client.get("/bills/upcoming/next7days")
    assert resp.status_code == 200
    names = [b["name"] for b in resp.json()]
    assert "UpcomingBill" in names


async def test_upcoming_excludes_paid(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/bills",
        json={"name": "PaidSoon", "amount": 100.0, "due_date": _NEXT_WEEK},
    )
    bill_id = create.json()["id"]
    await auth_client.post(f"/bills/{bill_id}/mark-paid")

    resp = await auth_client.get("/bills/upcoming/next7days")
    names = [b["name"] for b in resp.json()]
    assert "PaidSoon" not in names


async def test_list_filter_paid(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/bills",
        json={"name": "FilterBill", "amount": 100.0, "due_date": _NEXT_WEEK},
    )
    bill_id = create.json()["id"]
    await auth_client.post(f"/bills/{bill_id}/mark-paid")

    paid_only = await auth_client.get("/bills", params={"paid": "true"})
    unpaid_only = await auth_client.get("/bills", params={"paid": "false"})
    assert paid_only.status_code == 200
    assert unpaid_only.status_code == 200
    assert all(b["is_paid"] for b in paid_only.json()["items"])
    assert all(not b["is_paid"] for b in unpaid_only.json()["items"])
