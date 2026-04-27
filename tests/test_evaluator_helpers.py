"""Unit tests for pure helper functions in reflect.py and text_evaluator.py.

No API calls. Tests the deterministic extraction/serialization helpers.
"""

from __future__ import annotations

import json

import pytest

# ---------------------------------------------------------------------------
# text_evaluator._substrate_text
# ---------------------------------------------------------------------------


def test_substrate_text_vega_with_spec():
    from text_evaluator import _substrate_text

    cell = {"cell_type": "vega", "spec": {"mark": "bar", "data": {"values": [{"x": 1}]}}}
    label, text = _substrate_text(cell)
    assert label == "vega-lite spec"
    parsed = json.loads(text)
    assert parsed["mark"] == "bar"


def test_substrate_text_vega_no_spec():
    from text_evaluator import _substrate_text

    cell = {"cell_type": "vega"}
    label, text = _substrate_text(cell)
    assert label == "vega-lite spec"
    assert text == "(no spec)"


def test_substrate_text_mermaid_with_spec():
    from text_evaluator import _substrate_text

    cell = {"cell_type": "mermaid", "spec": "graph TD\n  A --> B"}
    label, text = _substrate_text(cell)
    assert label == "mermaid graph"
    assert "A --> B" in text


def test_substrate_text_mermaid_no_spec():
    from text_evaluator import _substrate_text

    cell = {"cell_type": "mermaid"}
    _label, text = _substrate_text(cell)
    assert text == "(no spec)"


def test_substrate_text_html_with_content():
    from text_evaluator import _substrate_text

    cell = {"cell_type": "html", "html": "<table><tr><td>42</td></tr></table>"}
    label, text = _substrate_text(cell)
    assert label == "html table"
    assert "42" in text


def test_substrate_text_html_empty():
    from text_evaluator import _substrate_text

    cell = {"cell_type": "html"}
    label, text = _substrate_text(cell)
    assert label == "html table"
    assert text == ""


def test_substrate_text_unsupported_raises():
    from text_evaluator import TextEvaluatorError, _substrate_text

    with pytest.raises(TextEvaluatorError, match="unsupported cell_type"):
        _substrate_text({"cell_type": "scene3d"})


def test_substrate_text_missing_cell_type_raises():
    from text_evaluator import TextEvaluatorError, _substrate_text

    with pytest.raises(TextEvaluatorError):
        _substrate_text({})


# ---------------------------------------------------------------------------
# reflect._is_visible
# ---------------------------------------------------------------------------


def test_is_visible_normal_cell():
    from reflect import _is_visible

    assert _is_visible({"cell_type": "vega", "spec": {}})
    assert _is_visible({"cell_type": "mermaid", "spec": "graph TD A"})
    assert _is_visible({"cell_type": "image", "image_path": "cells/cell-0001.png"})


def test_is_visible_text_without_attempted_is_visible():
    from reflect import _is_visible

    # A genuine text cell (e.g., a reflection caption) IS visible
    assert _is_visible({"cell_type": "text", "caption": "Some reflection"})


def test_is_visible_demoted_text_not_visible():
    from reflect import _is_visible

    # text cell with attempted_cell_type = was demoted by trivial filter
    assert not _is_visible(
        {
            "cell_type": "text",
            "attempted_cell_type": "vega",
            "caption": "Raw snippet text",
        }
    )


def test_is_visible_demoted_from_html():
    from reflect import _is_visible

    assert not _is_visible(
        {
            "cell_type": "text",
            "attempted_cell_type": "html",
        }
    )


# ---------------------------------------------------------------------------
# reflect._cell_summary_text
# ---------------------------------------------------------------------------


def _base_cell(**kwargs) -> dict:
    base = {"id": "cell-0001", "cell_type": "vega", "trigger_snippet": "prices rose 10%"}
    base.update(kwargs)
    return base


def test_cell_summary_text_contains_id_and_type():
    from reflect import _cell_summary_text

    out = _cell_summary_text(_base_cell())
    assert "cell-0001" in out
    assert "vega" in out


def test_cell_summary_text_contains_snippet():
    from reflect import _cell_summary_text

    out = _cell_summary_text(_base_cell(trigger_snippet="prices rose 10%"))
    assert "prices rose 10%" in out


def test_cell_summary_text_snippet_truncated_at_300():
    from reflect import _cell_summary_text

    long_snippet = "word " * 100  # 500 chars
    out = _cell_summary_text(_base_cell(trigger_snippet=long_snippet))
    # The trigger line should be at most 300 chars of content
    trigger_line = next(line for line in out.splitlines() if line.startswith("trigger:"))
    assert len(trigger_line) <= len("trigger: ") + 300


def test_cell_summary_text_includes_caption():
    from reflect import _cell_summary_text

    out = _cell_summary_text(_base_cell(caption="Prices increased by a tenth"))
    assert "Prices increased by a tenth" in out


def test_cell_summary_text_includes_notes():
    from reflect import _cell_summary_text

    out = _cell_summary_text(_base_cell(notes="forced→mermaid"))
    assert "forced→mermaid" in out


def test_cell_summary_text_mermaid_includes_spec():
    from reflect import _cell_summary_text

    cell = {
        "id": "cell-0002",
        "cell_type": "mermaid",
        "trigger_snippet": "A leads to B",
        "spec": "graph TD\n  A --> B",
    }
    out = _cell_summary_text(cell)
    assert "A --> B" in out


def test_cell_summary_text_vega_includes_partial_spec():
    from reflect import _cell_summary_text

    spec = {"mark": "bar", "data": {"values": [{"x": 1, "y": 2}]}}
    cell = {"id": "cell-0003", "cell_type": "vega", "trigger_snippet": "x=1,y=2", "spec": spec}
    out = _cell_summary_text(cell)
    assert "vega spec" in out


def test_cell_summary_text_html_includes_html():
    from reflect import _cell_summary_text

    cell = {
        "id": "cell-0004",
        "cell_type": "html",
        "trigger_snippet": "compare A vs B",
        "html": "<table><tr><td>A</td><td>B</td></tr></table>",
    }
    out = _cell_summary_text(cell)
    assert "<table>" in out


def test_cell_summary_text_demoted_notes_attempted():
    from reflect import _cell_summary_text

    cell = {
        "id": "cell-0005",
        "cell_type": "text",
        "trigger_snippet": "plain text",
        "attempted_cell_type": "vega",
    }
    out = _cell_summary_text(cell)
    assert "was demoted from vega" in out
