"""Integration tests: full upload → confirm → dashboard flow."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── Auth flow ─────────────────────────────────────────────────────────────────


async def test_health_check(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_signup_and_signin(client: AsyncClient):
    # Sign up
    resp = await client.post(
        "/auth/signup",
        json={
            "email": "integration@example.com",
            "password": "SecurePass123!",
            "full_name": "Integration Test",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "integration@example.com"

    # Sign in
    resp2 = await client.post(
        "/auth/signin",
        json={
            "email": "integration@example.com",
            "password": "SecurePass123!",
        },
    )
    assert resp2.status_code == 200
    assert "access_token" in resp2.json()


async def test_signup_duplicate_email(auth_client: AsyncClient, test_user):
    resp = await auth_client.post(
        "/auth/signup",
        json={
            "email": test_user.email,
            "password": "SecurePass123!",
        },
    )
    assert resp.status_code == 409


async def test_get_me(auth_client: AsyncClient, test_user):
    resp = await auth_client.get("/auth/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == test_user.email


# ── Transaction flow ──────────────────────────────────────────────────────────


async def test_create_transaction(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/transactions",
        json={
            "date": "2024-01-15",
            "merchant": "Whole Foods",
            "amount": 45.50,
            "category": "Groceries",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["merchant"] == "Whole Foods"
    assert data["amount"] == 45.50
    assert "id" in data


async def test_list_transactions(auth_client: AsyncClient):
    # Create a couple
    for i in range(3):
        await auth_client.post(
            "/transactions",
            json={
                "date": f"2024-01-{15 + i}",
                "merchant": f"Store {i}",
                "amount": 10.0 * (i + 1),
            },
        )
    resp = await auth_client.get("/transactions")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] >= 3


async def test_transaction_filter_by_category(auth_client: AsyncClient):
    await auth_client.post(
        "/transactions",
        json={
            "date": "2024-01-20",
            "merchant": "Netflix",
            "amount": 15.99,
            "category": "Subscriptions",
        },
    )
    resp = await auth_client.get("/transactions?category=Subscriptions")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(t["category"] == "Subscriptions" for t in items)


async def test_delete_transaction(auth_client: AsyncClient):
    create_resp = await auth_client.post(
        "/transactions",
        json={
            "date": "2024-01-10",
            "merchant": "Delete Me Store",
            "amount": 9.99,
        },
    )
    txn_id = create_resp.json()["id"]
    del_resp = await auth_client.delete(f"/transactions/{txn_id}")
    assert del_resp.status_code == 204


# ── Budget flow ───────────────────────────────────────────────────────────────


async def test_create_budget(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/budgets",
        json={
            "month": 1,
            "year": 2024,
            "category": "Groceries",
            "limit_amount": 500.0,
            "soft_alert": 0.8,
            "hard_alert": 1.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["category"] == "Groceries"
    assert data["limit_amount"] == 500.0
    assert "alert_level" in data


async def test_budget_duplicate_rejected(auth_client: AsyncClient):
    payload = {
        "month": 2,
        "year": 2024,
        "category": "Dining & Restaurants",
        "limit_amount": 200.0,
    }
    await auth_client.post("/budgets", json=payload)
    resp = await auth_client.post("/budgets", json=payload)
    assert resp.status_code == 409


async def test_update_budget(auth_client: AsyncClient):
    create = await auth_client.post(
        "/budgets",
        json={
            "month": 3,
            "year": 2024,
            "category": "Entertainment",
            "limit_amount": 100.0,
        },
    )
    bid = create.json()["id"]
    resp = await auth_client.patch(f"/budgets/{bid}", json={"limit_amount": 150.0})
    assert resp.status_code == 200
    assert resp.json()["limit_amount"] == 150.0


# ── Feedback flow ─────────────────────────────────────────────────────────────


async def test_submit_feedback(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/feedback",
        json={
            "rating": 4,
            "text": "Great app, love the budget tracking feature!",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "feedback_id" in data


async def test_feedback_with_feature_request(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/feedback",
        json={
            "rating": 3,
            "text": "Would be nice to have bank sync",
            "feature_request": "Automatic bank account synchronization",
        },
    )
    assert resp.status_code == 201


# ── Dashboard ─────────────────────────────────────────────────────────────────


async def test_dashboard(auth_client: AsyncClient):
    # Seed some data
    await auth_client.post(
        "/transactions",
        json={
            "date": "2024-01-15",
            "merchant": "Starbucks",
            "amount": 8.50,
            "category": "Dining & Restaurants",
        },
    )
    await auth_client.post(
        "/transactions",
        json={
            "date": "2024-01-16",
            "merchant": "Whole Foods",
            "amount": 55.0,
            "category": "Groceries",
        },
    )

    resp = await auth_client.get("/coach/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert "totals_by_category" in data
    assert "weekly_trend" in data
    assert "budget_status" in data
    assert "coach_suggestions" in data


# ── Coach suggestions ─────────────────────────────────────────────────────────


async def test_get_suggestions(auth_client: AsyncClient):
    resp = await auth_client.get("/coach/suggestions")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_admin_requires_admin_role(auth_client: AsyncClient):
    resp = await auth_client.get("/admin/analytics")
    assert resp.status_code == 403


async def test_admin_analytics(admin_client: AsyncClient):
    resp = await admin_client.get("/admin/analytics")
    assert resp.status_code == 200
    data = resp.json()
    assert "correction_rate" in data
    assert "suggestion_acceptance_rate" in data
    assert "dau_approx" in data
