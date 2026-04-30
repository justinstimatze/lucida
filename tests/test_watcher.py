"""Unit tests for watcher.py pure helpers.

Tests only the deterministic, no-I/O helpers:
- _is_dup: dedup logic
- _project_name_from_transcript: session_id derivation
- discover_active_transcripts: filesystem walk with mtime filter
- WatcherStep: dataclass defaults
"""
from __future__ import annotations

import time
from pathlib import Path

# ---------------------------------------------------------------------------
# _is_dup
# ---------------------------------------------------------------------------

def test_is_dup_empty_snippet_always_dup():
    from watcher import _is_dup

    assert _is_dup("", {"foo bar baz"})
    assert _is_dup("   ", {"foo bar baz"})


def test_is_dup_exact_match():
    from watcher import _is_dup

    assert _is_dup("hello world", {"hello world"})


def test_is_dup_case_insensitive_exact():
    from watcher import _is_dup

    assert _is_dup("Hello World", {"hello world"})


def test_is_dup_substring_contained():
    from watcher import _is_dup

    assert _is_dup("short", {"this is a short snippet"})
    assert _is_dup("this is a short snippet", {"short"})


def test_is_dup_high_jaccard():
    from watcher import _is_dup

    # 8 of 9 unique words overlap — jaccard > 0.7
    base = "the quick brown fox jumps over the lazy dog"
    almost = "the quick brown fox jumps over the lazy cat"
    assert _is_dup(base, {almost})


def test_is_dup_low_jaccard_not_dup():
    from watcher import _is_dup

    assert not _is_dup("apple orange grape", {"car truck bus plane train"})


def test_is_dup_no_existing_snippets():
    from watcher import _is_dup

    assert not _is_dup("some brand new snippet", set())


def test_is_dup_empty_existing_set():
    from watcher import _is_dup

    assert not _is_dup("hello world", {""})  # only empty string in set → not a dup


# ---------------------------------------------------------------------------
# _project_name_from_transcript
# ---------------------------------------------------------------------------

def test_project_name_strips_home_documents_prefix():
    from watcher import _project_name_from_transcript

    home = str(Path.home())
    encoded = "-" + home.replace("/", "-").lstrip("-") + "-Documents-lucida"
    fake_dir = Path(f"/tmp/fake/.claude/projects/{encoded}")  # noqa: S108
    transcript = fake_dir / "abc123.jsonl"
    result = _project_name_from_transcript(transcript)
    assert result == "lucida"


def test_project_name_strips_code_anchor():
    from watcher import _project_name_from_transcript

    home = str(Path.home())
    encoded = "-" + home.replace("/", "-").lstrip("-") + "-code-myproject"
    fake_dir = Path(f"/tmp/fake/.claude/projects/{encoded}")  # noqa: S108
    result = _project_name_from_transcript(fake_dir / "abc.jsonl")
    assert result == "myproject"


def test_project_name_fallback_to_stem():
    from watcher import _project_name_from_transcript

    result = _project_name_from_transcript(Path("/some/random/path/abc123def456.jsonl"))
    assert result == "abc123def456"


def test_project_name_non_standard_parent():
    from watcher import _project_name_from_transcript

    # Parent name doesn't start with the home prefix
    result = _project_name_from_transcript(Path("/tmp/session-xyz.jsonl"))  # noqa: S108
    assert result == "session-xyz"


# ---------------------------------------------------------------------------
# discover_active_transcripts
# ---------------------------------------------------------------------------

def test_discover_active_transcripts_empty_root(tmp_path: Path):
    from watcher import discover_active_transcripts

    assert discover_active_transcripts(tmp_path) == []


def test_discover_active_transcripts_missing_root(tmp_path: Path):
    from watcher import discover_active_transcripts

    assert discover_active_transcripts(tmp_path / "nonexistent") == []


def test_discover_active_transcripts_finds_recent(tmp_path: Path):
    from watcher import discover_active_transcripts

    proj = tmp_path / "proj1"
    proj.mkdir()
    recent = proj / "abc.jsonl"
    recent.write_text("content")
    # mtime is now by default — within any active window

    result = discover_active_transcripts(tmp_path, active_window_min=60.0)
    assert recent in result


def test_discover_active_transcripts_ignores_stale(tmp_path: Path):
    from watcher import discover_active_transcripts

    proj = tmp_path / "proj1"
    proj.mkdir()
    stale = proj / "old.jsonl"
    stale.write_text("old content")
    # backdate to 2 hours ago
    old_time = time.time() - 7200
    import os
    os.utime(stale, (old_time, old_time))

    result = discover_active_transcripts(tmp_path, active_window_min=30.0)
    assert stale not in result


def test_discover_active_transcripts_one_per_project(tmp_path: Path):
    """Only the most recently modified jsonl per project dir is returned."""
    from watcher import discover_active_transcripts

    proj = tmp_path / "proj1"
    proj.mkdir()
    older = proj / "old.jsonl"
    older.write_text("old")
    import time as _time
    _time.sleep(0.01)
    newer = proj / "new.jsonl"
    newer.write_text("new")

    result = discover_active_transcripts(tmp_path, active_window_min=60.0)
    assert len(result) == 1
    assert result[0] == newer


def test_discover_active_transcripts_multiple_projects(tmp_path: Path):
    from watcher import discover_active_transcripts

    for name in ("projA", "projB", "projC"):
        d = tmp_path / name
        d.mkdir()
        (d / "sess.jsonl").write_text("x")

    result = discover_active_transcripts(tmp_path, active_window_min=60.0)
    assert len(result) == 3


# ---------------------------------------------------------------------------
# WatcherStep defaults
# ---------------------------------------------------------------------------

def test_watcher_step_defaults():
    from watcher import WatcherStep

    step = WatcherStep(new_chars=0, segments_found=0, cells_minted=0, cells_skipped_dup=0)
    assert step.cells_suppressed == 0
    assert step.minted_ids == []
    assert step.reflection_id is None
    assert step.note == ""


def test_watcher_step_minted_ids_independent():
    """minted_ids default lists must not be shared across instances."""
    from watcher import WatcherStep

    a = WatcherStep(0, 0, 0, 0)
    b = WatcherStep(0, 0, 0, 0)
    a.minted_ids.append("cell-0001")
    assert b.minted_ids == []
