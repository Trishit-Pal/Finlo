from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_profile_immutable_username_and_dob(auth_client: AsyncClient):
    first = await auth_client.patch(
        "/auth/me",
        json={
            "profile": {
                "username": "immutable_user",
                "date_of_birth": "1998-02-14",
                "city": "Bengaluru",
            }
        },
        headers={"X-Profile-Source": "manual"},
    )
    assert first.status_code == 200
    first_data = first.json()
    assert first_data["profile"]["username"] == "immutable_user"
    assert first_data["profile"]["date_of_birth"] == "1998-02-14"
    assert first_data["profile"]["username_source"] == "manual"
    assert first_data["profile"]["date_of_birth_source"] == "manual"

    # Within 24-hour grace period, these should now SUCCEED (previously 409)
    mutate_username = await auth_client.patch(
        "/auth/me",
        json={"profile": {"username": "changed_username"}},
    )
    assert mutate_username.status_code == 200
    assert mutate_username.json()["profile"]["username"] == "changed_username"

    mutate_dob = await auth_client.patch(
        "/auth/me",
        json={"profile": {"date_of_birth": "2000-01-01"}},
    )
    assert mutate_dob.status_code == 200
    assert mutate_dob.json()["profile"]["date_of_birth"] == "2000-01-01"

    same_values_ok = await auth_client.patch(
        "/auth/me",
        json={
            "profile": {
                "date_of_birth": "1998-02-14",
                "city": "Pune",
            }
        },
    )
    assert same_values_ok.status_code == 200
    assert same_values_ok.json()["profile"]["city"] == "Pune"


async def test_budget_edit_once_and_history(auth_client: AsyncClient):
    create = await auth_client.post(
        "/budgets",
        json={
            "month": 4,
            "year": 2026,
            "category": "Groceries",
            "limit_amount": 10000,
            "soft_alert": 0.8,
            "hard_alert": 1.0,
        },
    )
    assert create.status_code == 201
    budget = create.json()

    first_edit = await auth_client.patch(
        f"/budgets/{budget['id']}",
        json={"limit_amount": 12000, "soft_alert": 0.75},
    )
    assert first_edit.status_code == 200
    first_edit_data = first_edit.json()
    assert first_edit_data["limit_amount"] == 12000
    assert first_edit_data["edit_count"] == 1
    assert first_edit_data["can_edit"] is True  # True because of 24-hour grace period

    # Within 24-hour grace period, second edit should now SUCCEED (previously 409)
    second_edit = await auth_client.patch(
        f"/budgets/{budget['id']}",
        json={"limit_amount": 13000},
    )
    assert second_edit.status_code == 200
    assert second_edit.json()["limit_amount"] == 13000
    assert second_edit.json()["edit_count"] == 2
    assert second_edit.json()["can_edit"] is True  # still True because of grace period

    history = await auth_client.get(f"/budgets/{budget['id']}/history")
    assert history.status_code == 200
    history_items = history.json()
    assert len(history_items) >= 2
    assert history_items[0]["change_reason"] == "create"
    assert history_items[-1]["change_reason"] == "update"


async def test_statement_import_requires_explicit_consent(auth_client: AsyncClient):
    csv_payload = (
        "date,merchant,amount,category\n2026-04-01,Cafe Blue,250.00,Food & Dining\n"
    )

    blocked = await auth_client.post(
        "/transactions/import",
        files={"file": ("transactions.csv", csv_payload, "text/csv")},
    )
    assert blocked.status_code == 403

    grant = await auth_client.post(
        "/integrations/consents",
        json={
            "consent_type": "statement_import",
            "scope": "transactions",
            "status": "granted",
            "metadata": {"source": "test"},
        },
    )
    assert grant.status_code == 200

    imported = await auth_client.post(
        "/transactions/import",
        files={"file": ("transactions.csv", csv_payload, "text/csv")},
    )
    assert imported.status_code == 200
    imported_data = imported.json()
    assert imported_data["imported"] == 1
    assert imported_data["skipped"] == 0


async def test_receipt_duplicate_detection_and_confirm_idempotency(
    auth_client: AsyncClient,
):
    payload = {
        "text": "ACME STORE\\nDate: 2026-04-01\\nTax 5.00\\nTOTAL 105.00",
        "confidence": 93,
    }

    first_upload = await auth_client.post(
        "/upload",
        data={
            "client_side_ocr": "true",
            "parsed_json": json.dumps(payload),
        },
    )
    assert first_upload.status_code == 201
    first_data = first_upload.json()
    assert first_data["duplicate_detected"] is False

    second_upload = await auth_client.post(
        "/upload",
        data={
            "client_side_ocr": "true",
            "parsed_json": json.dumps(payload),
        },
    )
    assert second_upload.status_code == 201
    second_data = second_upload.json()
    assert second_data["duplicate_detected"] is True
    assert second_data["duplicate_of_receipt_id"] == first_data["receipt_id"]

    confirm_payload = {
        "receipt_id": second_data["receipt_id"],
        "edits": {
            "merchant": "ACME STORE",
            "date": "2026-04-01",
            "total": 105.0,
            "currency": "INR",
            "category_suggestion": "Shopping",
            "recurring_indicator": False,
            "items": [],
        },
    }

    confirm_once = await auth_client.post("/confirm", json=confirm_payload)
    assert confirm_once.status_code == 200

    confirm_twice = await auth_client.post("/confirm", json=confirm_payload)
    assert confirm_twice.status_code == 200

    txns = await auth_client.get("/transactions")
    assert txns.status_code == 200
    linked = [
        t
        for t in txns.json()["items"]
        if t.get("receipt_id") == second_data["receipt_id"]
    ]
    assert len(linked) == 1
