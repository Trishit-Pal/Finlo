"""Feedback classification pipeline."""
from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def classify_feedback(text: str, feature_request: str = "", rating: Optional[int] = None) -> dict:
    """Classify feedback text using LLM. Returns classification, improvements, priority."""
    try:
        from openai import AsyncOpenAI

        from app.config import get_settings
        from app.services.prompts import FEEDBACK_CLASSIFIER_PROMPT

        settings = get_settings()
        if not settings.LLM_PROVIDER_KEY:
            return _heuristic_classify(text, rating)

        client = AsyncOpenAI(api_key=settings.LLM_PROVIDER_KEY, base_url=settings.LLM_PROVIDER_BASE_URL)
        prompt = FEEDBACK_CLASSIFIER_PROMPT.format(
            rating=rating or "not provided",
            text=text or "no text",
            feature_request=feature_request or "none",
        )
        response = await client.chat.completions.create(
            model=settings.LLM_PROVIDER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=400,
            temperature=0.2,
        )
        result = json.loads(response.choices[0].message.content or "{}")
        logger.info(f"Feedback classified: {result.get('classification')} / {result.get('priority')}")
        return result

    except Exception as e:
        logger.warning(f"Feedback classification failed: {e}, using heuristic")
        return _heuristic_classify(text, rating)


def _heuristic_classify(text: str, rating: Optional[int]) -> dict:
    """Simple rule-based fallback classifier."""
    lower = (text or "").lower()
    classification = "Praise"
    priority = "low"

    bug_keywords = ["crash", "error", "bug", "broken", "doesn't work", "fails", "wrong"]
    ux_keywords = ["confusing", "hard to", "unclear", "difficult", "improve", "better"]
    feature_keywords = ["add", "want", "would like", "feature", "support", "wish", "please"]

    if any(k in lower for k in bug_keywords):
        classification = "Bug"
        priority = "high"
    elif any(k in lower for k in feature_keywords):
        classification = "FeatureRequest"
        priority = "med"
    elif any(k in lower for k in ux_keywords):
        classification = "UX"
        priority = "med"

    if rating and rating <= 2:
        priority = "high"
    elif rating and rating >= 4:
        priority = "low"

    return {
        "classification": classification,
        "top_improvements": [],
        "priority": priority,
        "sentiment": "positive" if (rating or 3) >= 4 else ("negative" if (rating or 3) <= 2 else "neutral"),
        "summary": text[:100] if text else "",
    }
