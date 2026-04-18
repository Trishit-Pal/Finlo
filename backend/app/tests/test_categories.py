"""End-to-end tests for categories endpoints."""

from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

_TODAY = date.today().isoformat()


# ── Init defaults ──────────────────────────────────────────────────────────────

async def test_init_creates_13_defaults(auth_client: AsyncClient) -> None:
    resp = await auth_client.post("/categories/init")
    assert resp.status_code == 200
    cats = resp.json()
    assert len(cats) == 13
    names = {c["name"] for c in cats}
    expected = {
        "Food & Dining", "Transport", "Groceries", "Shopping", "Health",
        "Utilities", "Entertainment", "Education", "Travel", "EMI/Loan",
        "Rent", "Savings", "Miscellaneous",
    }
    assert names == expected
    assert all(c["is_default"] for c in cats)


async def test_init_idempotent(auth_client: AsyncClient) -> None:
    await auth_client.post("/categories/init")
    resp2 = await auth_client.post("/categories/init")
    assert resp2.status_code == 200
    # Should return the same 13, not create 26
    assert len(resp2.json()) == 13


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def test_create_and_list(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/categories",
        json={"name": "Subscriptions", "icon": "tv", "color": "#8b5cf6"},
    )
    assert resp.status_code == 201, resp.text
    cat = resp.json()
    assert cat["name"] == "Subscriptions"
    assert cat["is_archived"] is False
    assert cat["is_default"] is False

    listed = await auth_client.get("/categories")
    assert listed.status_code == 200
    names = [c["name"] for c in listed.json()]
    assert "Subscriptions" in names


async def test_create_missing_name(auth_client: AsyncClient) -> None:
    resp = await auth_client.post("/categories", json={"icon": "x"})
    assert resp.status_code == 422


async def test_update_category(auth_client: AsyncClient) -> None:
    create = await auth_client.post(
        "/categories",
        json={"name": "OldCat", "color": "#000000"},
    )
    cat_id = create.json()["id"]

    upd = await auth_client.patch(f"/categories/{cat_id}", json={"name": "NewCat", "color": "#ffffff"})
    assert upd.status_code == 200
    assert upd.json()["name"] == "NewCat"
    assert upd.json()["color"] == "#ffffff"


async def test_update_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.patch(
        "/categories/00000000-0000-0000-0000-000000000000",
        json={"name": "X"},
    )
    assert resp.status_code == 404


async def test_archive_via_update(auth_client: AsyncClient) -> None:
    create = await auth_client.post("/categories", json={"name": "ArchiveMe"})
    cat_id = create.json()["id"]

    upd = await auth_client.patch(f"/categories/{cat_id}", json={"is_archived": True})
    assert upd.status_code == 200
    assert upd.json()["is_archived"] is True

    # Archived category excluded from default list
    listed = await auth_client.get("/categories")
    names = [c["name"] for c in listed.json()]
    assert "ArchiveMe" not in names

    # But appears with include_archived=true
    listed_all = await auth_client.get("/categories", params={"include_archived": "true"})
    names_all = [c["name"] for c in listed_all.json()]
    assert "ArchiveMe" in names_all


# ── Delete: archive guard ──────────────────────────────────────────────────────

async def test_delete_unused_category(auth_client: AsyncClient) -> None:
    create = await auth_client.post("/categories", json={"name": "DeleteMe"})
    cat_id = create.json()["id"]

    resp = await auth_client.delete(f"/categories/{cat_id}")
    assert resp.status_code == 200
    assert "deleted" in resp.json()["detail"]

    listed = await auth_client.get("/categories", params={"include_archived": "true"})
    ids = [c["id"] for c in listed.json()]
    assert cat_id not in ids


async def test_delete_linked_category_archives_instead(auth_client: AsyncClient) -> None:
    """Deleting a category that has linked transactions must archive, not delete."""
    create = await auth_client.post("/categories", json={"name": "LinkedCat"})
    cat_id = create.json()["id"]

    # Create a transaction linked to this category via category_id
    resp = await auth_client.post(
        "/transactions",
        json={
            "date": _TODAY,
            "merchant": "Test Merchant",
            "amount": 500.0,
            "category": "LinkedCat",
            "category_id": cat_id,
            "type": "expense",
        },
    )
    assert resp.status_code == 201, resp.text

    resp = await auth_client.delete(f"/categories/{cat_id}")
    assert resp.status_code == 200
    assert "archived" in resp.json()["detail"]

    # Must still exist (archived)
    listed_all = await auth_client.get("/categories", params={"include_archived": "true"})
    cat = next((c for c in listed_all.json() if c["id"] == cat_id), None)
    assert cat is not None
    assert cat["is_archived"] is True


async def test_delete_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.delete("/categories/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
