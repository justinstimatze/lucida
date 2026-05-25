"""Shared atomic-write + recovery primitives for lucida state sidecars.

Lifted from the orchestrator's save_cells / load_cells pattern (R1-R5
discipline: tmp-write + parse-validate + bak-rotate + os.replace +
quarantine-on-corrupt). Sidecar state files (watcher offsets, nano_banana
daily counts, cells-cache SVGs) had been doing raw write_text/read_text —
a mid-write SIGKILL or disk-full would leave them empty or partial, and
on next read they'd silently reset (returning {}). State loss is
recoverable for these specifically, but truncation-as-empty is the same
class of bug that corrupted cells.json on 2026-05-24. Centralizing the
pattern means one place to harden rather than five.

stdlib only by design — this module is leaf-level, no import of project
modules, so it's safe to import from anywhere without circular grief.
"""

from __future__ import annotations

import contextlib
import json
import os
import sys
import time
from pathlib import Path


def atomic_write_json(path: Path, data: dict, keep_bak: bool = True) -> None:
    """Atomic JSON write with parse-validate + optional .bak rotation.

    Pipeline: write .tmp → parse-validate .tmp → rotate live to .bak (if
    requested) → os.replace .tmp into place. Caller's responsibility to
    wrap in try/except if best-effort semantics are wanted (this raises
    on disk-full / parse-fail so silent corruption can't happen).

    keep_bak=False skips the rotation when an extra disk-pressure copy
    isn't worth it (large state where state-loss is acceptable).
    """
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    bak = path.with_suffix(path.suffix + ".bak")
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    # R2: parse-validate the .tmp before committing. If the bytes on disk
    # don't round-trip, abort instead of clobbering the live file.
    try:
        json.loads(tmp.read_text())
    except json.JSONDecodeError as e:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"atomic_write_json aborted: .tmp failed parse check ({e})") from e
    # R1: rotate the prior live file to .bak. Best-effort — never block
    # the write if the rotation fails (filesystem quirks, permissions).
    if keep_bak and path.exists():
        try:
            os.replace(path, bak)
        except OSError:
            pass
    os.replace(tmp, path)


def atomic_write_bytes(path: Path, body: bytes) -> None:
    """Atomic bytes write (no parse, no .bak). For non-JSON state like
    the snap_receiver SVG cache, where doubling disk pressure for a
    rolling backup would be wasteful at 2500-file scale."""
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(body)
    os.replace(tmp, path)


def load_json_with_recovery(path: Path) -> dict | None:
    """Read JSON with R4 corruption recovery.

    Try live → on JSONDecodeError quarantine to <name>.corrupt-<ts><ext>
    then try .bak → return None if both are unreadable. Loud stderr on
    quarantine so a silent reset can't go unnoticed (the 2026-05-24
    cells.json incident was invisible for hours because the corrupt file
    just appeared empty to load_cells).
    """
    path = Path(path)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())  # type: ignore[no-any-return]
    except json.JSONDecodeError as e:
        bak = path.with_suffix(path.suffix + ".bak")
        sys.stderr.write(
            f"[atomic_state] {path.name} corrupt ({e}); attempting recovery from {bak.name}\n",
        )
        # Quarantine the broken file before doing anything destructive
        # so the operator can inspect post-mortem.
        quarantine = path.with_name(f"{path.stem}.corrupt-{int(time.time())}{path.suffix}")
        try:
            path.rename(quarantine)
            sys.stderr.write(f"[atomic_state] quarantined corrupt file at {quarantine.name}\n")
        except OSError as ren_err:
            sys.stderr.write(f"[atomic_state] quarantine rename failed: {ren_err}\n")
        if bak.exists():
            try:
                recovered = json.loads(bak.read_text())
                # Promote .bak back to live so subsequent reads see it
                # without going through this recovery path again.
                try:
                    atomic_write_json(path, recovered, keep_bak=False)
                except (OSError, RuntimeError) as wr_err:
                    sys.stderr.write(
                        f"[atomic_state] restoring {path.name} from {bak.name} failed: {wr_err}\n",
                    )
                return recovered  # type: ignore[no-any-return]
            except json.JSONDecodeError as e2:
                sys.stderr.write(
                    f"[atomic_state] {bak.name} also corrupt ({e2}); giving up\n",
                )
        return None


@contextlib.contextmanager
def state_lock(state_path: Path):
    """fcntl.flock-based exclusive lock on a sidecar file alongside
    ``state_path``. Lock file is ``<state_path>.lock`` — separate from
    the state itself so the lock survives os.replace of the state file.

    Wrap read-modify-write cycles (load → mutate → save) so two processes
    racing on the same state file serialize cleanly. Quietly no-ops on
    platforms without fcntl (Windows) — single-process callers are still
    safe via their own internal serialization.
    """
    state_path = Path(state_path)
    lock_path = state_path.with_suffix(state_path.suffix + ".lock")
    try:
        import fcntl
    except ImportError:
        yield
        return
    fp = open(lock_path, "a+")  # noqa: SIM115 — flock'd across the with-block
    try:
        fcntl.flock(fp.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fp.fileno(), fcntl.LOCK_UN)
        finally:
            fp.close()
