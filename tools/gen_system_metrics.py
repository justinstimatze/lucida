#!/usr/bin/env python3
"""
Emit live system-metric cells (memory, CPU, load, disk, network) into
cells.json with stable IDs so each invocation updates in place rather
than appending.

Cells:
    cell-sys-mem      gauge       memory usage %
    cell-sys-cpu      sparkline   CPU usage % (last N samples)
    cell-sys-load     html        loadavg 1m / 5m / 15m callouts
    cell-sys-disk     gauge       root filesystem usage %
    cell-sys-net      sparkline   network throughput (KB/s, last N samples)

Sparkline history is persisted in tools/.system_metrics_state.json so
repeated invocations grow the series. Default rolling window: 60 samples.

session_id = "system:host" so cells group into one column in lucida.

Usage:
    uv run tools/gen_system_metrics.py                  # single-shot, update cells.json
    uv run tools/gen_system_metrics.py --watch          # poll forever (default 5s)
    uv run tools/gen_system_metrics.py --interval 10    # poll every 10s (with --watch)
    uv run tools/gen_system_metrics.py --window 120     # rolling history 120 samples

Inputs are read from /proc on Linux. Cross-platform via psutil if
installed; otherwise /proc only.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CELLS_PATH = REPO_ROOT / "cells.json"
STATE_PATH = REPO_ROOT / "tools" / ".system_metrics_state.json"
SESSION_ID = "system:host"
DEFAULT_WINDOW = 60
DEFAULT_INTERVAL = 5


def _read_text(p: str) -> str:
    try:
        with open(p) as f:
            return f.read()
    except OSError:
        return ""


def read_meminfo() -> tuple[int, int]:
    """Return (used_kb, total_kb). MemAvailable preferred over MemFree."""
    txt = _read_text("/proc/meminfo")
    total = avail = 0
    for line in txt.splitlines():
        if line.startswith("MemTotal:"):
            total = int(line.split()[1])
        elif line.startswith("MemAvailable:"):
            avail = int(line.split()[1])
    used = max(0, total - avail) if total and avail else 0
    return used, total


def read_cpu_jiffies() -> tuple[int, int]:
    """Return (idle_jiffies, total_jiffies) from the aggregate cpu line."""
    txt = _read_text("/proc/stat")
    for line in txt.splitlines():
        if line.startswith("cpu "):
            parts = line.split()[1:]
            vals = [int(v) for v in parts[:8]] if len(parts) >= 8 else [int(v) for v in parts]
            # user nice system idle iowait irq softirq steal
            idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
            total = sum(vals)
            return idle, total
    return 0, 0


def read_loadavg() -> tuple[float, float, float]:
    txt = _read_text("/proc/loadavg")
    if not txt:
        return 0.0, 0.0, 0.0
    parts = txt.split()
    try:
        return float(parts[0]), float(parts[1]), float(parts[2])
    except (ValueError, IndexError):
        return 0.0, 0.0, 0.0


def read_disk_usage(path: str = "/") -> tuple[int, int]:
    """Return (used_bytes, total_bytes)."""
    try:
        st = os.statvfs(path)
    except OSError:
        return 0, 0
    total = st.f_blocks * st.f_frsize
    free = st.f_bavail * st.f_frsize
    return max(0, total - free), total


def read_net_bytes() -> int:
    """Sum rx+tx bytes across non-loopback interfaces."""
    txt = _read_text("/proc/net/dev")
    total = 0
    for line in txt.splitlines():
        if ":" not in line:
            continue
        name, rest = line.split(":", 1)
        name = name.strip()
        if name in ("lo", "Inter-"):
            continue
        parts = rest.split()
        if len(parts) < 9:
            continue
        try:
            rx = int(parts[0])
            tx = int(parts[8])
        except ValueError:
            continue
        total += rx + tx
    return total


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {}
    try:
        with STATE_PATH.open() as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state: dict[str, Any]) -> None:
    tmp = STATE_PATH.with_suffix(".tmp")
    with tmp.open("w") as f:
        json.dump(state, f)
    tmp.replace(STATE_PATH)


def push(series: list[float], v: float, window: int) -> list[float]:
    series.append(round(float(v), 2))
    if len(series) > window:
        del series[: len(series) - window]
    return series


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def mk_cell(*, cid: str, cell_type: str, title: str, spec: Any, snippet: str = "") -> dict:
    return {
        "id": cid,
        "session_id": SESSION_ID,
        "cell_type": cell_type,
        "title": title,
        "spec": spec,
        "snippet": snippet,
        "timestamp": now_iso(),
    }


def build_cells(state: dict[str, Any], window: int, cpu_pct: float, net_kbps: float) -> list[dict]:
    mem_used_kb, mem_total_kb = read_meminfo()
    mem_used_mb = mem_used_kb // 1024
    mem_total_mb = max(1, mem_total_kb // 1024)
    mem_pct = round(100 * mem_used_kb / max(1, mem_total_kb), 1)

    load1, load5, load15 = read_loadavg()
    disk_used, disk_total = read_disk_usage("/")
    disk_pct = round(100 * disk_used / max(1, disk_total), 1)
    disk_used_gb = round(disk_used / (1024**3), 1)
    disk_total_gb = round(disk_total / (1024**3), 1)

    cpu_series = state.setdefault("cpu_series", [])
    cpu_series = push(cpu_series, cpu_pct, window)
    state["cpu_series"] = cpu_series

    net_series = state.setdefault("net_series", [])
    net_series = push(net_series, net_kbps, window)
    state["net_series"] = net_series

    cells: list[dict] = []

    cells.append(
        mk_cell(
            cid="cell-sys-mem",
            cell_type="gauge",
            title="MEMORY USAGE",
            spec={
                "value": mem_pct,
                "min": 0,
                "max": 100,
                "unit": "%",
                "label": f"{mem_used_mb}MB / {mem_total_mb}MB",
                "threshold_warn": 70,
                "threshold_danger": 90,
                "direction": "higher_is_worse",
            },
            snippet=f"{mem_used_mb}MB used of {mem_total_mb}MB ({mem_pct}%)",
        )
    )

    cells.append(
        mk_cell(
            cid="cell-sys-cpu",
            cell_type="sparkline",
            title="CPU USAGE",
            spec={
                "series": cpu_series,
                "current": cpu_series[-1] if cpu_series else 0,
                "unit": "%",
                "label": f"CPU {cpu_series[-1] if cpu_series else 0}%",
            },
            snippet=f"CPU {cpu_series[-1] if cpu_series else 0}% (rolling {len(cpu_series)} samples)",
        )
    )

    cells.append(
        mk_cell(
            cid="cell-sys-load",
            cell_type="html",
            title="LOAD AVERAGE",
            spec="",
            snippet=f"loadavg 1m={load1} 5m={load5} 15m={load15}",
        )
    )
    cells[-1]["html_layout"] = "callouts"
    cells[-1]["html"] = (
        "<div class='callout'>"
        f"<span class='big'>{load1}</span>"
        "<span class='label'>1 MIN</span></div>"
        "<div class='callout'>"
        f"<span class='big'>{load5}</span>"
        "<span class='label'>5 MIN</span></div>"
        "<div class='callout'>"
        f"<span class='big'>{load15}</span>"
        "<span class='label'>15 MIN</span></div>"
    )

    cells.append(
        mk_cell(
            cid="cell-sys-disk",
            cell_type="gauge",
            title="DISK USAGE /",
            spec={
                "value": disk_pct,
                "min": 0,
                "max": 100,
                "unit": "%",
                "label": f"{disk_used_gb}GB / {disk_total_gb}GB",
                "threshold_warn": 80,
                "threshold_danger": 95,
                "direction": "higher_is_worse",
            },
            snippet=f"{disk_used_gb}GB used of {disk_total_gb}GB ({disk_pct}%)",
        )
    )

    cells.append(
        mk_cell(
            cid="cell-sys-net",
            cell_type="sparkline",
            title="NETWORK THROUGHPUT",
            spec={
                "series": net_series,
                "current": net_series[-1] if net_series else 0,
                "unit": "KB/s",
                "label": f"{net_series[-1] if net_series else 0} KB/s",
            },
            snippet=f"{net_series[-1] if net_series else 0} KB/s (rolling {len(net_series)} samples)",
        )
    )

    return cells


def sample_cpu_pct(state: dict[str, Any]) -> float:
    idle_now, total_now = read_cpu_jiffies()
    idle_prev = state.get("cpu_idle_prev", 0)
    total_prev = state.get("cpu_total_prev", 0)
    state["cpu_idle_prev"] = idle_now
    state["cpu_total_prev"] = total_now
    d_total = total_now - total_prev
    d_idle = idle_now - idle_prev
    if d_total <= 0:
        return 0.0
    return round(100 * (1 - d_idle / d_total), 1)


def sample_net_kbps(state: dict[str, Any], dt_sec: float) -> float:
    bytes_now = read_net_bytes()
    bytes_prev = state.get("net_bytes_prev", 0)
    state["net_bytes_prev"] = bytes_now
    state["net_t_prev"] = time.time()
    if bytes_prev == 0 or dt_sec <= 0:
        return 0.0
    delta = max(0, bytes_now - bytes_prev)
    return round(delta / 1024 / dt_sec, 1)


def merge_cells(out_cells: list[dict], existing: list[dict]) -> list[dict]:
    """Replace any cells with matching IDs; append new ones. Existing
    cells with unrelated IDs are preserved. Stable IDs mean N invocations
    don't grow cells.json — the system-metric set stays at 5 entries."""
    out_ids = {c["id"] for c in out_cells}
    kept = [c for c in existing if c.get("id") not in out_ids]
    return kept + out_cells


CELLS_LOCK_PATH = CELLS_PATH.with_suffix(".json.lock")


def _cells_lock():
    """Acquire the same fcntl lock orchestrator.cells_lock() uses, so a
    --watch loop here can't race the watcher's mint cycle."""
    try:
        import fcntl
    except ImportError:
        return None
    fp = open(CELLS_LOCK_PATH, "a+")  # noqa: SIM115 — flock'd, released by caller
    fcntl.flock(fp.fileno(), fcntl.LOCK_EX)
    return fp


def _cells_unlock(fp) -> None:
    if fp is None:
        return
    try:
        import fcntl

        fcntl.flock(fp.fileno(), fcntl.LOCK_UN)
    finally:
        fp.close()


def write_cells(out_cells: list[dict], make_backup: bool = True) -> None:
    lock = _cells_lock()
    try:
        if CELLS_PATH.exists():
            with CELLS_PATH.open() as f:
                data = json.load(f)
            existing = data["cells"] if isinstance(data, dict) and "cells" in data else data
            wrap = data if isinstance(data, dict) and "cells" in data else None
            if make_backup:
                backup = CELLS_PATH.with_suffix(f".json.before-sysmetric-{int(time.time())}")
                shutil.copy2(CELLS_PATH, backup)
            merged = merge_cells(out_cells, existing)
        else:
            merged = out_cells
            wrap = None

        if wrap is not None:
            wrap["cells"] = merged
            payload: Any = wrap
        else:
            payload = merged

        tmp = CELLS_PATH.with_suffix(".json.tmp")
        with tmp.open("w") as f:
            json.dump(payload, f, indent=2)
        tmp.replace(CELLS_PATH)
    finally:
        _cells_unlock(lock)


def run_once(state: dict[str, Any], window: int, dt_sec: float, write: bool, backup: bool) -> None:
    cpu_pct = sample_cpu_pct(state)
    net_kbps = sample_net_kbps(state, dt_sec)
    cells = build_cells(state, window, cpu_pct, net_kbps)
    save_state(state)
    if write:
        write_cells(cells, make_backup=backup)


def main() -> None:
    # R3: this tool writes cells.json as a second concurrent writer alongside
    # watcher.py. Even with the shared cells.json.lock flock, a 2026-05-24
    # incident corrupted cells.json with "Extra data" — symptom of an unlucky
    # write overlap. Gate the whole process on an explicit opt-in env var so
    # the supervisor can't accidentally launch a second writer. --print-only
    # is exempt because it doesn't touch cells.json.
    opt_in = os.environ.get("LUCIDA_SYSMETRIC", "").strip().lower() in ("1", "true", "yes", "on")
    if not opt_in and "--print-only" not in sys.argv:
        sys.stderr.write(
            "[sysmetric] disabled by default — concurrent writer to cells.json.\n"
            "  Set LUCIDA_SYSMETRIC=1 to enable, or pass --print-only to inspect output\n"
            "  without writing.\n",
        )
        sys.exit(0)
    ap = argparse.ArgumentParser(description="Live system-metric cell ingest.")
    ap.add_argument("--watch", action="store_true", help="Poll forever (Ctrl-C to stop).")
    ap.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL,
        help=f"Seconds between polls when --watch. Default {DEFAULT_INTERVAL}.",
    )
    ap.add_argument(
        "--window",
        type=int,
        default=DEFAULT_WINDOW,
        help=f"Sparkline rolling-window size. Default {DEFAULT_WINDOW}.",
    )
    ap.add_argument(
        "--no-backup",
        action="store_true",
        help="Skip cells.json backup per write (useful for --watch).",
    )
    ap.add_argument(
        "--print-only", action="store_true", help="Print JSON to stdout; don't touch cells.json."
    )
    args = ap.parse_args()

    state = load_state()

    def _shutdown(sig, frame):
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    if not args.watch:
        # First-run priming: take two CPU samples 0.5s apart so the first
        # cpu_pct isn't 0 (which would otherwise be the case without a
        # prior baseline in state).
        if "cpu_total_prev" not in state:
            sample_cpu_pct(state)
            time.sleep(0.5)
        cpu_pct = sample_cpu_pct(state)
        net_kbps = sample_net_kbps(state, args.interval)
        cells = build_cells(state, args.window, cpu_pct, net_kbps)
        save_state(state)
        if args.print_only:
            json.dump(cells, sys.stdout, indent=2)
            print()
        else:
            write_cells(cells, make_backup=not args.no_backup)
        return

    last_t = time.time()
    if "cpu_total_prev" not in state:
        sample_cpu_pct(state)
    while True:
        time.sleep(args.interval)
        now = time.time()
        dt = max(0.001, now - last_t)
        last_t = now
        try:
            run_once(state, args.window, dt, write=not args.print_only, backup=not args.no_backup)
        except Exception as e:
            print(f"[gen_system_metrics] error: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
