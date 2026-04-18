"""End-to-end tests for debts endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_and_list(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/debts",
        json={
            "name": "Home Loan",
            "type": "personal_loan",
            "total_amount": 2000000.0,
            "remaining_balance": 1800000.0,
            "interest_rate": 8.5,
            "emi_amount": 18000.0,
            "next_due_date": "2026-05-01",
            "lender_name": "SBI",
        },
    )
    assert resp.status_code == 201, resp.text
    debt = resp.json()
    assert debt["name"] == "Home Loan"
    assert debt["is_settled"] is False

    listed = await auth_client.get("/debts")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1
    names = [d["name"] for d in listed.json()["items"]]
    assert "Home Loan" in names


async def test_invalid_type(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/debts",
        json={"name": "Bad", "type": "mortgage", "total_amount": 1000.0, "remaining_balance": 1000.0},
    )
    assert resp.status_code == 422


async def test_update_debt(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/debts",
        json={"name": "Car Loan", "type": "personal_loan", "total_amount": 500000.0, "remaining_balance": 400000.0},
    )
    debt_id = create.json()["id"]

    upd = await auth_client.patch(f"/debts/{debt_id}", json={"lender_name": "HDFC", "emi_amount": 9500.0})
    assert upd.status_code == 200
    assert upd.json()["lender_name"] == "HDFC"
    assert upd.json()["emi_amount"] == 9500.0


async def test_update_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.patch(
        "/debts/00000000-0000-0000-0000-000000000000",
        json={"lender_name": "X"},
    )
    assert resp.status_code == 404


async def test_delete(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/debts",
        json={"name": "ToDelete", "type": "owed_to", "total_amount": 5000.0, "remaining_balance": 5000.0},
    )
    debt_id = create.json()["id"]

    del_resp = await auth_client.delete(f"/debts/{debt_id}")
    assert del_resp.status_code == 200

    listed = await auth_client.get("/debts")
    ids = [d["id"] for d in listed.json()["items"]]
    assert debt_id not in ids


# ── Payment logging ───────────────────────────────────────────────────────────

async def test_payment_reduces_balance(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/debts",
        json={"name": "CreditCard", "type": "credit_card", "total_amount": 50000.0, "remaining_balance": 50000.0},
    )
    debt_id = create.json()["id"]

    pay = await auth_client.post(f"/debts/{debt_id}/payment", json={"amount": 10000.0})
    assert pay.status_code == 200
    assert pay.json()["remaining_balance"] == 40000.0
    assert pay.json()["is_settled"] is False


async def test_payment_settles_at_zero(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/debts",
        json={"name": "SmallIOU", "type": "owed_by", "total_amount": 3000.0, "remaining_balance": 3000.0},
    )
    debt_id = create.json()["id"]

    pay = await auth_client.post(f"/debts/{debt_id}/payment", json={"amount": 3000.0})
    assert pay.status_code == 200
    assert pay.json()["remaining_balance"] == 0.0
    assert pay.json()["is_settled"] is True


async def test_overpayment_clamps_to_zero(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/debts",
        json={"name": "Overpay", "type": "owed_by", "total_amount": 1000.0, "remaining_balance": 1000.0},
    )
    debt_id = create.json()["id"]

    pay = await auth_client.post(f"/debts/{debt_id}/payment", json={"amount": 9999.0})
    assert pay.status_code == 200
    assert pay.json()["remaining_balance"] == 0.0
    assert pay.json()["is_settled"] is True


async def test_payment_zero_rejected(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/debts",
        json={"name": "ZeroPay", "type": "personal_loan", "total_amount": 1000.0, "remaining_balance": 1000.0},
    )
    debt_id = create.json()["id"]

    resp = await auth_client.post(f"/debts/{debt_id}/payment", json={"amount": 0.0})
    assert resp.status_code == 422


async def test_payment_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/debts/00000000-0000-0000-0000-000000000000/payment",
        json={"amount": 100.0},
    )
    assert resp.status_code == 404


# ── Amortization schedule ─────────────────────────────────────────────────────

async def test_schedule_with_interest(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/debts",
        json={
            "name": "LoanSched",
            "type": "personal_loan",
            "total_amount": 120000.0,
            "remaining_balance": 120000.0,
            "interest_rate": 12.0,
            "emi_amount": 11000.0,
        },
    )
    debt_id = create.json()["id"]

    sched = await auth_client.get(f"/debts/{debt_id}/schedule", params={"months": 12})
    assert sched.status_code == 200
    body = sched.json()
    assert body["debt_id"] == debt_id
    assert len(body["schedule"]) <= 12
    # interest in first month = balance * monthly_rate
    first = body["schedule"][0]
    assert first["interest"] > 0
    assert first["principal"] > 0
    assert first["remaining_balance"] < 120000.0


async def test_schedule_zero_interest(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/debts",
        json={
            "name": "ZeroInterest",
            "type": "owed_by",
            "total_amount": 6000.0,
            "remaining_balance": 6000.0,
        },
    )
    debt_id = create.json()["id"]

    sched = await auth_client.get(f"/debts/{debt_id}/schedule", params={"months": 6})
    assert sched.status_code == 200
    # No interest component
    for row in sched.json()["schedule"]:
        assert row["interest"] == 0.0


async def test_schedule_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.get(
        "/debts/00000000-0000-0000-0000-000000000000/schedule",
        params={"months": 12},
    )
    assert resp.status_code == 404


# ── Summary ───────────────────────────────────────────────────────────────────

async def test_summary(auth_client: AsyncClient) -> None:
    await auth_client.post(
        "/debts",
        json={
            "name": "Debt1", "type": "personal_loan",
            "total_amount": 100000.0, "remaining_balance": 80000.0, "emi_amount": 5000.0,
        },
    )
    await auth_client.post(
        "/debts",
        json={
            "name": "Debt2", "type": "credit_card",
            "total_amount": 20000.0, "remaining_balance": 15000.0, "emi_amount": 2000.0,
        },
    )

    summary = await auth_client.get("/debts/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["total_outstanding"] >= 95000.0
    assert body["monthly_emi_total"] >= 7000.0
    assert body["active_count"] >= 2
