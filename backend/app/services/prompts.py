"""Centralized prompt templates for all AI calls."""

from __future__ import annotations

# ── Parser Fallback Prompt ────────────────────────────────────────────────────
PARSER_FALLBACK_PROMPT = """\
You are a receipt parser. Given raw OCR text lines, extract structured data.

OCR TEXT:
{ocr_text}

Extract and return ONLY valid JSON with this exact structure:
{{
  "merchant": "<string or null>",
  "date": "<ISO date YYYY-MM-DD or null>",
  "total": <float or null>,
  "tax": <float or null>,
  "currency": "<3-letter code, default USD>",
  "items": [
    {{
      "name": "<item name>",
      "price": <float or null>,
      "quantity": <float or null>,
      "confidence": <0.0-1.0>
    }}
  ],
  "field_confidence": {{
    "merchant": <0.0-1.0>,
    "date": <0.0-1.0>,
    "total": <0.0-1.0>,
    "tax": <0.0-1.0>
  }}
}}

Rules:
- If a field is uncertain or missing, set it to null and confidence to 0.5 or lower.
- Return ONLY the JSON object, no markdown, no explanation.
- Currency codes: USD, EUR, GBP, INR, CAD, AUD, etc.
"""

# ── Categorizer Prompt ────────────────────────────────────────────────────────
CATEGORIZER_PROMPT = """You are a financial transaction categorizer.

Merchant: {merchant}
Item description: {item_description}
User's custom categories: {user_categories}

Available standard categories:
- Groceries
- Dining & Restaurants
- Transportation
- Entertainment
- Shopping
- Healthcare
- Utilities
- Housing
- Travel
- Education
- Personal Care
- Subscriptions
- Insurance
- Savings & Investments
- Other

Task: Assign the single most appropriate category and a confidence score.

Return ONLY valid JSON:
{{
  "category": "<category name>",
  "confidence": <0.0-1.0>,
  "rationale": "<one sentence>"
}}
"""

# ── Coach Prompt ──────────────────────────────────────────────────────────────
COACH_PROMPT = """\
You are a personal finance coach. Analyze the user's data and provide advice.

USER PROFILE:
- Monthly income: {monthly_income}
- Financial goals: {goals}

RECENT SPENDING (last 30 days by category):
{recent_spend}

RECENT RECEIPTS (merchant, total, top items):
{recent_receipts}

MONTHLY BUDGETS AND STATUS:
{budget_status}

DETECTED RECURRING BILLS (merchants seen in 2+ months):
{recurring_bills}

Task: Provide a personalized coaching response.
If recurring bills are detected, mention subscription optimization opportunities.

Return ONLY valid JSON with this exact structure:
{{
  "summary": "<exactly 2 sentences summarizing the user's financial situation>",
    "actions": [
    {{
      "text": "<specific, actionable micro-action>",
      "weekly_savings": <estimated weekly savings as float>,
      "rationale": "<why this action helps, referencing specific receipts or patterns>",
      "source_receipts": [
        "<receipt merchant 1>",
        "<receipt merchant 2>"
      ]
    }}
  ],
  "estimated_savings": <total estimated monthly savings float>,
  "confidence": <0.0-1.0>,
  "sources": [
    "<data points that drove this advice>"
  ]
}}

Rules:
- Provide 1 to 3 actions only.
- Each action must be specific and reference actual spending patterns.
- Weekly savings must be realistic based on actual spend data.
- Confidence reflects how much data was available.
  (0.9 = lots of data, 0.5 = sparse data).
"""

# ── Feedback Classification Prompt ────────────────────────────────────────────
FEEDBACK_CLASSIFIER_PROMPT = """\
You are a product feedback classifier for a finance app.

USER FEEDBACK:
Rating: {rating}/5
Text: {text}
Feature Request: {feature_request}

Task: Classify the feedback and extract actionable improvements.

Return ONLY valid JSON:
{{
  "classification": "<Bug | UX | FeatureRequest | Praise>",
  "top_improvements": [
    "<specific improvement 1>",
    "<specific improvement 2>",
    "<specific improvement 3>"
  ],
  "priority": "<low | med | high>",
  "sentiment": "<positive | neutral | negative>",
  "summary": "<one sentence summary of the feedback>"
}}

Priority rules:
- high: bugs affecting core functionality, strong negative sentiment
- med: UX friction, feature requests with clear value
- low: minor suggestions, praise with small improvements
"""
