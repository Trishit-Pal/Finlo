"""Receipt parser: regex pipeline + LLM fallback."""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# ── Regex patterns ────────────────────────────────────────────────────────────

_DATE_PATTERNS = [
    r"\b(\d{4}[-/]\d{2}[-/]\d{2})\b",  # 2024-01-15
    r"\b(\d{2}[-/]\d{2}[-/]\d{4})\b",  # 15/01/2024
    (
        r"\b("
        r"\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
        r"[a-z]*\.?\s+\d{4}"
        r")\b"
    ),  # 15 Jan 2024
    (
        r"\b("
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
        r"[a-z]*\.?\s+\d{1,2},?\s+\d{4}"
        r")\b"
    ),  # Jan 15, 2024
]

_DUE_DATE_PATTERNS = [
    (r"(?:due\s*date|payment\s*due|bill\s*due)[:\s-]+(\d{4}[-/]\d{2}[-/]\d{2})"),
    (r"(?:due\s*date|payment\s*due|bill\s*due)[:\s-]+(\d{2}[-/]\d{2}[-/]\d{4})"),
    (
        r"(?:due\s*date|payment\s*due|bill\s*due)[:\s-]+("
        r"\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
        r"[a-z]*\.?\s+\d{4}"
        r")"
    ),
    (
        r"(?:due\s*date|payment\s*due|bill\s*due)[:\s-]+("
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
        r"[a-z]*\.?\s+\d{1,2},?\s+\d{4}"
        r")"
    ),
]

_TOTAL_PATTERNS = [
    (
        r"(?:total|amount\s+due|grand\s+total|balance\s+due|total\s+amount)"
        r"[:\s*]+\$?([0-9,]+\.[0-9]{2})"
    ),
    r"\bTOTAL[:\s]+\$?([0-9,]+\.[0-9]{2})",
    r"\$([0-9,]+\.[0-9]{2})\s*$",
]

_TAX_PATTERNS = [
    r"(?:tax|vat|gst|hst|sales\s+tax).*?\$?([0-9,]+\.[0-9]{2})",
    r"TAX[:\s]+\$?([0-9,]+\.[0-9]{2})",
]

_CURRENCY_MAP = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "₹": "INR",
    "CAD": "CAD",
    "AUD": "AUD",
    "USD": "USD",
    "EUR": "EUR",
    "GBP": "GBP",
    "INR": "INR",
}

_ITEM_LINE_PATTERN = re.compile(
    (
        r"^(?P<name>[A-Za-z][A-Za-z0-9 &,\-\'\.]+?)\s+"
        r"(?:\d+\s*[xX@]\s*)?"
        r"(?P<price>\$?[0-9]+\.[0-9]{2})\s*$"
    )
)

_SKIP_LINES = re.compile(
    (
        r"\b(receipt|thank\s+you|store|address|phone|tel|fax|www\.|http|loyalty|rewards|"
        r"cashier|register|subtotal|tax|total|change|card|visa|mastercard|cash|approved|transaction)\b"
    ),
    re.IGNORECASE,
)


class ParsedItem:
    def __init__(
        self,
        name: str,
        price: Optional[float],
        quantity: Optional[float],
        confidence: float,
    ):
        self.name = name
        self.price = price
        self.quantity = quantity
        self.confidence = confidence
        self.category: Optional[str] = None

    def model_dump(self) -> dict:
        return {
            "name": self.name,
            "price": self.price,
            "quantity": self.quantity,
            "category": self.category,
            "confidence": self.confidence,
        }


class ParsedReceipt:
    def __init__(self):
        self.merchant: Optional[str] = None
        self.date: Optional[str] = None
        self.due_date: Optional[str] = None
        self.total: Optional[float] = None
        self.tax: Optional[float] = None
        self.currency: str = "USD"
        self.category_suggestion: Optional[str] = None
        self.recurring_indicator: bool = False
        self.account_suffix: Optional[str] = None
        self.parser_provider: str = "regex"
        self.items: list[ParsedItem] = []
        self.field_confidence: dict[str, float] = {}

    def model_dump(self) -> dict:
        return {
            "merchant": self.merchant,
            "date": self.date,
            "due_date": self.due_date,
            "total": self.total,
            "tax": self.tax,
            "currency": self.currency,
            "category_suggestion": self.category_suggestion,
            "recurring_indicator": self.recurring_indicator,
            "account_suffix": self.account_suffix,
            "parser_provider": self.parser_provider,
            "items": [i.model_dump() for i in self.items],
            "field_confidence": self.field_confidence,
        }


def _normalize_date(raw: str) -> Optional[str]:
    from datetime import datetime

    normalized = raw.strip()
    for fmt in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d %B %Y",
        "%d %b %Y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%d %b. %Y",
    ):
        try:
            candidate = normalized if "," in fmt else normalized.replace(",", "")
            dt = datetime.strptime(candidate, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _extract_date(
    lines: list[str], patterns: list[str] | None = None
) -> tuple[Optional[str], float]:
    search_patterns = patterns or _DATE_PATTERNS
    for line in lines:
        for pattern in search_patterns:
            m = re.search(pattern, line, re.IGNORECASE)
            if m:
                raw = m.group(1)
                try:
                    normalized = _normalize_date(raw)
                    if normalized:
                        return normalized, 0.9
                except Exception:
                    return raw, 0.7
    return None, 0.0


def _extract_amount(
    lines: list[str], patterns: list[str]
) -> tuple[Optional[float], float]:
    is_tax_mode = any("tax" in p.lower() for p in patterns)
    is_total_mode = not is_tax_mode and any("total" in p.lower() for p in patterns)

    # Prioritize explicit labels on their own line (e.g. TOTAL, TAX).
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue
        lowered = line_clean.lower()
        if is_total_mode:
            if "subtotal" in lowered:
                continue
            if not any(k in lowered for k in ("total", "amount due", "balance due")):
                continue
        if is_tax_mode and not any(k in lowered for k in ("tax", "vat", "gst", "hst")):
            continue
        for pattern in patterns:
            m = re.search(pattern, line_clean, re.IGNORECASE)
            if m:
                try:
                    return float(m.group(1).replace(",", "")), 0.9
                except ValueError:
                    continue

    full_text = "\n".join(lines)
    for pattern in patterns:
        matches = re.findall(pattern, full_text, re.IGNORECASE)
        if matches:
            candidate = matches[-1]
            if isinstance(candidate, tuple):
                candidate = candidate[0]
            try:
                return float(str(candidate).replace(",", "")), 0.7
            except ValueError:
                continue
    return None, 0.0


def _extract_currency(lines: list[str]) -> str:
    full_text = " ".join(lines[:5])
    for symbol, code in _CURRENCY_MAP.items():
        if symbol in full_text:
            return code
    return "USD"


def _extract_merchant(lines: list[str]) -> tuple[Optional[str], float]:
    # Merchant is usually in the first 3 non-empty lines
    candidates = [
        line.strip() for line in lines[:5] if line.strip() and len(line.strip()) > 2
    ]
    if candidates:
        # Prefer lines that look like business names (title case, no numbers)
        for c in candidates:
            if re.match(r"^[A-Za-z][A-Za-z\s&\'\-\.]{3,}$", c):
                return c[:100], 0.8
        return candidates[0][:100], 0.6
    return None, 0.0


def _extract_items(lines: list[str]) -> list[ParsedItem]:
    items = []
    for line in lines:
        if _SKIP_LINES.search(line):
            continue
        m = _ITEM_LINE_PATTERN.match(line.strip())
        if m:
            name = m.group("name").strip()
            try:
                price = float(m.group("price").replace("$", ""))
                items.append(
                    ParsedItem(name=name, price=price, quantity=1.0, confidence=0.85)
                )
            except ValueError:
                pass
    return items


def _extract_account_suffix(lines: list[str]) -> tuple[Optional[str], float]:
    patterns = [
        r"(?:card|a/c|account)[^\d]{0,10}(?:ending|end|xxxx|\*{2,}|x{2,})[^\d]{0,4}(\d{4})",
        r"(?:ending|end|last\s*4)[^\d]{0,4}(\d{4})",
        r"(?:\*{4}\s*\d{4}|\d{4}\s*\*{4}|\d{2}x{2}\d{2})",
    ]
    full_text = " ".join(lines)
    for pattern in patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if not match:
            continue
        if match.groups():
            return match.group(1), 0.7
        digits = re.findall(r"\d{4}", match.group(0))
        if digits:
            return digits[-1], 0.6
    return None, 0.0


def _is_recurring(lines: list[str]) -> bool:
    full_text = " ".join(lines).lower()
    recurring_markers = [
        "monthly",
        "quarterly",
        "annual",
        "yearly",
        "subscription",
        "autopay",
        "auto pay",
        "recurring",
        "next billing date",
    ]
    return any(marker in full_text for marker in recurring_markers)


def _suggest_category(
    merchant: Optional[str], items: list[ParsedItem]
) -> Optional[str]:
    merchant_lower = (merchant or "").lower()
    mapping = {
        "electric": "Utilities",
        "water": "Utilities",
        "gas": "Utilities",
        "uber": "Transport",
        "ola": "Transport",
        "swiggy": "Food & Dining",
        "zomato": "Food & Dining",
        "netflix": "Entertainment",
        "spotify": "Entertainment",
        "amazon": "Shopping",
        "flipkart": "Shopping",
        "medical": "Health",
        "pharmacy": "Health",
    }
    for keyword, category in mapping.items():
        if keyword in merchant_lower:
            return category

    if items:
        names = " ".join((i.name or "").lower() for i in items)
        if any(x in names for x in ("milk", "bread", "grocery", "vegetable", "fruit")):
            return "Groceries"
        if any(x in names for x in ("fuel", "diesel", "petrol", "bus", "taxi")):
            return "Transport"
        if any(x in names for x in ("movie", "ticket", "game")):
            return "Entertainment"
    return None


async def _llm_fallback(ocr_text: str) -> Optional[dict]:
    """Call LLM for ambiguous receipts. Returns None if no key pool or on failure."""
    try:
        from app.services.llm_client import llm_chat_completion, llm_pool
        from app.services.prompts import PARSER_FALLBACK_PROMPT

        if not llm_pool():
            return None

        response = await llm_chat_completion(
            messages=[
                {
                    "role": "user",
                    "content": PARSER_FALLBACK_PROMPT.format(ocr_text=ocr_text),
                }
            ],
            response_format={"type": "json_object"},
            max_tokens=800,
            temperature=0.1,
            op_name="parser.fallback",
        )
        content = response.choices[0].message.content or "{}"
        return json.loads(content)
    except Exception as e:
        logger.warning("parser.llm_fallback_failed", extra={"err": repr(e)[:200]})
        return None


def parse_receipt(lines: list[str], ocr_confidence: float = 0.8) -> "ParsedReceipt":
    """
    Main parsing pipeline:
    1. Regex extraction for dates, totals, tax, currency, merchant
    2. Line-item pattern matching
    3. LLM fallback for low-confidence fields (called from async context separately)
    """
    result = ParsedReceipt()

    result.merchant, result.field_confidence["merchant"] = _extract_merchant(lines)
    result.date, result.field_confidence["date"] = _extract_date(lines)
    result.due_date, result.field_confidence["due_date"] = _extract_date(
        lines, _DUE_DATE_PATTERNS
    )
    result.total, result.field_confidence["total"] = _extract_amount(
        lines, _TOTAL_PATTERNS
    )
    result.tax, result.field_confidence["tax"] = _extract_amount(lines, _TAX_PATTERNS)
    result.currency = _extract_currency(lines)
    result.items = _extract_items(lines)
    result.account_suffix, result.field_confidence["account_suffix"] = (
        _extract_account_suffix(lines)
    )
    result.recurring_indicator = _is_recurring(lines)
    result.category_suggestion = _suggest_category(result.merchant, result.items)

    logger.info(
        f"Parser: merchant={result.merchant}, date={result.date}, "
        f"total={result.total}, items={len(result.items)}"
    )
    return result


async def parse_receipt_with_llm_fallback(
    lines: list[str], ocr_confidence: float = 0.8
) -> "ParsedReceipt":
    """Full pipeline including async LLM fallback for low-confidence fields."""
    result = parse_receipt(lines, ocr_confidence)

    # Trigger LLM fallback if key fields are missing or low-confidence
    low_confidence_fields = [k for k, v in result.field_confidence.items() if v < 0.6]
    if not result.merchant or not result.total or len(low_confidence_fields) >= 2:
        logger.info(f"Triggering LLM fallback for fields: {low_confidence_fields}")
        llm_data = await _llm_fallback("\n".join(lines))
        if llm_data:
            result.parser_provider = "regex+llm"
            if not result.merchant and llm_data.get("merchant"):
                result.merchant = llm_data["merchant"]
                result.field_confidence["merchant"] = max(
                    result.field_confidence.get("merchant", 0), 0.7
                )
            if not result.date and llm_data.get("date"):
                result.date = llm_data["date"]
                result.field_confidence["date"] = max(
                    result.field_confidence.get("date", 0), 0.7
                )
            if not result.due_date and llm_data.get("due_date"):
                result.due_date = llm_data["due_date"]
                result.field_confidence["due_date"] = max(
                    result.field_confidence.get("due_date", 0), 0.7
                )
            if not result.total and llm_data.get("total"):
                result.total = llm_data["total"]
                result.field_confidence["total"] = max(
                    result.field_confidence.get("total", 0), 0.7
                )
            if not result.tax and llm_data.get("tax"):
                result.tax = llm_data["tax"]
            if llm_data.get("currency"):
                result.currency = llm_data["currency"]
            if not result.items and llm_data.get("items"):
                result.items = [
                    ParsedItem(
                        name=i.get("name", ""),
                        price=i.get("price"),
                        quantity=i.get("quantity", 1.0),
                        confidence=i.get("confidence", 0.7),
                    )
                    for i in llm_data["items"]
                ]
            if not result.category_suggestion and llm_data.get("category_suggestion"):
                result.category_suggestion = llm_data["category_suggestion"]
            if llm_data.get("recurring_indicator") is True:
                result.recurring_indicator = True
            if not result.account_suffix and llm_data.get("account_suffix"):
                result.account_suffix = str(llm_data["account_suffix"])[-4:]

    if not result.category_suggestion:
        result.category_suggestion = _suggest_category(result.merchant, result.items)

    return result
