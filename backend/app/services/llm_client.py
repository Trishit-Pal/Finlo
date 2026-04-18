"""Shared OpenAI-compatible client helpers with retry + key rotation.

Instantiates one global :class:`KeyPool` per credential set (LLM + embeddings)
from app settings. Every call is wrapped in ``retry_call`` and rotates through
the pool on auth/rate-limit failures.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from app.config import get_settings
from app.services.http_retry import retry_call
from app.services.provider_pool import KeyPool, NoHealthyKeyAvailable

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def llm_pool() -> KeyPool:
    s = get_settings()
    return KeyPool.from_values(s.llm_provider_keys, label="llm")


@lru_cache(maxsize=1)
def embedding_pool() -> KeyPool:
    s = get_settings()
    return KeyPool.from_values(s.embedding_provider_keys, label="embedding")


def reset_pools_for_tests() -> None:
    """Invalidate memoized pools — tests that mutate settings call this."""
    llm_pool.cache_clear()
    embedding_pool.cache_clear()


async def llm_chat_completion(
    *,
    messages: list[dict[str, Any]],
    model: str | None = None,
    op_name: str = "llm.chat",
    max_attempts: int = 3,
    **kwargs,
) -> Any:
    """Call chat.completions.create with retry + key rotation.

    Returns the raw OpenAI response object or raises if all keys/attempts
    are exhausted. Callers decide whether to fall back to a mock.
    """
    pool = llm_pool()
    if not pool:
        raise NoHealthyKeyAvailable("llm: no keys configured")

    settings = get_settings()
    chosen_model = model or settings.LLM_PROVIDER_MODEL

    from openai import AsyncOpenAI  # local import keeps openai optional at import time

    async def _once() -> Any:
        async with pool.borrow(op_name) as key:
            client = AsyncOpenAI(
                api_key=key, base_url=settings.LLM_PROVIDER_BASE_URL, timeout=30.0
            )
            return await client.chat.completions.create(
                model=chosen_model, messages=messages, **kwargs
            )

    return await retry_call(_once, max_attempts=max_attempts, op_name=op_name)


async def llm_embedding(
    *,
    inputs: list[str],
    model: str | None = None,
    op_name: str = "llm.embed",
    max_attempts: int = 3,
) -> Any:
    """Call embeddings.create with retry + key rotation."""
    pool = embedding_pool()
    if not pool:
        raise NoHealthyKeyAvailable("embedding: no keys configured")

    settings = get_settings()
    chosen_model = model or settings.EMBEDDING_PROVIDER_MODEL

    from openai import AsyncOpenAI

    async def _once() -> Any:
        async with pool.borrow(op_name) as key:
            client = AsyncOpenAI(
                api_key=key,
                base_url=settings.EMBEDDING_PROVIDER_BASE_URL,
                timeout=30.0,
            )
            return await client.embeddings.create(model=chosen_model, input=inputs)

    return await retry_call(_once, max_attempts=max_attempts, op_name=op_name)
