"""Hybrid categorizer: merchant lookup → embedding similarity → LLM fallback."""

from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Static merchant lookup table ──────────────────────────────────────────────
MERCHANT_CATEGORY_MAP: dict[str, str] = {
    # Groceries
    "walmart": "Groceries",
    "whole foods": "Groceries",
    "kroger": "Groceries",
    "trader joe": "Groceries",
    "aldi": "Groceries",
    "costco": "Groceries",
    "safeway": "Groceries",
    "publix": "Groceries",
    "stop & shop": "Groceries",
    "target": "Shopping",
    "big bazaar": "Groceries",
    "reliance fresh": "Groceries",
    # Dining
    "mcdonald": "Dining & Restaurants",
    "starbucks": "Dining & Restaurants",
    "subway": "Dining & Restaurants",
    "chipotle": "Dining & Restaurants",
    "domino": "Dining & Restaurants",
    "pizza hut": "Dining & Restaurants",
    "kfc": "Dining & Restaurants",
    "burger king": "Dining & Restaurants",
    "dunkin": "Dining & Restaurants",
    "panera": "Dining & Restaurants",
    "zomato": "Dining & Restaurants",
    "swiggy": "Dining & Restaurants",
    # Transportation
    "uber": "Transportation",
    "lyft": "Transportation",
    "ola": "Transportation",
    "shell": "Transportation",
    "bp": "Transportation",
    "chevron": "Transportation",
    "exxon": "Transportation",
    "metro": "Transportation",
    "mta": "Transportation",
    # Entertainment
    "netflix": "Subscriptions",
    "spotify": "Subscriptions",
    "amazon prime": "Subscriptions",
    "hulu": "Subscriptions",
    "disney": "Subscriptions",
    "apple": "Subscriptions",
    "cinema": "Entertainment",
    "amc": "Entertainment",
    "pvr": "Entertainment",
    # Healthcare
    "cvs": "Healthcare",
    "walgreens": "Healthcare",
    "rite aid": "Healthcare",
    "pharmacy": "Healthcare",
    "hospital": "Healthcare",
    "clinic": "Healthcare",
    # Utilities
    "electric": "Utilities",
    "gas bill": "Utilities",
    "water": "Utilities",
    "internet": "Utilities",
    "comcast": "Utilities",
    "at&t": "Utilities",
    "verizon": "Utilities",
    "t-mobile": "Utilities",
    # Shopping
    "amazon": "Shopping",
    "ebay": "Shopping",
    "flipkart": "Shopping",
    "zara": "Shopping",
    "h&m": "Shopping",
    "nike": "Shopping",
}

# ── Default category seeds for embedding similarity ───────────────────────────
CATEGORY_SEEDS: dict[str, list[str]] = {
    "Groceries": [
        "supermarket",
        "grocery store",
        "food market",
        "produce",
        "dairy",
        "bakery",
    ],
    "Dining & Restaurants": [
        "restaurant",
        "cafe",
        "coffee shop",
        "fast food",
        "takeout",
        "diner",
    ],
    "Transportation": [
        "gas station",
        "fuel",
        "taxi",
        "rideshare",
        "bus",
        "train",
        "parking",
    ],
    "Entertainment": [
        "movie theater",
        "concert",
        "amusement park",
        "gaming",
        "sports event",
    ],
    "Shopping": [
        "clothing store",
        "electronics",
        "online shopping",
        "department store",
        "mall",
    ],
    "Healthcare": [
        "pharmacy",
        "doctor",
        "hospital",
        "dental",
        "medical",
        "prescription",
    ],
    "Utilities": [
        "electricity",
        "water bill",
        "internet service",
        "phone bill",
        "cable TV",
    ],
    "Subscriptions": [
        "streaming service",
        "monthly subscription",
        "software license",
        "membership",
    ],
    "Travel": ["hotel", "airline", "flight", "airbnb", "vacation", "resort"],
    "Education": [
        "bookstore",
        "tuition",
        "online course",
        "school supplies",
        "university",
    ],
    "Personal Care": [
        "salon",
        "barbershop",
        "spa",
        "gym",
        "fitness",
        "beauty products",
    ],
}


def _lookup_merchant(merchant: str) -> Optional[str]:
    """Rule-based merchant lookup (case-insensitive substring match)."""
    lower = merchant.lower()
    for key, category in MERCHANT_CATEGORY_MAP.items():
        if key in lower:
            return category
    return None


async def _get_cached_seed_embeddings() -> Optional[dict[str, list[float]]]:
    """Load category seed embeddings from Redis cache, or compute and cache them."""
    import json as _json

    r = None
    try:
        from redis.exceptions import RedisError

        from app.services.redis_pool import get_redis

        r = get_redis()
        if r:
            cached = await r.get("categorizer:seed_embeddings")
            if cached:
                return _json.loads(cached)
    except (ImportError, RedisError, OSError, _json.JSONDecodeError):
        r = None

    try:
        from app.services.llm_client import embedding_pool, llm_embedding

        if not embedding_pool():
            return None

        categories = list(CATEGORY_SEEDS.keys())
        seed_phrases = [CATEGORY_SEEDS[c][0] for c in categories]
        seed_resp = await llm_embedding(
            inputs=seed_phrases,
            op_name="categorizer.seed_embed",
        )
        result = {categories[i]: emb.embedding for i, emb in enumerate(seed_resp.data)}

        if r:
            try:
                from redis.exceptions import RedisError as _RedisError

                await r.set(
                    "categorizer:seed_embeddings", _json.dumps(result), ex=86400
                )
            except (_RedisError, OSError):
                pass

        return result
    except Exception as e:
        logger.warning("categorizer.seed_embed_failed", extra={"err": repr(e)[:200]})
        return None


async def _embedding_similarity(text: str) -> Optional[tuple[str, float]]:
    """Find best category by embedding cosine similarity against seed phrases."""
    try:
        import numpy as np

        from app.services.llm_client import embedding_pool, llm_embedding

        if not embedding_pool():
            return None

        text_resp = await llm_embedding(
            inputs=[text[:512]], op_name="categorizer.similarity"
        )
        text_vec = np.array(text_resp.data[0].embedding)

        seed_cache = await _get_cached_seed_embeddings()
        if not seed_cache:
            return None

        best_category = None
        best_score = -1.0

        for category, seed_vec_list in seed_cache.items():
            seed_vec = np.array(seed_vec_list)
            score = float(
                np.dot(text_vec, seed_vec)
                / (np.linalg.norm(text_vec) * np.linalg.norm(seed_vec) + 1e-8)
            )
            if score > best_score:
                best_score = score
                best_category = category

        if best_category and best_score > 0.5:
            return best_category, round(best_score, 3)
        return None

    except Exception as e:
        logger.warning("categorizer.similarity_failed", extra={"err": repr(e)[:200]})
        return None


async def _llm_categorize(
    merchant: str, item_description: str
) -> Optional[tuple[str, float]]:
    """LLM fallback categorizer."""
    try:
        from app.services.llm_client import llm_chat_completion, llm_pool
        from app.services.prompts import CATEGORIZER_PROMPT

        if not llm_pool():
            return None

        prompt = CATEGORIZER_PROMPT.format(
            merchant=merchant,
            item_description=item_description,
            user_categories=", ".join(CATEGORY_SEEDS.keys()),
        )
        response = await llm_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=150,
            temperature=0.0,
            op_name="categorizer.llm",
        )
        data = json.loads(response.choices[0].message.content or "{}")
        cat = data.get("category")
        conf = float(data.get("confidence", 0.7))
        if cat:
            return cat, conf
    except Exception as e:
        logger.warning("categorizer.llm_failed", extra={"err": repr(e)[:200]})
    return None


async def categorize_single(merchant: str, description: str = "") -> dict:
    """Categorize a single transaction. Returns {category, confidence}."""
    # 1. Merchant lookup (fastest)
    cat = _lookup_merchant(merchant)
    if cat:
        return {"category": cat, "confidence": 0.95}

    # 2. Embedding similarity
    text = f"{merchant} {description}".strip()
    emb_result = await _embedding_similarity(text)
    if emb_result:
        return {"category": emb_result[0], "confidence": emb_result[1]}

    # 3. LLM fallback
    llm_result = await _llm_categorize(merchant, description)
    if llm_result:
        return {"category": llm_result[0], "confidence": llm_result[1]}

    return {"category": "Other", "confidence": 0.3}


async def categorize_items(items: list, user_id: str) -> list:
    """Categorize a list of receipt items in parallel."""
    import asyncio

    async def _categorize_one(idx: int, item):
        if isinstance(item, dict):
            if not item.get("category"):
                result = await categorize_single(item.get("name", ""))
                item["category"] = result["category"]
                item["confidence"] = result["confidence"]
        else:
            if not item.category:
                result = await categorize_single(item.name)
                item.category = result["category"]
                item.confidence = result["confidence"]

    tasks = [_categorize_one(i, item) for i, item in enumerate(items)]
    await asyncio.gather(*tasks)
    return items
