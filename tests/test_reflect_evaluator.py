"""Non-API smoke tests for reflect.py and evaluator.py.

Coverage focuses on data-class shape, helper functions, and error paths
that don't require an API key. API-driven paths live in
tests/integration/.
"""

from __future__ import annotations

import json

import pytest

import evaluator
import reflect

# --- ReflectionResult shape ---


def test_reflection_result_dataclass_shape():
    r = reflect.ReflectionResult(
        reflection="text",
        synthesis_substrate="html",
        synthesis_spec="<p>x</p>",
        what_worked="",
        what_didnt_work="",
        proposed_next_cell_type="",
        proposed_next_snippet="",
        reasoning="",
        source_ids=["cell-0001"],
        model="claude-sonnet-4-6",
        cache_read_tokens=0,
        cache_creation_tokens=0,
        input_tokens=10,
        output_tokens=20,
    )
    assert r.synthesis_substrate == "html"
    assert r.source_ids == ["cell-0001"]


def test_reflect_error_no_api_key(monkeypatch):
    """Without ANTHROPIC_API_KEY, reflect_on_recent_cells must raise
    ReflectError early (before any API attempt)."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(reflect.ReflectError, match="ANTHROPIC_API_KEY"):
        reflect.reflect_on_recent_cells(n=1)


def test_reflect_error_missing_cells_file(tmp_path, monkeypatch):
    """With API key but no cells.json, reflect raises ReflectError. (The
    SDK-missing branch is also acceptable in environments where the
    anthropic SDK isn't installed; the contract is just 'raises'.)"""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-for-shape-only")
    pytest.importorskip("anthropic")
    with pytest.raises(reflect.ReflectError, match=r"cells\.json not found"):
        reflect.reflect_on_recent_cells(n=1, cells_path=tmp_path / "missing.json")


def test_reflect_load_cells_helper(tmp_path):
    cells_file = tmp_path / "cells.json"
    cells_file.write_text(json.dumps({"cells": [{"id": "cell-0001", "cell_type": "vega"}]}))
    cells = reflect._load_cells(cells_file)
    assert len(cells) == 1
    assert cells[0]["id"] == "cell-0001"


def test_reflect_visibility_filter_demoted_cells():
    demoted = {"id": "cell-0001", "cell_type": "text", "attempted_cell_type": "vega"}
    visible = {"id": "cell-0002", "cell_type": "vega"}
    legit_text = {"id": "cell-0003", "cell_type": "text"}
    assert not reflect._is_visible(demoted)
    assert reflect._is_visible(visible)
    assert reflect._is_visible(legit_text)


def test_reflect_cell_summary_includes_id_and_type():
    cell = {"id": "cell-0042", "cell_type": "mermaid", "trigger_snippet": "x", "spec": "flowchart"}
    summary = reflect._cell_summary_text(cell)
    assert "cell-0042" in summary
    assert "mermaid" in summary


# --- EvaluationResult shape ---


def test_evaluation_result_dataclass_shape():
    r = evaluator.EvaluationResult(
        quality_score=0.85,
        what_worked="composition",
        what_didnt_work="contrast",
        should_retrigger=False,
        retrigger_guidance="",
        model="claude-sonnet-4-6",
        cache_read_tokens=0,
        cache_creation_tokens=0,
        input_tokens=15,
        output_tokens=25,
    )
    assert r.quality_score == 0.85
    assert r.should_retrigger is False
    assert r.failure_mode == "none"  # default


def test_evaluation_failure_mode_default():
    r = evaluator.EvaluationResult(
        quality_score=0.0,
        what_worked="",
        what_didnt_work="",
        should_retrigger=True,
        retrigger_guidance="try again",
        model="claude-sonnet-4-6",
        cache_read_tokens=0,
        cache_creation_tokens=0,
        input_tokens=0,
        output_tokens=0,
    )
    assert r.failure_mode == "none"


def test_evaluator_error_no_api_key(monkeypatch, tmp_path):
    """Without ANTHROPIC_API_KEY, evaluate_image_cell raises early."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    fake_img = tmp_path / "x.png"
    fake_img.write_bytes(b"\x89PNG\r\n\x1a\n")  # PNG magic, enough to exist
    with pytest.raises(evaluator.EvaluatorError, match="ANTHROPIC_API_KEY"):
        evaluator.evaluate_image_cell("snippet", fake_img)
