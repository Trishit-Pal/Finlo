"""Currency conversion service with multi-endpoint fallback and Redis caching."""

from __future__ import annotations

import json
import logging
from typing import Optional

import httpx

from app.config import get_settings
from app.services.http_retry import http_request_with_retry

logger = logging.getLogger(__name__)

_CACHE_TTL = 3600 * 6  # 6 hours
_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


def _get_redis():
    from app.services.redis_pool import get_redis

    return get_redis()


def _parse_rates(payload: dict) -> Optional[dict[str, float]]:
    """Normalize rate-API responses — supports open.er-api.com + exchangerate.host."""
    if payload.get("result") == "success" and isinstance(payload.get("rates"), dict):
        return payload["rates"]
    # exchangerate.host / frankfurter shape
    if payload.get("success") and isinstance(payload.get("rates"), dict):
        return payload["rates"]
    if isinstance(payload.get("rates"), dict):
        return payload["rates"]
    return None


async def _fetch_rates_from(
    client: httpx.AsyncClient, url: str, base: str
) -> Optional[dict[str, float]]:
    """Try one endpoint. Returns rates or None on failure."""
    try:
        resp = await http_request_with_retry(
            client, "GET", url.format(base=base), op_name=f"currency.fetch:{url}"
        )
        if resp.status_code >= 400:
            logger.warning(
                "currency.fetch_http_error",
                extra={"url": url, "status": resp.status_code},
            )
            return None
        return _parse_rates(resp.json())
    except Exception as e:
        logger.warning(
            "currency.fetch_exception",
            extra={"url": url, "err": repr(e)[:200]},
        )
        return None


async def get_exchange_rates(base: str = "USD") -> Optional[dict[str, float]]:
    """Fetch exchange rates, trying each configured endpoint until one succeeds."""
    base = base.upper()
    cache_key = f"exchange_rates:{base}"

    rds = _get_redis()
    if rds:
        try:
            cached = await rds.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    from app.services.http_client import get_http_client

    urls = get_settings().currency_api_urls
    rates: Optional[dict[str, float]] = None
    client = get_http_client()
    for url in urls:
        rates = await _fetch_rates_from(client, url, base)
        if rates:
            break

    if not rates:
        logger.error(
            "currency.all_endpoints_failed",
            extra={"base": base, "tried": len(urls)},
        )
        return None

    if rds and rates:
        try:
            await rds.set(cache_key, json.dumps(rates), ex=_CACHE_TTL)
        except Exception:
            pass

    return rates


async def convert(
    amount: float, from_currency: str, to_currency: str
) -> Optional[float]:
    """Convert an amount between two currencies."""
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()

    if from_currency == to_currency:
        return amount

    rates = await get_exchange_rates(from_currency)
    if not rates or to_currency not in rates:
        return None

    return round(amount * rates[to_currency], 2)
