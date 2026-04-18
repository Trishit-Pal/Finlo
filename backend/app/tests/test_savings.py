"""End-to-end tests for savings goals endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_and_list(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/savings",
        json={
            "name": "Emergency Fund",
            "target_amount": 100000.0,
            "current_amount": 20000.0,
            "deadline": "2026-12-31",
        },
    )
    assert resp.status_code == 201, resp.text
    goal = resp.json()
    assert goal["name"] == "Emergency Fund"
    assert goal["target_amount"] == 100000.0
    assert goal["current_amount"] == 20000.0

    listed = await auth_client.get("/savings")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1
    names = [g["name"] for g in listed.json()["items"]]
    assert "Emergency Fund" in names


async def test_create_minimal(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/savings",
        json={"name": "Vacation", "target_amount": 50000.0},
    )
    assert resp.status_code == 201
    assert resp.json()["current_amount"] == 0.0
    assert resp.json()["deadline"] is None


async def test_zero_target_rejected(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/savings",
        json={"name": "Bad", "target_amount": 0.0},
    )
    assert resp.status_code == 422


async def test_update_goal(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/savings",
        json={"name": "OldName", "target_amount": 10000.0},
    )
    goal_id = create.json()["id"]

    upd = await auth_client.patch(
        f"/savings/{goal_id}",
        json={"name": "NewName", "target_amount": 25000.0},
    )
    assert upd.status_code == 200
    assert upd.json()["name"] == "NewName"
    assert upd.json()["target_amount"] == 25000.0


async def test_update_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.patch(
        "/savings/00000000-0000-0000-0000-000000000000",
        json={"name": "X"},
    )
    assert resp.status_code == 404


async def test_delete(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/savings",
        json={"name": "ToDelete", "target_amount": 5000.0},
    )
    goal_id = create.json()["id"]

    del_resp = await auth_client.delete(f"/savings/{goal_id}")
    assert del_resp.status_code == 200

    listed = await auth_client.get("/savings")
    ids = [g["id"] for g in listed.json()["items"]]
    assert goal_id not in ids


async def test_delete_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.delete("/savings/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


# ── Contribute ────────────────────────────────────────────────────────────────

async def test_contribute_increases_amount(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/savings",
        json={"name": "Contribute Test", "target_amount": 50000.0, "current_amount": 10000.0},
    )
    goal_id = create.json()["id"]

    resp = await auth_client.post(f"/savings/{goal_id}/contribute", json={"amount": 5000.0})
    assert resp.status_code == 200
    assert resp.json()["current_amount"] == 15000.0


async def test_contribute_clamps_at_target(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/savings",
        json={"name": "AlmostFull", "target_amount": 10000.0, "current_amount": 9000.0},
    )
    goal_id = create.json()["id"]

    # Contributing more than remaining should clamp to target
    resp = await auth_client.post(f"/savings/{goal_id}/contribute", json={"amount": 5000.0})
    assert resp.status_code == 200
    assert resp.json()["current_amount"] == 10000.0


async def test_contribute_zero_rejected(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/savings",
        json={"name": "ZeroContrib", "target_amount": 5000.0},
    )
    goal_id = create.json()["id"]

    resp = await auth_client.post(f"/savings/{goal_id}/contribute", json={"amount": 0.0})
    assert resp.status_code == 422


async def test_contribute_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/savings/00000000-0000-0000-0000-000000000000/contribute",
        json={"amount": 100.0},
    )
    assert resp.status_code == 404


async def test_multiple_contributions(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/savings",
        json={"name": "MultiContrib", "target_amount": 30000.0},
    )
    goal_id = create.json()["id"]

    for amount in [5000.0, 3000.0, 7000.0]:
        await auth_client.post(f"/savings/{goal_id}/contribute", json={"amount": amount})

    final = await auth_client.get("/savings")
    goal = next(g for g in final.json()["items"] if g["id"] == goal_id)
    assert goal["current_amount"] == 15000.0
