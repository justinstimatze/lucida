"""Integration tests for classifier.py — requires ANTHROPIC_API_KEY.

Tests that the classifier routes representative snippets to the expected
substrate types. One call per test; relies on prompt-caching for the
system prompt so repeated runs are cheap.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def test_classify_numeric_snippet_routes_to_vega():
    """A snippet with multiple numeric values + comparison axis → vega."""
    from classifier import classify

    snippet = (
        "In 2023 the top 10% of earners captured 47% of total income, "
        "up from 43% in 2019. The bottom 50% captured 9%, unchanged."
    )
    result = classify(snippet)
    assert result.cell_type == "vega", (
        f"expected vega, got {result.cell_type!r} "
        f"(confidence={result.confidence:.2f}, reasoning={result.reasoning!r})"
    )
    assert result.confidence >= 0.6


def test_classify_relational_snippet_routes_to_mermaid():
    """A snippet describing a causal chain between entities → mermaid."""
    from classifier import classify

    snippet = (
        "The transcription factor TP53 activates p21, which inhibits CDK2. "
        "CDK2 inhibition prevents Rb phosphorylation, blocking cell cycle entry."
    )
    result = classify(snippet)
    assert result.cell_type == "mermaid", (
        f"expected mermaid, got {result.cell_type!r} (confidence={result.confidence:.2f})"
    )
    assert result.confidence >= 0.6


def test_classify_comparison_table_snippet_routes_to_html():
    """A >=3x2 comparison (multiple entities x multiple attributes) -> html."""
    from classifier import classify

    snippet = (
        "Comparing three databases: PostgreSQL supports ACID transactions, "
        "JSONB storage, and full-text search. MySQL supports ACID transactions, "
        "JSON storage, and basic full-text search. SQLite supports ACID "
        "transactions, limited JSON, and no full-text search."
    )
    result = classify(snippet)
    assert result.cell_type == "html", (
        f"expected html, got {result.cell_type!r} (confidence={result.confidence:.2f})"
    )


def test_classify_low_confidence_below_threshold():
    """A vague conversational snippet should fall below confidence threshold."""
    from classifier import classify

    snippet = "Sounds good, let me think about that."
    result = classify(snippet)
    # Either suppressed (confidence < 0.6) or assigned text
    assert result.confidence < 0.6 or result.cell_type == "text"


def test_classify_returns_all_required_fields():
    """Smoke: classify always returns a fully-populated ClassifierResult."""
    from classifier import ClassifierResult, classify

    snippet = "Revenue grew 15% year-over-year to $2.4B in Q3."
    result = classify(snippet)
    assert isinstance(result, ClassifierResult)
    assert result.cell_type
    assert result.reasoning
    assert 0.0 <= result.confidence <= 1.0
    assert result.model
