"""Smoke tests: every module imports cleanly + key exports exist.

Lucida's first test. Catches the most common breakage path: a refactor
that silently moves a function or breaks a circular-import chain.
Doesn't exercise the LLM-call paths (those need ANTHROPIC_API_KEY +
network) — those belong in integration tests when we add them.
"""

from __future__ import annotations


def test_orchestrator_imports():
    from orchestrator import (
        CellProposal,
        SuppressedMintError,
        append_proposal,
        next_id,
        reflect_and_persist,
    )

    assert SuppressedMintError.__bases__[0] is Exception
    assert CellProposal.__dataclass_fields__  # is a dataclass
    assert callable(append_proposal)
    assert callable(reflect_and_persist)
    assert callable(next_id)


def test_classifier_imports():
    from classifier import ClassifierResult, classify

    assert callable(classify)
    fields = ClassifierResult.__dataclass_fields__
    # Keep an explicit guard so the schema doesn't drift silently.
    # mermaid_subtype + html_layout added in task #43 (shape hints).
    expected = {
        "discourse_move",
        "cell_type",
        "confidence",
        "reasoning",
        "title",
        "mermaid_subtype",
        "html_layout",
        "model",
        "cache_read_tokens",
        "cache_creation_tokens",
        "input_tokens",
        "output_tokens",
    }
    assert expected <= set(fields), f"ClassifierResult missing fields: {expected - set(fields)}"


def test_specialists_imports():
    import specialists

    # Active substrates — all must be present and callable.
    for name in (
        "generate_mermaid_spec",
        "generate_vega_spec",
        "generate_html_spec",
        "generate_animated_svg_spec",
        "generate_scene3d_spec",
        "generate_treemap_spec",
        "generate_sparkline_spec",
    ):
        assert hasattr(specialists, name), f"specialists.{name} missing"
        assert callable(getattr(specialists, name)), f"specialists.{name} not callable"


def test_watcher_imports():
    from watcher import WatcherStep, process_once

    assert callable(process_once)
    fields = WatcherStep.__dataclass_fields__
    assert "cells_suppressed" in fields  # added in the v2 text-gate work


def test_jsonl_to_transcript_imports():
    from jsonl_to_transcript import clean_message, extract, is_skipped_message

    assert callable(extract)
    assert is_skipped_message("<command-name>foo")
    assert (
        clean_message("hello <system-reminder>noise</system-reminder> world").strip()
        == "hello  world".strip()
    )


def test_text_evaluator_imports():
    from text_evaluator import TextEvalResult, evaluate_substrate_cell

    assert callable(evaluate_substrate_cell)
    assert TextEvalResult.__dataclass_fields__


def test_segmenter_imports():
    from segmenter import SegmentationResult, SegmenterError, segment_document

    assert callable(segment_document)
    fields = SegmentationResult.__dataclass_fields__
    assert {"segments", "summary", "model"} <= set(fields)
    assert SegmenterError.__bases__[0] is RuntimeError


def test_reflect_imports():
    from reflect import ReflectError, ReflectionResult, reflect_on_recent_cells

    assert callable(reflect_on_recent_cells)
    fields = ReflectionResult.__dataclass_fields__
    assert {"reflection", "synthesis_substrate", "synthesis_spec", "source_ids", "model"} <= set(
        fields
    )
    assert ReflectError.__bases__[0] is RuntimeError


def test_nano_banana_imports():
    from nano_banana import GenResult, NanoBananaError, generate, transform_image

    assert callable(generate)
    assert callable(transform_image)
    assert NanoBananaError.__bases__[0] is RuntimeError
    assert GenResult.__dataclass_fields__


def test_next_id_collision_safety():
    """Regression test for the next_id race: max(numeric_id) + 1, not
    len(cells) + 1. See orchestrator.next_id docstring (cell-0060..0063
    collision incident 2026-04-27)."""
    from orchestrator import next_id

    cells = [{"id": "cell-0001"}, {"id": "cell-0003"}, {"id": "cell-0007"}]
    assert next_id(cells) == "cell-0008"
    # Sparse list with gaps — must skip to max+1
    assert next_id([{"id": "cell-0099"}, {"id": "cell-0001"}]) == "cell-0100"
    # Empty list
    assert next_id([]) == "cell-0001"
    # Cells without numeric id are ignored
    assert next_id([{"id": "weird"}, {"id": "cell-0042"}]) == "cell-0043"
