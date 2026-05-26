"""Drain the awaiting-generation backlog for visual substrates.

Calls the specialists already configured in orchestrator.py for every
cell with cell_type in the visual set AND notes containing
"(awaiting generation)". Updates the spec in-place and saves cells.json
atomically. Handles SuppressedMintError silently (specialist decided
the snippet can't ground the substrate).

Default substrate set (mermaid+vega+treemap+timeline_ribbon+
force_graph+animated_svg) was picked 2026-05-25 — those have visible
content on the dashboard. Skips html/text/scene3d/code/trajectory.

Cost: estimated $0.02-0.03 per cell at Sonnet 4.6. For the current
801-cell backlog, that's $16-24 of one-time spend.

Usage:
    uv run python tools/backfill_awaiting_specs.py --dry-run
    uv run python tools/backfill_awaiting_specs.py
    uv run python tools/backfill_awaiting_specs.py --types mermaid,vega
    uv run python tools/backfill_awaiting_specs.py --limit 10

Atomic save every BATCH_SAVE cells so a Ctrl-C mid-run doesn't lose
the work that already completed. Re-running is idempotent (the
filtered set shrinks as cells move out of "(awaiting generation)").
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from tools.atomic_state import atomic_write_json, state_lock  # noqa: E402

DEFAULT_TYPES = ("mermaid", "vega", "treemap", "timeline_ribbon", "force_graph", "animated_svg")
BATCH_SAVE = 25  # atomic save every N cells so Ctrl-C is recoverable
AWAITING_MARKER = "(awaiting generation)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true", help="count + estimate cost, write nothing"
    )
    parser.add_argument(
        "--types",
        default=",".join(DEFAULT_TYPES),
        help=f"comma-separated cell_types (default: {','.join(DEFAULT_TYPES)})",
    )
    parser.add_argument("--limit", type=int, default=0, help="cap how many to process (0 = no cap)")
    args = parser.parse_args()
    types = tuple(t.strip() for t in args.types.split(",") if t.strip())
    cells_json = REPO_ROOT / "cells.json"
    lock_path = REPO_ROOT / "cells.json.lock"

    import specialists as _specs  # imported here so --help works without anthropic key

    fns = {
        "mermaid": _specs.generate_mermaid_spec,
        "vega": _specs.generate_vega_spec,
        "html": _specs.generate_html_spec,
        "animated_svg": _specs.generate_animated_svg_spec,
        "scene3d": _specs.generate_scene3d_spec,
        "treemap": _specs.generate_treemap_spec,
        "sparkline": _specs.generate_sparkline_spec,
        "timeline_ribbon": _specs.generate_timeline_ribbon_spec,
        "trajectory": _specs.generate_trajectory_spec,
        "force_graph": _specs.generate_force_graph_spec,
        "gauge": _specs.generate_gauge_spec,
    }
    suppressed_mint_error = __import__("orchestrator").SuppressedMintError

    with state_lock(lock_path):
        with cells_json.open() as f:
            data = json.load(f)
        cells = data.get("cells")
        if not isinstance(cells, list):
            print("[backfill-specs] cells.json missing 'cells' list", file=sys.stderr)
            return 1

        todo_idx = []
        for i, c in enumerate(cells):
            ct = c.get("cell_type")
            if ct not in types:
                continue
            notes = c.get("notes") or ""
            if AWAITING_MARKER not in notes:
                continue
            if not c.get("trigger_snippet"):
                continue
            todo_idx.append(i)
        if args.limit:
            todo_idx = todo_idx[: args.limit]

        if not todo_idx:
            print("[backfill-specs] nothing to do")
            return 0

        est_low = 0.02 * len(todo_idx)
        est_high = 0.03 * len(todo_idx)
        print(
            f"[backfill-specs] todo={len(todo_idx)} types={types} "
            f"estimated spend ${est_low:.2f}-${est_high:.2f}"
        )
        if args.dry_run:
            return 0

        n_ok = 0
        n_skip = 0
        n_fail = 0
        last_save_at = 0
        start = time.time()
        for k, i in enumerate(todo_idx):
            c = cells[i]
            ct = c["cell_type"]
            fn = fns.get(ct)
            if not fn:
                n_skip += 1
                continue
            snippet = c.get("trigger_snippet", "")
            ctx = c.get("prompt", "") or ""
            kwargs: dict = {}
            if ct == "mermaid":
                hint = c.get("mermaid_subtype") or "n/a"
                if hint and hint != "n/a":
                    kwargs["subtype_hint"] = hint
            try:
                result = fn(snippet, ctx, **kwargs)
                if result.should_demote_to_text:
                    n_skip += 1
                    print(
                        f"  [{k + 1}/{len(todo_idx)}] {c.get('id')} {ct} demote: {result.demotion_reason[:60]}"
                    )
                    continue
                # Mermaid lint pass for new specs only (matches orchestrator flow).
                if ct == "mermaid" and isinstance(result.spec, str):
                    ok, err = _specs.lint_mermaid_spec(result.spec)
                    if not ok:
                        fixed, _summary, aborted = _specs.fix_mermaid_spec(result.spec, err)
                        if aborted:
                            n_skip += 1
                            print(
                                f"  [{k + 1}/{len(todo_idx)}] {c.get('id')} mermaid lint+fix aborted"
                            )
                            continue
                        ok2, _ = _specs.lint_mermaid_spec(fixed)
                        if not ok2:
                            n_skip += 1
                            continue
                        result_spec = fixed
                    else:
                        result_spec = result.spec
                else:
                    result_spec = result.spec
                if ct == "html":
                    c["html"] = result_spec
                else:
                    c["spec"] = result_spec
                if result.caption:
                    c["caption"] = result.caption
                # Replace the awaiting marker; keep the rest of the notes.
                new_notes = c.get("notes", "").replace(
                    AWAITING_MARKER, f"[backfilled {ct} via spec specialist]"
                )
                c["notes"] = new_notes
                n_ok += 1
            except suppressed_mint_error as e:
                n_skip += 1
                print(f"  [{k + 1}/{len(todo_idx)}] {c.get('id')} suppressed: {str(e)[:80]}")
            except Exception as e:
                n_fail += 1
                print(
                    f"  [{k + 1}/{len(todo_idx)}] {c.get('id')} FAIL: {str(e)[:120]}",
                    file=sys.stderr,
                )

            # Atomic save every BATCH_SAVE so a crash doesn't lose work.
            if (k + 1) - last_save_at >= BATCH_SAVE:
                atomic_write_json(cells_json, data)
                last_save_at = k + 1
                elapsed = time.time() - start
                rate = (k + 1) / max(elapsed, 0.1)
                print(
                    f"  [{k + 1}/{len(todo_idx)}] saved · ok={n_ok} skip={n_skip} fail={n_fail} · {rate:.1f}/s"
                )

        # Final save.
        atomic_write_json(cells_json, data)
        elapsed = time.time() - start
        print(f"[backfill-specs] done: ok={n_ok} skip={n_skip} fail={n_fail} · {elapsed:.1f}s")
    return 0 if n_fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
