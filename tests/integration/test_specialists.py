"""Integration tests for specialists.py — requires ANTHROPIC_API_KEY.

Tests that each specialist produces a syntactically plausible output for
a well-targeted snippet. Not a quality audit — just confirms the pipeline
doesn't crash and returns the expected structure.
"""

from __future__ import annotations

import json

import pytest

pytestmark = pytest.mark.integration

NUMERIC_SNIPPET = (
    "US household debt reached $17.5T in Q4 2023. Mortgage debt accounted "
    "for $12.3T (70%), auto loans $1.6T, student loans $1.6T, credit cards $1.1T."
)

RELATIONAL_SNIPPET = (
    "Dopamine release in the VTA activates D1 receptors in the nucleus "
    "accumbens, reinforcing reward-seeking behavior. Repeated activation "
    "downregulates D2 receptors, reducing baseline motivation."
)

HTML_SNIPPET = (
    "Three JS frameworks compared: React uses a virtual DOM, has a large "
    "ecosystem, and requires JSX. Vue uses a virtual DOM, has a moderate "
    "ecosystem, and optional templates. Svelte compiles away the virtual DOM, "
    "has a small ecosystem, and uses template syntax."
)


def test_generate_vega_spec_returns_valid_json():
    from specialists import SpecialistResult, generate_vega_spec

    result = generate_vega_spec(NUMERIC_SNIPPET, context="")
    assert isinstance(result, SpecialistResult), (
        f"generate_vega_spec must return SpecialistResult, got {type(result).__name__}"
    )
    spec = result.spec
    parsed = json.loads(json.dumps(spec)) if isinstance(spec, dict) else json.loads(spec)
    assert isinstance(parsed, dict)
    assert "mark" in parsed or "$schema" in parsed or "layer" in parsed


def test_generate_mermaid_spec_returns_graph_syntax():
    from specialists import SpecialistResult, generate_mermaid_spec

    result = generate_mermaid_spec(RELATIONAL_SNIPPET, context="")
    assert isinstance(result, SpecialistResult), (
        f"generate_mermaid_spec must return SpecialistResult, got {type(result).__name__}"
    )
    spec = result.spec
    assert isinstance(spec, str)
    # Must contain at least one arrow (edge)
    assert "-->" in spec or "---" in spec or "-.->" in spec


def test_generate_html_spec_returns_table_markup():
    from specialists import SpecialistResult, generate_html_spec

    result = generate_html_spec(HTML_SNIPPET, context="", layout_hint="table")
    assert isinstance(result, SpecialistResult), (
        f"generate_html_spec must return SpecialistResult, got {type(result).__name__}"
    )
    html = result.spec if isinstance(result.spec, str) else ""
    assert "<table" in html.lower() or "<tr" in html.lower()


def test_generate_vega_spec_has_data_values():
    """Vega specialist must ground the spec in actual data.values rows."""
    from specialists import generate_vega_spec

    result = generate_vega_spec(NUMERIC_SNIPPET, context="")
    spec = result.spec
    raw = json.dumps(spec) if isinstance(spec, dict) else spec
    # data.values must appear somewhere in the serialized spec
    assert "values" in raw


def test_generate_mermaid_spec_names_entities_from_snippet():
    """Mermaid nodes should reference entities from the snippet."""
    from specialists import generate_mermaid_spec

    result = generate_mermaid_spec(RELATIONAL_SNIPPET, context="")
    spec = result.spec
    # At least one of the key entities should appear in the graph
    key_terms = ["dopamine", "VTA", "D1", "D2", "accumbens", "nucleus", "reward"]
    found = any(term.lower() in spec.lower() for term in key_terms)
    assert found, f"No snippet entity found in mermaid spec:\n{spec}"
