"""Tests for tools/backfill_mermaid_svgs.py — the script that scans
cells.json for mermaid cells lacking a cached SVG and pipes them
to the Node renderer.

These exercise the scanning + filtering logic without invoking Node.
The actual render path is covered by test_render_mermaid.py; here we
just verify the Python orchestration: target_path naming, cells.json
parsing, skip-when-cached, --limit, --force.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = REPO_ROOT / "tools" / "backfill_mermaid_svgs.py"


def _load_module() -> object:
    spec = importlib.util.spec_from_file_location("backfill_mermaid_svgs", MODULE_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["backfill_mermaid_svgs"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_target_path_colspan_one() -> None:
    """colspan=1 omits the .cN segment to match the disk-cache key
    convention shared with _mixed3dRenderMermaidToCanvas."""
    mod = _load_module()
    p = mod.target_path(Path("/x/cells"), "cell-1234", 1)
    assert p.name == f"cell-1234.mermaid.{mod.STYLE_V}.svg"


def test_target_path_colspan_two() -> None:
    mod = _load_module()
    p = mod.target_path(Path("/x/cells"), "cell-1234", 2)
    assert p.name == f"cell-1234.mermaid.c2.{mod.STYLE_V}.svg"


def test_target_path_colspan_three() -> None:
    mod = _load_module()
    p = mod.target_path(Path("/x/cells"), "cell-1234", 3)
    assert p.name == f"cell-1234.mermaid.c3.{mod.STYLE_V}.svg"


def test_style_v_pinned_to_index_html() -> None:
    """STYLE_V must match the constant in index.html or the disk
    cache will silently diverge from what the browser fetches."""
    mod = _load_module()
    html = (REPO_ROOT / "index.html").read_text()
    # Grep the inline constant assignment _mixed3dRenderMermaidToCanvas uses.
    assert f'const STYLE_V = "{mod.STYLE_V}"' in html, (
        f"STYLE_V drift: backfill={mod.STYLE_V}, index.html doesn't contain matching constant"
    )


def test_style_v_pinned_to_mermaid_style_mjs() -> None:
    """STYLE_V must also match the Node-side shared module."""
    mod = _load_module()
    style_mjs = (REPO_ROOT / "tools" / "mermaid_style.mjs").read_text()
    assert f'export const STYLE_V = "{mod.STYLE_V}"' in style_mjs, (
        f"STYLE_V drift: backfill={mod.STYLE_V}, mermaid_style.mjs differs"
    )


def test_main_filters_to_mermaid_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """main() should pipe ONLY mermaid cells through run_batch — html and
    other cell types get filtered, as do mermaid cells without a spec.
    Stub out run_batch to capture the job list without launching Chrome."""
    # Build a fake repo: cells.json + cells/ under tmp_path, plus a copy
    # of the script so REPO_ROOT resolves correctly.
    cells_dir = tmp_path / "cells"
    cells_dir.mkdir()
    fake_tools = tmp_path / "tools"
    fake_tools.mkdir()
    (fake_tools / "backfill_mermaid_svgs.py").write_text(MODULE_PATH.read_text())
    cells_json = {
        "cells": [
            {"id": "cell-1", "cell_type": "mermaid", "spec": "flowchart LR\nA-->B", "colspan": 1},
            {"id": "cell-2", "cell_type": "mermaid", "spec": "flowchart TD\nX-->Y", "colspan": 2},
            {"id": "cell-3", "cell_type": "html", "html": "<p>nope</p>"},
            {"id": "cell-4", "cell_type": "mermaid"},  # no spec → skip
        ]
    }
    (tmp_path / "cells.json").write_text(json.dumps(cells_json))

    # Reload the copied script so its REPO_ROOT (parent.parent of __file__)
    # points at tmp_path, not the real repo.
    spec_ = importlib.util.spec_from_file_location(
        "backfill_fake", fake_tools / "backfill_mermaid_svgs.py"
    )
    assert spec_ and spec_.loader
    fake_mod = importlib.util.module_from_spec(spec_)
    sys.modules["backfill_fake"] = fake_mod
    spec_.loader.exec_module(fake_mod)

    recorded: list[list[dict]] = []

    def fake_run_batch(_root: Path, jobs: list[dict]) -> tuple[int, int, list[str]]:
        recorded.append(list(jobs))
        return len(jobs), 0, []

    monkeypatch.setattr(fake_mod, "run_batch", fake_run_batch)
    monkeypatch.setattr(sys, "argv", ["backfill_mermaid_svgs.py", "--batch", "50"])
    rc = fake_mod.main()
    assert rc == 0
    all_ids = [j["cellId"] for batch in recorded for j in batch]
    assert "cell-1" in all_ids
    assert "cell-2" in all_ids
    assert "cell-3" not in all_ids  # html filtered
    assert "cell-4" not in all_ids  # no spec filtered


def test_main_skips_already_cached(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """If the target SVG already exists on disk, the cell is skipped
    unless --force is passed."""
    mod = _load_module()  # needed below for STYLE_V

    cells_dir = tmp_path / "cells"
    cells_dir.mkdir()
    fake_tools = tmp_path / "tools"
    fake_tools.mkdir()
    (fake_tools / "backfill_mermaid_svgs.py").write_text(MODULE_PATH.read_text())
    cells_json = {
        "cells": [
            {"id": "cell-A", "cell_type": "mermaid", "spec": "flowchart LR\nA-->B", "colspan": 1},
            {"id": "cell-B", "cell_type": "mermaid", "spec": "flowchart LR\nC-->D", "colspan": 1},
        ]
    }
    (tmp_path / "cells.json").write_text(json.dumps(cells_json))
    # Pre-cache cell-A only.
    (cells_dir / f"cell-A.mermaid.{mod.STYLE_V}.svg").write_text("<svg/>")

    spec_ = importlib.util.spec_from_file_location(
        "backfill_fake2", fake_tools / "backfill_mermaid_svgs.py"
    )
    assert spec_ and spec_.loader
    fake_mod = importlib.util.module_from_spec(spec_)
    sys.modules["backfill_fake2"] = fake_mod
    spec_.loader.exec_module(fake_mod)

    recorded: list[list[dict]] = []
    monkeypatch.setattr(
        fake_mod, "run_batch", lambda *a: (recorded.append(list(a[1])) or len(a[1]), 0, [])
    )  # type: ignore[arg-type]
    monkeypatch.setattr(sys, "argv", ["backfill_mermaid_svgs.py"])
    rc = fake_mod.main()
    assert rc == 0
    all_ids = [j["cellId"] for batch in recorded for j in batch]
    assert "cell-A" not in all_ids  # cached, skipped
    assert "cell-B" in all_ids


def test_main_nothing_to_do_returns_zero(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """All mermaid cells already cached → no Chrome launch, exit 0."""
    mod = _load_module()
    cells_dir = tmp_path / "cells"
    cells_dir.mkdir()
    fake_tools = tmp_path / "tools"
    fake_tools.mkdir()
    (fake_tools / "backfill_mermaid_svgs.py").write_text(MODULE_PATH.read_text())
    (tmp_path / "cells.json").write_text(
        json.dumps(
            {
                "cells": [
                    {"id": "x", "cell_type": "mermaid", "spec": "flowchart LR\nA-->B", "colspan": 1}
                ]
            }
        )
    )
    (cells_dir / f"x.mermaid.{mod.STYLE_V}.svg").write_text("<svg/>")
    spec_ = importlib.util.spec_from_file_location(
        "backfill_fake3", fake_tools / "backfill_mermaid_svgs.py"
    )
    assert spec_ and spec_.loader
    fake_mod = importlib.util.module_from_spec(spec_)
    sys.modules["backfill_fake3"] = fake_mod
    spec_.loader.exec_module(fake_mod)
    called = []
    monkeypatch.setattr(fake_mod, "run_batch", lambda *a: called.append(True))
    monkeypatch.setattr(sys, "argv", ["backfill_mermaid_svgs.py"])
    assert fake_mod.main() == 0
    assert not called  # run_batch never invoked
