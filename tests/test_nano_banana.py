"""Unit tests for nano_banana.py pure helpers.

Tests the deterministic, no-API helpers:
- _is_recitation: RECITATION flag detection
- _mime_for: MIME-type guessing
- _check_and_bump_daily_cap: cap enforcement + usage tracking

The daily-cap tests patch nano_banana.USAGE_PATH to a tmp file so they
don't touch the real sidecar and don't need GOOGLE_API_KEY.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# _is_recitation
# ---------------------------------------------------------------------------


def test_is_recitation_true():
    from nano_banana import _is_recitation

    assert _is_recitation(["RECITATION"])
    assert _is_recitation(["STOP", "RECITATION"])
    assert _is_recitation(["FinishReason.RECITATION"])  # SDK enum str


def test_is_recitation_false():
    from nano_banana import _is_recitation

    assert not _is_recitation(["STOP"])
    assert not _is_recitation(["MAX_TOKENS", "STOP"])


def test_is_recitation_empty():
    from nano_banana import _is_recitation

    assert not _is_recitation([])


def test_is_recitation_case_sensitive():
    from nano_banana import _is_recitation

    # "RECITATION" is uppercase in the regex — lower case should NOT match
    assert not _is_recitation(["recitation"])


# ---------------------------------------------------------------------------
# _mime_for
# ---------------------------------------------------------------------------


def test_mime_for_png():
    from nano_banana import _mime_for

    assert _mime_for(Path("image.png")) == "image/png"


def test_mime_for_jpg():
    from nano_banana import _mime_for

    result = _mime_for(Path("photo.jpg"))
    assert result in ("image/jpeg", "image/jpg")


def test_mime_for_webp():
    from nano_banana import _mime_for

    assert _mime_for(Path("image.webp")) == "image/webp"


def test_mime_for_unknown_falls_back_to_png():
    from nano_banana import _mime_for

    assert _mime_for(Path("file.unknownextension")) == "image/png"


def test_mime_for_no_extension():
    from nano_banana import _mime_for

    assert _mime_for(Path("noextension")) == "image/png"


# ---------------------------------------------------------------------------
# _check_and_bump_daily_cap
# ---------------------------------------------------------------------------


def _patch_usage_path(tmp_path: Path, initial: dict | None = None):
    """Context manager that patches USAGE_PATH to a tmp file."""
    usage_file = tmp_path / "usage.json"
    if initial is not None:
        usage_file.write_text(json.dumps(initial))
    return patch("nano_banana.USAGE_PATH", usage_file)


def test_check_daily_cap_allows_first_use(tmp_path: Path):
    from nano_banana import _check_and_bump_daily_cap

    with _patch_usage_path(tmp_path):
        _check_and_bump_daily_cap()  # should not raise


def test_check_daily_cap_bumps_count(tmp_path: Path):
    from nano_banana import _check_and_bump_daily_cap

    usage_file = tmp_path / "usage.json"
    with patch("nano_banana.USAGE_PATH", usage_file):
        _check_and_bump_daily_cap()
        usage = json.loads(usage_file.read_text())
        today = date.today().isoformat()
        assert usage[today] == 1


def test_check_daily_cap_increments_on_repeated_calls(tmp_path: Path):
    from nano_banana import _check_and_bump_daily_cap

    usage_file = tmp_path / "usage.json"
    with patch("nano_banana.USAGE_PATH", usage_file):
        _check_and_bump_daily_cap()
        _check_and_bump_daily_cap()
        _check_and_bump_daily_cap()
        usage = json.loads(usage_file.read_text())
        today = date.today().isoformat()
        assert usage[today] == 3


def test_check_daily_cap_raises_when_at_limit(tmp_path: Path):
    from nano_banana import NanoBananaError, _check_and_bump_daily_cap

    today = date.today().isoformat()
    with (
        _patch_usage_path(tmp_path, {today: 200}),
        patch("nano_banana.DAILY_CAP", 200),
        pytest.raises(NanoBananaError, match="daily cap reached"),
    ):
        _check_and_bump_daily_cap()


def test_check_daily_cap_does_not_raise_just_below_limit(tmp_path: Path):
    from nano_banana import _check_and_bump_daily_cap

    today = date.today().isoformat()
    with _patch_usage_path(tmp_path, {today: 199}), patch("nano_banana.DAILY_CAP", 200):
        _check_and_bump_daily_cap()  # count was 199, now 200 — OK


def test_check_daily_cap_prunes_old_entries(tmp_path: Path):
    from nano_banana import _check_and_bump_daily_cap

    old_key = "2020-01-01"
    usage_file = tmp_path / "usage.json"
    with patch("nano_banana.USAGE_PATH", usage_file):
        usage_file.write_text(json.dumps({old_key: 5}))
        _check_and_bump_daily_cap()
        usage = json.loads(usage_file.read_text())
        # 2020-01-01 is >30 days ago; should have been pruned
        assert old_key not in usage


def test_check_daily_cap_missing_usage_file(tmp_path: Path):
    from nano_banana import _check_and_bump_daily_cap

    # No pre-existing file — should create one
    usage_file = tmp_path / "usage.json"
    with patch("nano_banana.USAGE_PATH", usage_file):
        assert not usage_file.exists()
        _check_and_bump_daily_cap()
        assert usage_file.exists()
