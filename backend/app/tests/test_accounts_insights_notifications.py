"""End-to-end tests for accounts, insights, and notifications endpoints."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── Accounts ──────────────────────────────────────────────────────────────────


async def test_account_crud_and_net_worth(auth_client: AsyncClient):
    # Create a bank account
    resp = await auth_client.post(
        "/accounts",
        json={
            "name": "HDFC Savings",
            "type": "bank",
            "opening_balance": 50000.0,
            "currency": "INR",
        },
    )
    assert resp.status_code == 201, resp.text
    bank = resp.json()
    assert bank["name"] == "HDFC Savings"
    assert bank["current_balance"] == 50000.0

    # Create a credit card (liability)
    resp = await auth_client.post(
        "/accounts",
        json={
            "name": "Axis Credit",
            "type": "credit_card",
            "opening_balance": -12000.0,
            "currency": "INR",
        },
    )
    assert resp.status_code == 201
    cc = resp.json()

    # Duplicate name is rejected
    dup = await auth_client.post(
        "/accounts",
        json={"name": "HDFC Savings", "type": "bank"},
    )
    assert dup.status_code == 409

    # Invalid type rejected via model_post_init -> 422
    bad = await auth_client.post(
        "/accounts",
        json={"name": "Weird", "type": "wormhole"},
    )
    assert bad.status_code == 422

    # List accounts
    listed = await auth_client.get("/accounts")
    assert listed.status_code == 200
    names = {a["name"] for a in listed.json()["items"]}
    assert {"HDFC Savings", "Axis Credit"}.issubset(names)

    # Update bank balance
    upd = await auth_client.patch(
        f"/accounts/{bank['id']}",
        json={"current_balance": 45000.0},
    )
    assert upd.status_code == 200
    assert upd.json()["current_balance"] == 45000.0

    # Snapshot
    snap = await auth_client.post(
        f"/accounts/{bank['id']}/snapshots",
        json={"date": date.today().isoformat(), "balance": 48000.0, "notes": "mid-month"},
    )
    assert snap.status_code == 201
    assert snap.json()["balance"] == 48000.0

    # Net worth: assets 48000 (after snapshot bumped current_balance), liabilities 12000
    nw = await auth_client.get("/accounts/net-worth")
    assert nw.status_code == 200
    body = nw.json()
    assert body["total_assets"] == 48000.0
    assert body["total_liabilities"] == 12000.0
    assert body["net_worth"] == 36000.0

    # Delete CC
    d = await auth_client.delete(f"/accounts/{cc['id']}")
    assert d.status_code == 204

    # Non-existent update -> 404
    miss = await auth_client.patch(
        "/accounts/00000000-0000-0000-0000-000000000000",
        json={"current_balance": 1.0},
    )
    assert miss.status_code == 404


# ── Insights ──────────────────────────────────────────────────────────────────


async def _seed_tx(client: AsyncClient, d: str, merchant: str, amount: float,
                   category: str, t_type: str = "expense") -> None:
    resp = await client.post(
        "/transactions",
        json={
            "date": d,
            "merchant": merchant,
            "amount": amount,
            "category": category,
            "type": t_type,
        },
    )
    assert resp.status_code == 201, resp.text


async def test_insights_generation_budget_overrun_and_trends(
    auth_client: AsyncClient,
):
    today = date.today()
    current_prefix = today.strftime("%Y-%m")
    last_month_day = (today.replace(day=1) - timedelta(days=5)).isoformat()

    # Seed current-month transactions dominated by one category (spike)
    await _seed_tx(auth_client, f"{current_prefix}-02", "Zomato", 800.0, "Dining & Restaurants")
    await _seed_tx(auth_client, f"{current_prefix}-05", "Swiggy", 900.0, "Dining & Restaurants")
    await _seed_tx(auth_client, f"{current_prefix}-07", "Salary", 50000.0,
                   "Savings & Investments", t_type="income")

    # Previous-month baseline for comparison
    await _seed_tx(auth_client, last_month_day, "Zomato", 200.0, "Dining & Restaurants")

    # Create a budget the current spend overruns
    budget_resp = await auth_client.post(
        "/budgets",
        json={
            "month": today.month,
            "year": today.year,
            "category": "Dining & Restaurants",
            "limit_amount": 500.0,
        },
    )
    assert budget_resp.status_code in (200, 201), budget_resp.text

    # Refresh insights
    insights_resp = await auth_client.get("/insights", params={"refresh": "true"})
    assert insights_resp.status_code == 200
    insights = insights_resp.json()
    # At least the budget_risk insight should fire given the 1700 vs 500 overrun
    types = {i["type"] for i in insights}
    assert "budget_risk" in types

    # Dismiss one insight
    dismiss_id = insights[0]["id"]
    d = await auth_client.post(f"/insights/{dismiss_id}/dismiss")
    assert d.status_code == 204

    # Listing again should skip dismissed
    after = await auth_client.get("/insights")
    assert dismiss_id not in {i["id"] for i in after.json()}

    # Trends endpoint
    trends = await auth_client.get("/insights/trends", params={"months": 3})
    assert trends.status_code == 200
    tbody = trends.json()
    assert len(tbody["months"]) == 3
    assert tbody["total_expense"] >= 1700.0
    assert tbody["total_income"] >= 50000.0


# ── Notifications ─────────────────────────────────────────────────────────────


async def test_bill_reminder_dispatch_and_read_markers(
    auth_client: AsyncClient, test_user, db,
):
    from app.api.notifications import dispatch_bill_reminders
    from app.db.models import Bill

    today = date.today()
    # Due tomorrow, reminder window 3 days -> should fire
    due = Bill(
        user_id=test_user.id,
        name="Electricity",
        amount=1450.75,
        due_date=(today + timedelta(days=1)).isoformat(),
        frequency="monthly",
        reminder_lead_days=3,
    )
    # Due in 30 days -> should NOT fire
    far = Bill(
        user_id=test_user.id,
        name="Broadband",
        amount=999.0,
        due_date=(today + timedelta(days=30)).isoformat(),
        frequency="monthly",
        reminder_lead_days=3,
    )
    # Already paid -> should NOT fire even if due today
    paid = Bill(
        user_id=test_user.id,
        name="Water",
        amount=200.0,
        due_date=today.isoformat(),
        frequency="monthly",
        reminder_lead_days=3,
        is_paid=True,
    )
    db.add_all([due, far, paid])
    await db.flush()

    created = await dispatch_bill_reminders(db, test_user.id)
    assert created == 1

    # Second dispatch should dedupe (no new notification for same bill)
    again = await dispatch_bill_reminders(db, test_user.id)
    assert again == 0

    # List via API
    resp = await auth_client.get("/notifications")
    assert resp.status_code == 200
    notes = resp.json()
    assert any(n["title"].startswith("Electricity is due") for n in notes)

    unread = await auth_client.get("/notifications/unread-count")
    assert unread.status_code == 200
    assert unread.json()["count"] >= 1

    only_unread = await auth_client.get("/notifications", params={"unread_only": "true"})
    assert only_unread.status_code == 200
    assert all(not n["is_read"] for n in only_unread.json())

    target_id = notes[0]["id"]
    mark = await auth_client.patch(f"/notifications/{target_id}/read")
    assert mark.status_code == 200
    assert mark.json()["is_read"] is True

    # Mark-all-read
    ma = await auth_client.post("/notifications/mark-all-read")
    assert ma.status_code == 200

    final_unread = await auth_client.get("/notifications/unread-count")
    assert final_unread.json()["count"] == 0

    # Unknown id -> 404
    miss = await auth_client.patch(
        "/notifications/00000000-0000-0000-0000-000000000000/read"
    )
    assert miss.status_code == 404
