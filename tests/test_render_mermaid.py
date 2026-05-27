"""Smoke + failure-path tests for tools/render_mermaid.mjs.

The script wraps a real headless Chromium so these tests are slower
than unit tests (~3-5s per case) and require Node + `npm install`
to have run. Marked with @pytest.mark.subprocess so contributors can
skip them on machines without the Node deps via -m "not subprocess".

Smoke covers: valid spec → SVG written with bytes > 5KB, the styled
state-diagram CSS block present (proves applyStyleToSvg ran).
Failure covers: invalid spec → ok=false in the per-cell JSON line,
exit code non-zero, no SVG written.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "tools" / "render_mermaid.mjs"
NODE_MODULES = REPO_ROOT / "node_modules" / "mermaid"
PUPPETEER_DIR = REPO_ROOT / "node_modules" / "puppeteer"


pytestmark = [pytest.mark.subprocess]


def _have_node() -> bool:
    return shutil.which("node") is not None and NODE_MODULES.exists()


def _have_puppeteer() -> bool:
    """render_mermaid.mjs imports puppeteer at module-load time, so even
    the empty-array validation test needs puppeteer installed or node
    exits 1 (module-not-found) before the script's validation runs."""
    return PUPPETEER_DIR.exists()


@pytest.fixture
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Run the renderer from a temp cwd so it doesn't pollute cells/.
    Bootstrap HTML is written to PROJECT_ROOT by the script, so we keep
    that root but use a cells/ inside tmp_path."""
    cells = tmp_path / "cells"
    cells.mkdir()
    monkeypatch.chdir(tmp_path)
    return tmp_path


def _run(jobs: list[dict], timeout: float = 90.0) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(SCRIPT)],
        input=json.dumps(jobs).encode(),
        capture_output=True,
        timeout=timeout,
        cwd=str(REPO_ROOT),
    )


@pytest.mark.skipif(not _have_node(), reason="node + node_modules/mermaid required")
def test_render_valid_flowchart_writes_styled_svg() -> None:
    """Spec parses → SVG written → contains state-diagram CSS rule
    (proves applyStyleToSvg ran post-render)."""
    jobs = [
        {
            "cellId": "test-smoke-valid",
            "spec": "flowchart LR\nA[start] --> B{decide}\nB -->|yes| C[ship]\nB -->|no| D[wait]",
            "colspan": 2,
        }
    ]
    try:
        result = _run(jobs)
        assert result.returncode == 0, f"non-zero exit; stderr={result.stderr.decode()[:300]}"
        line = result.stdout.decode().strip().splitlines()[0]
        msg = json.loads(line)
        assert msg["ok"] is True
        assert msg["cellId"] == "test-smoke-valid"
        assert msg["bytes"] > 5000, f"SVG suspiciously small: {msg['bytes']} bytes"
        out_path = REPO_ROOT / "cells" / msg["out"]
        assert out_path.exists()
        content = out_path.read_text()
        assert ".statediagram" in content, "shared style block missing"
        assert "#00ddff" in content, "cyan stroke color missing"
    finally:
        for f in (REPO_ROOT / "cells").glob("test-smoke-valid.*"):
            f.unlink()


@pytest.mark.skipif(not _have_node(), reason="node + node_modules/mermaid required")
def test_render_invalid_spec_reports_failure() -> None:
    """Garbage spec → mermaid.parse rejects → per-cell ok=false,
    no SVG file written, non-zero exit."""
    jobs = [
        {
            "cellId": "test-smoke-invalid",
            "spec": "not-a-valid-mermaid-spec ::: }}}\nA-->",
            "colspan": 1,
        }
    ]
    try:
        result = _run(jobs)
        assert result.returncode != 0, "expected non-zero exit on invalid spec"
        line = result.stdout.decode().strip().splitlines()[0]
        msg = json.loads(line)
        assert msg["ok"] is False
        assert msg["cellId"] == "test-smoke-invalid"
        assert msg.get("error")
        out_path = REPO_ROOT / "cells" / "test-smoke-invalid.mermaid.v10.svg"
        assert not out_path.exists(), "SVG written for invalid spec"
    finally:
        for f in (REPO_ROOT / "cells").glob("test-smoke-invalid.*"):
            f.unlink()


def test_script_rejects_invalid_stdin() -> None:
    """Empty or non-JSON stdin should exit non-zero quickly; this case
    doesn't require Chrome so it always runs."""
    proc = subprocess.run(
        ["node", str(SCRIPT)],
        input=b"not json at all",
        capture_output=True,
        timeout=10,
        cwd=str(REPO_ROOT),
    )
    assert proc.returncode != 0
    assert b"invalid json" in proc.stderr or b"json" in proc.stderr.lower()


@pytest.mark.skipif(not _have_puppeteer(), reason="puppeteer not installed")
def test_script_rejects_empty_job_array() -> None:
    """Empty array → exit 2 with a clear message; no Chrome launch."""
    proc = subprocess.run(
        ["node", str(SCRIPT)],
        input=b"[]",
        capture_output=True,
        timeout=10,
        cwd=str(REPO_ROOT),
    )
    assert proc.returncode == 2
    assert b"non-empty" in proc.stderr
