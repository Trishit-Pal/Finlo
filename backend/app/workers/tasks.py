"""RQ background task definitions."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def run_ocr_and_parse(receipt_id: str, file_path: str, content_type: str) -> None:
    """Background task: run server-side OCR on a stored file, update receipt record."""
    import asyncio

    from sqlalchemy import select

    from app.db.models import Receipt
    from app.db.session import AsyncSessionLocal
    from app.services.ocr_adapter import ServerOCRAdapter
    from app.services.parser import parse_receipt_with_llm_fallback

    async def _run():
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
            receipt = result.scalar_one_or_none()
            if not receipt:
                logger.error(f"OCR task: receipt {receipt_id} not found")
                return

            with open(file_path, "rb") as f:
                raw = f.read()

            adapter = ServerOCRAdapter()
            ocr_result = adapter.parse_bytes(raw, content_type)
            parsed = await parse_receipt_with_llm_fallback(
                ocr_result.lines, ocr_result.confidence
            )

            receipt.merchant = parsed.merchant
            receipt.date = parsed.date
            receipt.total = parsed.total
            receipt.tax = parsed.tax
            receipt.currency = parsed.currency
            receipt.items = [i.model_dump() for i in parsed.items]
            receipt.ocr_confidence = ocr_result.confidence
            receipt.raw_ocr_text = ocr_result.raw_text
            receipt.field_confidence = parsed.field_confidence
            receipt.status = "pending"
            db.add(receipt)
            await db.commit()
            logger.info(f"OCR task complete for receipt {receipt_id}")

    asyncio.run(_run())


def run_coach_suggestions(user_id: str) -> None:
    """Background task: regenerate coach suggestions for a user."""
    import asyncio

    from app.db.session import AsyncSessionLocal
    from app.services.coach import generate_suggestions_background

    async def _run():
        async with AsyncSessionLocal() as db:
            await generate_suggestions_background(user_id, db)
            await db.commit()

    asyncio.run(_run())


def enqueue_coach_job(user_id: str) -> None:
    """Enqueue coach regeneration; falls back to sync if Redis unavailable."""
    try:
        from redis import Redis
        from rq import Queue

        from app.config import get_settings

        settings = get_settings()
        redis_conn = Redis.from_url(settings.REDIS_URL)
        q = Queue(connection=redis_conn)
        q.enqueue(run_coach_suggestions, user_id, job_timeout=120)
        logger.info(f"Coach job enqueued for user {user_id}")
    except Exception as e:
        logger.warning(f"Could not enqueue coach job (running sync): {e}")
        run_coach_suggestions(user_id)


def enqueue_ocr_job(receipt_id: str, file_path: str, content_type: str) -> None:
    """Enqueue OCR job; falls back to sync if Redis unavailable."""
    try:
        from redis import Redis
        from rq import Queue

        from app.config import get_settings

        settings = get_settings()
        redis_conn = Redis.from_url(settings.REDIS_URL)
        q = Queue(connection=redis_conn)
        q.enqueue(
            run_ocr_and_parse, receipt_id, file_path, content_type, job_timeout=120
        )
        logger.info(f"OCR job enqueued for receipt {receipt_id}")
    except Exception as e:
        logger.warning(f"Could not enqueue OCR job (running sync): {e}")
        run_ocr_and_parse(receipt_id, file_path, content_type)
