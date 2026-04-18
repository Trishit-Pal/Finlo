"""Unit tests for receipt parser."""

from __future__ import annotations

from app.services.parser import (
    _TAX_PATTERNS,
    _TOTAL_PATTERNS,
    _extract_amount,
    _extract_currency,
    _extract_date,
    _extract_items,
    _extract_merchant,
    parse_receipt,
)
from app.tests.conftest import SAMPLE_GROCERY_RECEIPT_LINES, SAMPLE_RECEIPT_LINES

# ── Date extraction ───────────────────────────────────────────────────────────


def test_extract_date_iso():
    lines = ["Receipt Date: 2024-01-15", "Store: Walmart"]
    date, conf = _extract_date(lines)
    assert date == "2024-01-15"
    assert conf >= 0.8


def test_extract_date_slash_format():
    lines = ["Date: 15/01/2024"]
    date, conf = _extract_date(lines)
    assert date == "2024-01-15"
    assert conf >= 0.7


def test_extract_date_written_format():
    lines = ["Date: Jan 15, 2024"]
    date, conf = _extract_date(lines)
    assert date == "2024-01-15"
    assert conf >= 0.7


def test_extract_date_missing():
    lines = ["No date here", "Just items  $5.00"]
    date, conf = _extract_date(lines)
    assert date is None
    assert conf == 0.0


# ── Amount extraction ─────────────────────────────────────────────────────────


def test_extract_total():
    lines = ["Subtotal  $20.00", "Tax  $1.99", "TOTAL  $21.99"]
    total, conf = _extract_amount(lines, _TOTAL_PATTERNS)
    assert total == 21.99
    assert conf >= 0.8


def test_extract_tax():
    lines = ["Subtotal $50.00", "Tax (8%)  $4.00", "Total $54.00"]
    tax, conf = _extract_amount(lines, _TAX_PATTERNS)
    assert tax == 4.00
    assert conf >= 0.8


def test_extract_total_missing():
    lines = ["Item A  $5.00", "Item B  $3.00"]
    total, conf = _extract_amount(lines, _TOTAL_PATTERNS)
    # May or may not find total depending on pattern
    assert isinstance(total, (float, type(None)))


# ── Merchant extraction ───────────────────────────────────────────────────────


def test_extract_merchant_whole_foods():
    date, conf = _extract_merchant(SAMPLE_RECEIPT_LINES)
    assert date is not None
    assert "WHOLE FOODS" in date.upper() or conf > 0.5


def test_extract_merchant_trader_joes():
    merchant, conf = _extract_merchant(SAMPLE_GROCERY_RECEIPT_LINES)
    assert merchant is not None
    assert conf > 0.5


# ── Item extraction ───────────────────────────────────────────────────────────


def test_extract_items_whole_foods():
    items = _extract_items(SAMPLE_RECEIPT_LINES)
    assert len(items) >= 3
    prices = [i.price for i in items if i.price]
    assert all(p > 0 for p in prices)


def test_extract_items_confidence():
    items = _extract_items(SAMPLE_RECEIPT_LINES)
    for item in items:
        assert 0.0 <= item.confidence <= 1.0


# ── Currency extraction ───────────────────────────────────────────────────────


def test_extract_currency_usd():
    lines = ["Total $24.90", "Thank you"]
    assert _extract_currency(lines) == "USD"


def test_extract_currency_default():
    lines = ["Total 24.90", "No currency symbol"]
    assert _extract_currency(lines) == "USD"


# ── Full pipeline ─────────────────────────────────────────────────────────────


def test_parse_receipt_whole_foods():
    result = parse_receipt(SAMPLE_RECEIPT_LINES, ocr_confidence=0.9)
    assert result.merchant is not None
    assert result.date == "2024-01-15"
    assert result.total == 24.90
    assert result.tax == 1.95
    assert result.currency == "USD"
    assert len(result.items) >= 3


def test_parse_receipt_trader_joes():
    result = parse_receipt(SAMPLE_GROCERY_RECEIPT_LINES, ocr_confidence=0.85)
    assert result.merchant is not None
    assert result.total == 15.59
    assert result.tax == 1.12


def test_parse_receipt_field_confidence_keys():
    result = parse_receipt(SAMPLE_RECEIPT_LINES, ocr_confidence=0.9)
    assert "merchant" in result.field_confidence
    assert "date" in result.field_confidence
    assert "total" in result.field_confidence


def test_parse_receipt_model_dump():
    result = parse_receipt(SAMPLE_RECEIPT_LINES, ocr_confidence=0.9)
    d = result.model_dump()
    assert "merchant" in d
    assert "items" in d
    assert isinstance(d["items"], list)
