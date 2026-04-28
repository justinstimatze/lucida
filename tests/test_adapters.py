"""Adapter-pattern smoke tests."""
from __future__ import annotations

import json
from pathlib import Path


def test_adapters_registry_complete():
    from adapters import ADAPTERS

    assert "claude-code" in ADAPTERS
    assert "aider" in ADAPTERS
    for name, fn in ADAPTERS.items():
        assert callable(fn), f"{name} adapter is not callable"


def test_claude_code_adapter_roundtrip(tmp_path: Path):
    """Build a tiny synthetic jsonl and verify the adapter extracts prose."""
    from adapters.claude_code import extract

    jsonl = tmp_path / "session.jsonl"
    lines = [
        json.dumps({
            "type": "user",
            "message": {"role": "user", "content": "fix the bug in foo.py"},
        }),
        json.dumps({
            "type": "assistant",
            "message": {
                "role": "assistant",
                "content": [
                    {"type": "thinking", "thinking": "noisy reasoning"},
                    {"type": "text", "text": "I'll look at foo.py"},
                    {"type": "tool_use", "name": "Read", "input": {"path": "foo.py"}},
                ],
            },
        }),
        # System-injected user message — should be dropped
        json.dumps({
            "type": "user",
            "message": {"role": "user", "content": "<command-name>/help</command-name>"},
        }),
    ]
    jsonl.write_text("\n".join(lines) + "\n")

    text, stats = extract(jsonl)
    assert "fix the bug in foo.py" in text
    assert "I'll look at foo.py" in text
    # Tool-use + thinking + skipped-prefix should not leak into prose
    assert "noisy reasoning" not in text
    assert "/help" not in text
    assert stats["kept"] == 2
    assert stats["skipped_prefix"] == 1


def test_claude_code_thinking_passthrough(tmp_path: Path):
    """include_thinking=True keeps the [thinking] blocks."""
    from adapters.claude_code import extract

    jsonl = tmp_path / "session.jsonl"
    jsonl.write_text(json.dumps({
        "type": "assistant",
        "message": {
            "role": "assistant",
            "content": [
                {"type": "thinking", "thinking": "load-bearing reasoning"},
                {"type": "text", "text": "answer"},
            ],
        },
    }) + "\n")
    text, _ = extract(jsonl, include_thinking=True)
    assert "load-bearing reasoning" in text
    assert "answer" in text


def test_aider_adapter_basic(tmp_path: Path):
    """Synthetic .aider.chat.history.md → prose with role tags."""
    from adapters.aider import extract

    history = tmp_path / "chat.md"
    history.write_text(
        "# aider chat started at 2026-04-28 10:00:00\n\n"
        "Files added: foo.py\n"
        "Tokens: 1234 sent, 567 received. Cost: $0.05\n\n"
        "#### Can you fix the bug in foo.py?\n\n"
        "I'll examine foo.py.\n"
        "The issue is on line 42.\n\n"
        "#### Looks good, ship it.\n\n"
        "Confirmed.\n"
    )
    text, stats = extract(history)
    assert "Can you fix the bug" in text
    assert "I'll examine foo.py" in text
    assert "Looks good, ship it" in text
    assert "Confirmed" in text
    # Aider internals filtered out
    assert "Tokens:" not in text
    assert "Files added:" not in text
    assert stats["user_blocks"] == 2
    assert stats["assistant_blocks"] == 2


def test_jsonl_to_transcript_backward_compat():
    """The legacy module still exposes its old API by re-exporting from adapters."""
    from jsonl_to_transcript import clean_message, extract, is_skipped_message

    assert callable(extract)
    assert callable(clean_message)
    assert is_skipped_message("<command-name>foo")
