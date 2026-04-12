"""Unit tests for the categorizer service."""
from __future__ import annotations

import pytest

from app.services.categorizer import (
    CATEGORY_SEEDS,
    MERCHANT_CATEGORY_MAP,
    _lookup_merchant,
    categorize_single,
)

# ── Merchant lookup ───────────────────────────────────────────────────────────

def test_lookup_walmart():
    assert _lookup_merchant("Walmart Supercenter") == "Groceries"


def test_lookup_starbucks():
    assert _lookup_merchant("Starbucks Coffee #1234") == "Dining & Restaurants"


def test_lookup_uber():
    assert _lookup_merchant("Uber Technologies") == "Transportation"


def test_lookup_netflix():
    assert _lookup_merchant("NETFLIX.COM") == "Subscriptions"


def test_lookup_unknown_returns_none():
    assert _lookup_merchant("Some Unknown Store XYZ") is None


def test_lookup_case_insensitive():
    assert _lookup_merchant("UBER EATS") == "Transportation"
    assert _lookup_merchant("whole foods market") == "Groceries"


def test_all_lookup_values_have_valid_categories():
    valid_categories = set(CATEGORY_SEEDS.keys()) | {"Shopping", "Housing", "Other"}
    for merchant, cat in MERCHANT_CATEGORY_MAP.items():
        assert cat in valid_categories, f"Unknown category '{cat}' for merchant '{merchant}'"


# ── categorize_single (sync path — no LLM key set in test env) ───────────────

@pytest.mark.asyncio
async def test_categorize_walmart():
    result = await categorize_single("Walmart")
    assert result["category"] == "Groceries"
    assert result["confidence"] >= 0.9


@pytest.mark.asyncio
async def test_categorize_starbucks():
    result = await categorize_single("Starbucks")
    assert result["category"] == "Dining & Restaurants"


@pytest.mark.asyncio
async def test_categorize_unknown_falls_back():
    """Unknown merchant without LLM key should return 'Other' with low confidence."""
    result = await categorize_single("Zephyr Boutique 1234")
    assert "category" in result
    assert "confidence" in result
    assert isinstance(result["confidence"], float)


@pytest.mark.asyncio
async def test_categorize_returns_dict():
    result = await categorize_single("CVS Pharmacy")
    assert isinstance(result, dict)
    assert result["category"] == "Healthcare"


@pytest.mark.asyncio
async def test_categorize_items_list():
    from app.services.categorizer import categorize_items
    items = [
        {"name": "Organic Bananas", "price": 1.49, "quantity": 1.0, "confidence": 0.9},
        {"name": "Greek Yogurt", "price": 4.99, "quantity": 1.0, "confidence": 0.85},
    ]
    enriched = await categorize_items(items, "test-user-id")
    for item in enriched:
        assert "category" in item
        assert item["category"] is not None
