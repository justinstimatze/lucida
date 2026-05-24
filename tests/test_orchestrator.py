"""Smoke tests for orchestrator's data-layer primitives.

Focus: next_id race-mitigation, save_cells atomic write, LUCIDA_MAX_CELLS
cap, cells_lock acquire/release. Does NOT exercise the LLM-driven paths
(those are integration tests).
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import pytest

import orchestrator


@pytest.fixture
def tmp_cells(tmp_path, monkeypatch):
    """Redirect CELLS_PATH + _CELLS_LOCK_PATH at a tmp file for each test
    so we can run save_cells / load_cells / cells_lock without touching
    the real cells.json."""
    p = tmp_path / "cells.json"
    monkeypatch.setattr(orchestrator, "CELLS_PATH", p)
    monkeypatch.setattr(orchestrator, "_CELLS_LOCK_PATH", p.with_suffix(".json.lock"))
    return p


# --- next_id ---


def test_next_id_empty_starts_at_one():
    assert orchestrator.next_id([]) == "cell-0001"


def test_next_id_uses_max_not_len():
    cells = [
        {"id": "cell-0001"},
        {"id": "cell-0005"},
        {"id": "cell-0003"},
    ]
    # len-based would say cell-0004 (next index); max-based says cell-0006.
    assert orchestrator.next_id(cells) == "cell-0006"


def test_next_id_skips_malformed():
    cells = [
        {"id": "cell-0002"},
        {"id": "not-a-cell-id"},
        {"id": "cell-xxxx"},  # non-numeric suffix
        {},  # no id field
    ]
    assert orchestrator.next_id(cells) == "cell-0003"


def test_next_id_handles_attribute_style():
    """next_id has to tolerate proposal-shaped objects with .id, not just dicts."""

    class _Stub:
        def __init__(self, cid):
            self.id = cid

    cells = [_Stub("cell-0010"), _Stub("cell-0002")]
    assert orchestrator.next_id(cells) == "cell-0011"


# --- save_cells: atomic write + cap ---


def test_save_cells_writes_data(tmp_cells: Path):
    data = {"session_id": "test", "cells": [{"id": "cell-0001", "spec": "x"}]}
    orchestrator.save_cells(data)
    assert tmp_cells.exists()
    written = json.loads(tmp_cells.read_text())
    assert written == data


def test_save_cells_leaves_no_tmp(tmp_cells: Path):
    orchestrator.save_cells({"session_id": "t", "cells": []})
    tmp = tmp_cells.with_suffix(".json.tmp")
    assert not tmp.exists(), "atomic write must clean up the .tmp file"


def test_save_cells_enforces_cap(tmp_cells: Path, monkeypatch):
    monkeypatch.setenv("LUCIDA_MAX_CELLS", "3")
    cells = [{"id": f"cell-{i:04d}"} for i in range(1, 11)]
    data = {"session_id": "t", "cells": cells}
    orchestrator.save_cells(data)
    written = json.loads(tmp_cells.read_text())
    assert len(written["cells"]) == 3
    # newest kept — cell-0008, cell-0009, cell-0010.
    assert [c["id"] for c in written["cells"]] == ["cell-0008", "cell-0009", "cell-0010"]


def test_save_cells_cap_off_keeps_all(tmp_cells: Path, monkeypatch):
    monkeypatch.setenv("LUCIDA_MAX_CELLS", "all")
    cells = [{"id": f"cell-{i:04d}"} for i in range(1, 11)]
    data = {"session_id": "t", "cells": cells}
    orchestrator.save_cells(data)
    written = json.loads(tmp_cells.read_text())
    assert len(written["cells"]) == 10


def test_save_cells_cap_zero_keeps_all(tmp_cells: Path, monkeypatch):
    monkeypatch.setenv("LUCIDA_MAX_CELLS", "0")
    cells = [{"id": f"cell-{i:04d}"} for i in range(1, 11)]
    data = {"session_id": "t", "cells": cells}
    orchestrator.save_cells(data)
    written = json.loads(tmp_cells.read_text())
    assert len(written["cells"]) == 10


# --- load_cells ---


def test_load_cells_missing_returns_skeleton(tmp_cells: Path):
    assert not tmp_cells.exists()
    data = orchestrator.load_cells()
    assert "cells" in data
    assert data["cells"] == []


def test_load_cells_roundtrip(tmp_cells: Path):
    original = {"session_id": "rt", "cells": [{"id": "cell-0001", "spec": "x"}]}
    orchestrator.save_cells(original)
    assert orchestrator.load_cells() == original


def test_save_cells_writes_bak_on_overwrite(tmp_cells: Path):
    """R1: save_cells should rotate the prior live file to .bak so a
    subsequent corruption is recoverable. First save has nothing to back up;
    second save rotates the first save's bytes to .bak."""
    first = {"session_id": "t", "cells": [{"id": "cell-0001"}]}
    orchestrator.save_cells(first)
    second = {"session_id": "t", "cells": [{"id": "cell-0002"}]}
    orchestrator.save_cells(second)
    bak = tmp_cells.with_suffix(".json.bak")
    assert bak.exists()
    assert json.loads(bak.read_text()) == first
    assert json.loads(tmp_cells.read_text()) == second


def test_load_cells_recovers_from_bak_on_corruption(tmp_cells: Path):
    """R4: load_cells should recover from cells.json.bak when the live file
    is corrupt, quarantining the broken one and restoring the backup."""
    good = {"session_id": "t", "cells": [{"id": "cell-0001"}]}
    orchestrator.save_cells(good)
    orchestrator.save_cells({"session_id": "t", "cells": [{"id": "cell-0002"}]})
    # Now corrupt the live file. .bak holds the first save.
    tmp_cells.write_text('{"session_id": "t", "cells": [{"id": "cell-0001"}]}}EXTRA')
    recovered = orchestrator.load_cells()
    assert recovered == good
    # Original corrupt file should be quarantined alongside.
    quarantined = list(tmp_cells.parent.glob("cells.json.corrupt-*"))
    assert len(quarantined) == 1


# --- cells_lock ---


def test_cells_lock_acquire_release_solo(tmp_cells: Path):
    """Solo lock acquire+release should not deadlock; second acquire in
    same process after release should also succeed."""
    with orchestrator.cells_lock():
        pass
    with orchestrator.cells_lock():
        pass


def test_cells_lock_serializes_threads(tmp_cells: Path):
    """Two threads contending for cells_lock should serialize — the
    second can't enter the critical section until the first exits.
    fcntl.flock is per-process not per-thread on Linux, but the same
    file descriptor is shared so the second open() acquires a new fd
    and the LOCK_EX serializes regardless."""
    events: list[tuple[str, float]] = []
    start = time.monotonic()

    def worker(name: str, hold: float):
        with orchestrator.cells_lock():
            events.append((f"{name}-enter", time.monotonic() - start))
            time.sleep(hold)
            events.append((f"{name}-exit", time.monotonic() - start))

    t1 = threading.Thread(target=worker, args=("A", 0.1))
    t2 = threading.Thread(target=worker, args=("B", 0.05))
    t1.start()
    time.sleep(0.01)  # ensure t1 enters first
    t2.start()
    t1.join()
    t2.join()

    # A entered first, A exited before B entered.
    names = [e[0] for e in events]
    assert names[0] == "A-enter"
    assert names.index("A-exit") < names.index("B-enter")


# --- closed_loop_stats ---


def test_closed_loop_stats_empty():
    stats = orchestrator.closed_loop_stats([])
    assert stats["total_cells"] == 0
    assert stats["content_cells"] == 0
    assert stats["ratio"] == 0.0


def test_closed_loop_stats_counts_reflections():
    cells = [
        {"id": "cell-0001", "cell_type": "vega"},
        {"id": "cell-0002", "cell_type": "html", "reflection_source_ids": ["cell-0001"]},
        {"id": "cell-0003", "cell_type": "mermaid", "replaces": "cell-0001"},
    ]
    stats = orchestrator.closed_loop_stats(cells)
    assert stats["total_cells"] == 3
    # cell-0001 is referenced by cell-0002 → reflected_on
    # cell-0002 has reflection_source_ids → reflection_output
    # cell-0003 has replaces → retriggered
    assert stats["closed_cells"] >= 2
