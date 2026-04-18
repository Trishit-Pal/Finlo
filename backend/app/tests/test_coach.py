"""Unit tests for coach service prompt outputs."""

from __future__ import annotations

from app.services.coach import _mock_coach_output

# ── Mock output structure ─────────────────────────────────────────────────────


def test_mock_coach_output_keys():
    context = {
        "monthly_income": 5000,
        "goals": "save money",
        "recent_spend": {"Dining & Restaurants": 350.0, "Groceries": 200.0},
        "recent_receipts": [],
        "budget_status": [],
    }
    result = _mock_coach_output(context)
    assert "summary" in result
    assert "actions" in result
    assert "estimated_savings" in result
    assert "confidence" in result
    assert "sources" in result


def test_mock_coach_output_summary_length():
    context = {
        "monthly_income": 4000,
        "goals": "pay off debt",
        "recent_spend": {"Transportation": 450.0},
        "recent_receipts": [],
        "budget_status": [],
    }
    result = _mock_coach_output(context)
    assert isinstance(result["summary"], str)
    assert len(result["summary"]) > 20


def test_mock_coach_actions_count():
    context = {
        "monthly_income": 3000,
        "goals": "emergency fund",
        "recent_spend": {"Shopping": 600.0, "Dining & Restaurants": 400.0},
        "recent_receipts": [],
        "budget_status": [],
    }
    result = _mock_coach_output(context)
    assert 1 <= len(result["actions"]) <= 3


def test_mock_coach_action_structure():
    context = {
        "recent_spend": {"Groceries": 300.0},
        "monthly_income": 5000,
        "goals": "save",
        "recent_receipts": [],
        "budget_status": [],
    }
    result = _mock_coach_output(context)
    for action in result["actions"]:
        assert "text" in action
        assert "weekly_savings" in action
        assert "rationale" in action
        assert isinstance(action["weekly_savings"], float)


def test_mock_coach_confidence_range():
    context = {
        "recent_spend": {},
        "monthly_income": 0,
        "goals": "",
        "recent_receipts": [],
        "budget_status": [],
    }
    result = _mock_coach_output(context)
    assert 0.0 <= result["confidence"] <= 1.0


def test_mock_coach_estimated_savings_positive():
    context = {
        "recent_spend": {"Dining & Restaurants": 500.0},
        "monthly_income": 5000,
        "goals": "save",
        "recent_receipts": [],
        "budget_status": [],
    }
    result = _mock_coach_output(context)
    assert result["estimated_savings"] >= 0


# ── Feedback classifier ───────────────────────────────────────────────────────


def test_heuristic_classify_bug():
    from app.services.feedback_pipeline import _heuristic_classify

    result = _heuristic_classify("The app crashes when I upload a receipt", rating=1)
    assert result["classification"] == "Bug"
    assert result["priority"] == "high"


def test_heuristic_classify_feature():
    from app.services.feedback_pipeline import _heuristic_classify

    result = _heuristic_classify("I would like to add bank account sync", rating=4)
    assert result["classification"] == "FeatureRequest"


def test_heuristic_classify_praise():
    from app.services.feedback_pipeline import _heuristic_classify

    result = _heuristic_classify("Love the app, great job!", rating=5)
    assert result["classification"] == "Praise"
    assert result["priority"] == "low"


def test_heuristic_classify_ux():
    from app.services.feedback_pipeline import _heuristic_classify

    result = _heuristic_classify(
        "It is confusing to navigate the budget page", rating=3
    )
    assert result["classification"] == "UX"


def test_heuristic_classify_low_rating_escalates_priority():
    from app.services.feedback_pipeline import _heuristic_classify

    result = _heuristic_classify("Decent app", rating=1)
    assert result["priority"] == "high"
