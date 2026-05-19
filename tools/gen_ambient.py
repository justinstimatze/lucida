#!/usr/bin/env python3
"""
Generate ambient/dashboard cells from real data aggregates.

Reads mint_log.jsonl + cells.json, emits ~110 ambient cells covering:
- 4 panels per session, N real sessions: gauge (cell count), sparkline (mints/day),
  treemap (substrate mix), timeline_ribbon (recent mint snippets)
- Dashboard: corpus-wide treemap, session breakdown, hourly/daily mint
  sparklines, recent-mint timeline, etc.

Output cells carry session_id="ambient:session-<name>" or
"ambient:dashboard:<slug>" so they can be filtered/culled cleanly.
Re-running this script regenerates the ambient set with fresh numbers.

Usage:
    uv run tools/gen_ambient.py --out cells_ambient.json
    uv run tools/gen_ambient.py --merge   # write straight to cells.json (with backup)
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path


def load_mint_log(path: Path) -> list[dict]:
    rows = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def load_cells(path: Path) -> tuple[list[dict], dict]:
    with path.open() as f:
        data = json.load(f)
    if isinstance(data, dict) and "cells" in data:
        return data["cells"], data
    return data, {"cells": data}


def parse_ts(ts: str) -> datetime | None:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def mk_id(idx: int) -> str:
    return f"cell-amb-{idx:04d}"


def mk_cell(
    *,
    idx: int,
    session_id: str,
    cell_type: str,
    title: str,
    spec,
    snippet: str = "",
) -> dict:
    return {
        "id": mk_id(idx),
        "session_id": session_id,
        "cell_type": cell_type,
        "title": title,
        "spec": spec,
        "snippet": snippet,
        "timestamp": datetime.now(UTC).isoformat(),
    }


def gauge_spec(value: int, max_val: int, unit: str, label: str) -> dict:
    if max_val <= 0:
        max_val = max(1, value)
    warn = int(max_val * 0.7)
    danger = int(max_val * 0.9)
    return {
        "value": value,
        "min": 0,
        "max": max_val,
        "unit": unit,
        "label": label.upper(),
        "threshold_warn": warn,
        "threshold_danger": danger,
        "direction": "higher_is_worse",
    }


def sparkline_spec(series: list[float], unit: str, label: str) -> dict:
    if not series:
        series = [0]
    current = series[-1] if series else 0
    if isinstance(current, float) and current.is_integer():
        current = int(current)
    return {
        "series": series,
        "current": current,
        "unit": unit,
        "label": label,
    }


def treemap_spec(items: list[tuple[str, int]], title: str) -> dict:
    return {
        "title": title,
        "items": [{"label": k, "value": v} for k, v in items if v > 0],
    }


def timeline_ribbon_spec(stages: list[tuple[str, str, str]], axis_label: str) -> dict:
    return {
        "stages": [
            {"label": lbl, "detail": detail, "status": status} for lbl, detail, status in stages
        ],
        "axis_label": axis_label,
    }


def per_session_panels(mint_log: list[dict], cells: list[dict], idx_start: int) -> list[dict]:
    """For each session present in cells.json with >=10 cells, emit 4 ambient cells."""
    sessions_to_cells = defaultdict(list)
    for c in cells:
        sid = c.get("session_id")
        if sid and not sid.startswith("ambient:") and sid != "perf-fill":
            sessions_to_cells[sid].append(c)

    # Only sessions with >=10 cells to avoid clutter
    qualifying = {s: cs for s, cs in sessions_to_cells.items() if len(cs) >= 10}

    mint_by_session_day: dict[str, Counter] = defaultdict(Counter)
    mint_by_session_substr: dict[str, Counter] = defaultdict(Counter)
    recent_by_session: dict[str, list[dict]] = defaultdict(list)
    for row in mint_log:
        cid = row.get("cell_id")
        if not cid:
            continue
        # Match cell back to its session via cells.json
        cell = next((c for c in cells if c["id"] == cid), None)
        if not cell:
            continue
        sid = cell.get("session_id")
        if sid not in qualifying:
            continue
        ts = parse_ts(row.get("timestamp", ""))
        if ts:
            day_key = ts.strftime("%Y-%m-%d")
            mint_by_session_day[sid][day_key] += 1
        mint_by_session_substr[sid][row.get("cell_type") or "unknown"] += 1
        recent_by_session[sid].append(row)

    out = []
    idx = idx_start
    for sid in sorted(qualifying.keys(), key=lambda s: -len(qualifying[s])):
        scells = qualifying[sid]
        total = len(scells)
        max_total = max(len(cs) for cs in qualifying.values())
        sid_amb = f"ambient:session-{sid}"

        # 1. Gauge — total cells for this session
        out.append(
            mk_cell(
                idx=idx,
                session_id=sid_amb,
                cell_type="gauge",
                title=f"{sid} · cell count",
                spec=gauge_spec(total, max_total, "cells", f"{sid} corpus"),
                snippet=f"Total cells minted under session_id={sid}: {total}.",
            )
        )
        idx += 1

        # 2. Sparkline — mints/day over the days that have any activity
        day_counts = mint_by_session_day.get(sid, Counter())
        if day_counts:
            days = sorted(day_counts.keys())[-30:]
            series = [day_counts[d] for d in days]
        else:
            series = [0]
        out.append(
            mk_cell(
                idx=idx,
                session_id=sid_amb,
                cell_type="sparkline",
                title=f"{sid} · mints/day",
                spec=sparkline_spec(series, "cells", f"{sid} mints/day"),
                snippet=f"Daily mint trajectory for session {sid} across recent active days.",
            )
        )
        idx += 1

        # 3. Treemap — substrate mix
        substr = mint_by_session_substr.get(sid)
        if not substr:
            substr = Counter(c.get("cell_type") or "unknown" for c in scells)
        items = sorted(substr.items(), key=lambda kv: -kv[1])[:10]
        out.append(
            mk_cell(
                idx=idx,
                session_id=sid_amb,
                cell_type="treemap",
                title=f"{sid} · substrate mix",
                spec=treemap_spec(items, f"{sid} substrate distribution"),
                snippet=f"Substrate breakdown of {total} cells in session {sid}.",
            )
        )
        idx += 1

        # 4. Timeline ribbon — most recent 4-5 snippet heads
        recents = sorted(
            recent_by_session.get(sid, []),
            key=lambda r: r.get("timestamp", ""),
            reverse=True,
        )[:5]
        if recents:
            stages = []
            for i, r in enumerate(recents):
                snip_head = (r.get("snippet_head") or r.get("caption") or "")[:50]
                ts = parse_ts(r.get("timestamp", ""))
                ago = ""
                if ts:
                    dt = datetime.now(UTC) - ts
                    if dt.days > 0:
                        ago = f"{dt.days}d ago"
                    elif dt.seconds > 3600:
                        ago = f"{dt.seconds // 3600}h ago"
                    else:
                        ago = f"{dt.seconds // 60}m ago"
                status = "active" if i == 0 else "pending"
                stages.append((r.get("cell_type", "?")[:12], f"{snip_head} ({ago})", status))
            out.append(
                mk_cell(
                    idx=idx,
                    session_id=sid_amb,
                    cell_type="timeline_ribbon",
                    title=f"{sid} · recent mints",
                    spec=timeline_ribbon_spec(stages, f"last 5 cells in {sid}"),
                    snippet=f"Most recent activity in session {sid}.",
                )
            )
            idx += 1

    return out


def dashboard_panels(mint_log: list[dict], cells: list[dict], idx_start: int) -> list[dict]:
    out = []
    idx = idx_start
    sid = "ambient:dashboard"

    # Hourly mint rate, last 24 hours
    now = datetime.now(UTC)
    hour_buckets = Counter()
    day_buckets = Counter()
    substr_total = Counter()
    session_total = Counter()
    for r in mint_log:
        ts = parse_ts(r.get("timestamp", ""))
        if ts:
            hours_ago = int((now - ts).total_seconds() / 3600)
            if 0 <= hours_ago < 24:
                hour_buckets[23 - hours_ago] += 1  # most-recent on right
            days_ago = (now - ts).days
            if 0 <= days_ago < 30:
                day_buckets[29 - days_ago] += 1
        substr_total[r.get("cell_type") or "unknown"] += 1
    for c in cells:
        s = c.get("session_id")
        if s and not s.startswith("ambient:"):
            session_total[s] += 1

    out.append(
        mk_cell(
            idx=idx,
            session_id=sid,
            cell_type="sparkline",
            title="dashboard · mints/hour last 24h",
            spec=sparkline_spec(
                [hour_buckets[i] for i in range(24)], "cells/h", "hourly mint rate"
            ),
            snippet="Cell mint rate sampled hourly over the last 24 hours.",
        )
    )
    idx += 1

    out.append(
        mk_cell(
            idx=idx,
            session_id=sid,
            cell_type="sparkline",
            title="dashboard · mints/day last 30d",
            spec=sparkline_spec(
                [day_buckets[i] for i in range(30)], "cells/day", "daily mint rate"
            ),
            snippet="Cell mint rate sampled daily over the last 30 days.",
        )
    )
    idx += 1

    out.append(
        mk_cell(
            idx=idx,
            session_id=sid,
            cell_type="treemap",
            title="dashboard · substrate mix all-time",
            spec=treemap_spec(
                sorted(substr_total.items(), key=lambda kv: -kv[1])[:11],
                "All-time substrate distribution",
            ),
            snippet="How the corpus splits across substrate types.",
        )
    )
    idx += 1

    out.append(
        mk_cell(
            idx=idx,
            session_id=sid,
            cell_type="treemap",
            title="dashboard · cells per session",
            spec=treemap_spec(
                sorted(session_total.items(), key=lambda kv: -kv[1])[:15],
                "Cells per session in current corpus",
            ),
            snippet="Distribution of cells across the 22 active sessions.",
        )
    )
    idx += 1

    out.append(
        mk_cell(
            idx=idx,
            session_id=sid,
            cell_type="gauge",
            title="dashboard · total corpus",
            spec=gauge_spec(len(cells), 5000, "cells", "total corpus"),
            snippet=f"Total cells in cells.json: {len(cells)}.",
        )
    )
    idx += 1

    # Recent-mints timeline ribbon: top 5 across all sessions
    recents = sorted(mint_log, key=lambda r: r.get("timestamp", ""), reverse=True)[:5]
    stages = []
    for i, r in enumerate(recents):
        snip_head = (r.get("snippet_head") or r.get("caption") or "")[:50]
        ts = parse_ts(r.get("timestamp", ""))
        ago = "?"
        if ts:
            dt = now - ts
            if dt.days > 0:
                ago = f"{dt.days}d ago"
            elif dt.seconds > 3600:
                ago = f"{dt.seconds // 3600}h ago"
            else:
                ago = f"{dt.seconds // 60}m ago"
        stages.append(
            (
                r.get("cell_type", "?")[:12],
                f"{snip_head} ({ago})",
                "active" if i == 0 else "pending",
            )
        )
    out.append(
        mk_cell(
            idx=idx,
            session_id=sid,
            cell_type="timeline_ribbon",
            title="dashboard · recent mints all sessions",
            spec=timeline_ribbon_spec(stages, "last 5 mints across the corpus"),
            snippet="Latest cells minted, irrespective of session.",
        )
    )
    idx += 1

    # Active-sessions gauge
    active_sessions_24h = len(
        {
            cells[i].get("session_id")
            for i, r in enumerate(mint_log)
            if parse_ts(r.get("timestamp", ""))
            and (now - parse_ts(r.get("timestamp", ""))).total_seconds() < 86400
            and i < len(cells)
        }
    )
    out.append(
        mk_cell(
            idx=idx,
            session_id=sid,
            cell_type="gauge",
            title="dashboard · sessions active 24h",
            spec=gauge_spec(active_sessions_24h, 22, "sessions", "active sessions"),
            snippet="Sessions with at least one mint in the last 24 hours.",
        )
    )
    idx += 1

    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cells", type=Path, default=Path("cells.json"))
    p.add_argument("--mint-log", type=Path, default=Path("mint_log.jsonl"))
    p.add_argument(
        "--out",
        type=Path,
        default=Path("cells_ambient.json"),
        help="Where to write the ambient cells (separate file by default).",
    )
    p.add_argument(
        "--merge",
        action="store_true",
        help="Merge ambient cells directly into cells.json (with backup).",
    )
    args = p.parse_args()

    cells, wrapper = load_cells(args.cells)
    mint_log = load_mint_log(args.mint_log)

    # Strip any prior ambient cells so re-runs don't accumulate
    cells_no_ambient = [c for c in cells if not (c.get("session_id") or "").startswith("ambient:")]

    idx = 1
    per_session = per_session_panels(mint_log, cells_no_ambient, idx)
    idx += len(per_session)
    dashboard = dashboard_panels(mint_log, cells_no_ambient, idx)

    ambient_cells = per_session + dashboard
    print(f"Generated {len(ambient_cells)} ambient cells:")
    print(f"  - {len(per_session)} per-session panels")
    print(f"  - {len(dashboard)} dashboard panels")

    if args.merge:
        ts = int(time.time())
        backup = args.cells.with_suffix(args.cells.suffix + f".pre-ambient-{ts}")
        shutil.copy(args.cells, backup)
        print(f"Backup: {backup}")
        merged = cells_no_ambient + ambient_cells
        if isinstance(wrapper, dict) and "cells" in wrapper:
            wrapper["cells"] = merged
            out_data = wrapper
        else:
            out_data = merged
        tmp = args.cells.with_suffix(args.cells.suffix + ".tmp")
        with tmp.open("w") as f:
            json.dump(out_data, f)
        tmp.replace(args.cells)
        print(
            f"Wrote {args.cells} ({len(merged)} cells total: {len(cells_no_ambient)} real + {len(ambient_cells)} ambient)"
        )
    else:
        with args.out.open("w") as f:
            json.dump(ambient_cells, f, indent=2)
        print(f"Wrote {args.out} ({len(ambient_cells)} cells)")


if __name__ == "__main__":
    main()
