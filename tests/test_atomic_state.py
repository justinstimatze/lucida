"""Unit tests for tools/atomic_state.py — the shared R1-R5 helpers.

Covers the corruption-recovery contract that watcher.py, nano_banana.py,
and tools/snap_receiver.py now lean on. The orchestrator's save_cells
has its own (older, inlined) version of the same pattern with separate
test coverage in test_orchestrator.py; this file exercises the extracted
helper directly so any future hardening lands here once.
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from tools.atomic_state import (
    atomic_write_bytes,
    atomic_write_json,
    load_json_with_recovery,
    state_lock,
)

# ---------------------------------------------------------------------------
# atomic_write_json
# ---------------------------------------------------------------------------


def test_atomic_write_json_writes(tmp_path: Path):
    p = tmp_path / "state.json"
    atomic_write_json(p, {"last_offset": 42, "v": [1, 2, 3]})
    assert p.exists()
    assert json.loads(p.read_text()) == {"last_offset": 42, "v": [1, 2, 3]}
    # Verify no .tmp residue — the rename must have committed.
    assert not (tmp_path / "state.json.tmp").exists()


def test_atomic_write_json_rotates_bak(tmp_path: Path):
    p = tmp_path / "state.json"
    bak = tmp_path / "state.json.bak"
    atomic_write_json(p, {"gen": 1})
    atomic_write_json(p, {"gen": 2})
    # Live file should hold the latest write; .bak should hold the prior.
    assert json.loads(p.read_text()) == {"gen": 2}
    assert bak.exists()
    assert json.loads(bak.read_text()) == {"gen": 1}


def test_atomic_write_json_keep_bak_false_skips_rotation(tmp_path: Path):
    p = tmp_path / "state.json"
    bak = tmp_path / "state.json.bak"
    atomic_write_json(p, {"gen": 1}, keep_bak=False)
    atomic_write_json(p, {"gen": 2}, keep_bak=False)
    assert json.loads(p.read_text()) == {"gen": 2}
    assert not bak.exists()


# ---------------------------------------------------------------------------
# load_json_with_recovery
# ---------------------------------------------------------------------------


def test_load_json_with_recovery_returns_data(tmp_path: Path):
    p = tmp_path / "state.json"
    p.write_text(json.dumps({"alpha": 1}))
    assert load_json_with_recovery(p) == {"alpha": 1}


def test_load_json_with_recovery_returns_none_for_missing(tmp_path: Path):
    p = tmp_path / "absent.json"
    assert load_json_with_recovery(p) is None


def test_load_json_with_recovery_falls_back_to_bak(tmp_path: Path):
    p = tmp_path / "state.json"
    bak = tmp_path / "state.json.bak"
    # Write a clean prior gen via the atomic helper, then corrupt the live file.
    atomic_write_json(p, {"gen": 1})
    atomic_write_json(p, {"gen": 2})  # rotates {"gen": 1} → .bak
    p.write_text("{not valid json")
    assert bak.exists() and json.loads(bak.read_text()) == {"gen": 1}

    recovered = load_json_with_recovery(p)
    assert recovered == {"gen": 1}
    # Live file should have been restored from .bak so the next read is clean.
    assert json.loads(p.read_text()) == {"gen": 1}


def test_load_json_with_recovery_quarantines_corrupt_file(tmp_path: Path):
    p = tmp_path / "state.json"
    p.write_text("{still not json")
    # No .bak — recovery should return None but still quarantine the live file.
    assert load_json_with_recovery(p) is None
    quarantined = list(tmp_path.glob("state.corrupt-*.json"))
    assert len(quarantined) == 1, f"expected 1 quarantine file, got: {quarantined}"
    # Live file should be gone (renamed into the quarantine).
    assert not p.exists()


# ---------------------------------------------------------------------------
# atomic_write_bytes
# ---------------------------------------------------------------------------


def test_atomic_write_bytes_writes(tmp_path: Path):
    p = tmp_path / "cell-0001.mermaid.svg"
    body = b'<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    atomic_write_bytes(p, body)
    assert p.read_bytes() == body
    # Same no-residue contract as atomic_write_json.
    assert not (tmp_path / "cell-0001.mermaid.svg.tmp").exists()


def test_atomic_write_bytes_overwrites(tmp_path: Path):
    p = tmp_path / "cell.svg"
    atomic_write_bytes(p, b"first")
    atomic_write_bytes(p, b"second")
    assert p.read_bytes() == b"second"


# ---------------------------------------------------------------------------
# state_lock
# ---------------------------------------------------------------------------


def test_state_lock_acquire_release_solo(tmp_path: Path):
    """Solo acquire+release shouldn't deadlock; re-entry after exit
    should also succeed."""
    p = tmp_path / "state.json"
    with state_lock(p):
        pass
    with state_lock(p):
        pass


def test_state_lock_serializes(tmp_path: Path):
    """Two threads contending for the same state file's lock must
    serialize — second thread can't enter while first holds the lock.
    Mirrors the cells_lock serialization test in test_orchestrator.py."""
    p = tmp_path / "state.json"
    events: list[tuple[str, float]] = []
    start = time.monotonic()

    def worker(name: str, hold: float):
        with state_lock(p):
            events.append((f"{name}-enter", time.monotonic() - start))
            time.sleep(hold)
            events.append((f"{name}-exit", time.monotonic() - start))

    t1 = threading.Thread(target=worker, args=("A", 0.1))
    t2 = threading.Thread(target=worker, args=("B", 0.05))
    t1.start()
    time.sleep(0.01)  # let A enter first
    t2.start()
    t1.join()
    t2.join()

    names = [e[0] for e in events]
    assert names[0] == "A-enter"
    assert names.index("A-exit") < names.index("B-enter")


def test_state_lock_uses_sidecar_path(tmp_path: Path):
    """Lock file should live at <state>.lock — not on the state file
    itself, so it survives os.replace of the state."""
    p = tmp_path / "state.json"
    with state_lock(p):
        # Inside the lock, the sidecar must exist.
        assert (tmp_path / "state.json.lock").exists()
