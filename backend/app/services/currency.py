"""Currency conversion service using free exchangerate.host API with Redis caching."""
from __future__ import annotations

import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Free API — no key required, 250 req/month on exchangerate.host
_RATE_API = "https://open.er-api.com/v6/latest/{base}"
_CACHE_TTL = 3600 * 6  # 6 hours


async def _get_redis():
    """Lazy import Redis to avoid circular deps."""
    try:
        import redis.asyncio as aioredis

        from app.config import get_settings
        return aioredis.from_url(get_settings().REDIS_URL, decode_responses=True)
    except Exception:
        return None


async def get_exchange_rates(base: str = "USD") -> Optional[dict[str, float]]:
    """Fetch exchange rates for a base currency, with Redis cache."""
    base = base.upper()
    cache_key = f"exchange_rates:{base}"

    # Try cache first
    rds = await _get_redis()
    if rds:
        try:
            cached = await rds.get(cache_key)
            if cached:
                await rds.aclose()
                return json.loads(cached)
        except Exception:
            pass

    # Fetch from API
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(_RATE_API.format(base=base))
            resp.raise_for_status()
            data = resp.json()

        if data.get("result") != "success":
            logger.warning(f"Exchange rate API returned non-success: {data}")
            return None

        rates: dict[str, float] = data.get("rates", {})

        # Cache the result
        if rds and rates:
            try:
                await rds.set(cache_key, json.dumps(rates), ex=_CACHE_TTL)
                await rds.aclose()
            except Exception:
                pass

        return rates

    except Exception as e:
        logger.error(f"Exchange rate fetch failed: {e}")
        return None


async def convert(amount: float, from_currency: str, to_currency: str) -> Optional[float]:
    """Convert an amount between two currencies."""
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()

    if from_currency == to_currency:
        return amount

    rates = await get_exchange_rates(from_currency)
    if not rates or to_currency not in rates:
        return None

    return round(amount * rates[to_currency], 2)
