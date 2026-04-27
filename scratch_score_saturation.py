"""Score-saturation probe: does the new failure_mode-aware evaluator
prompt actually narrow scores out of the 0.82 cluster, or does the
rubric saturate there regardless of language?

Picks 5 image cells:
  - 3 cells that scored 0.82 under the old prompt (in cells.json notes):
    cell-0022, cell-0023, cell-0024 (Singer machines + lighthouse chain)
  - 2 known-bad cases not previously logged:
    cell-0010 (COSTCO sign — literal_simile_metaphor)
    cell-0014 (bone-white corn — literal_simile_color)

Re-evaluates each with the current evaluator (which has the
band-decision rules + failure_mode taxonomy added this session) and
reports new score + failure_mode + retrigger flag.

Hypothesis: the new prompt should pull cells with clearly-named flaws
DOWN into the 0.5-0.7 band. If 0.82s stay at 0.82, the rubric is
saturating regardless of language and we need a different intervention
(narrower bands, structured rubric, or an "what's specifically wrong"
forcing function).

Cost: ~$0.10 (5 × ~$0.02 each). Read-only against cells.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import evaluator


CELL_IDS = ["cell-0022", "cell-0023", "cell-0024", "cell-0010", "cell-0014"]


def main() -> None:
    repo = Path(__file__).parent
    cells_data = json.loads((repo / "cells.json").read_text())
    by_id = {c["id"]: c for c in cells_data["cells"]}

    rows = []
    for cid in CELL_IDS:
        c = by_id.get(cid)
        if not c:
            print(f"SKIP {cid}: not in cells.json")
            continue
        img = repo / c["image_path"]
        if not img.exists():
            print(f"SKIP {cid}: missing {img}")
            continue
        snippet = c["trigger_snippet"]
        prior = c.get("notes") or ""

        print(f"=== {cid} ===")
        print(f"  snippet: {snippet[:90]}...")
        print(f"  evaluating...", end=" ", flush=True)
        ev = evaluator.evaluate_image_cell(snippet=snippet, image_path=img)
        print(f"score={ev.quality_score:.2f}  mode={ev.failure_mode}  retrigger={ev.should_retrigger}")
        print(f"  worked: {ev.what_worked[:120]}")
        print(f"  didnt:  {ev.what_didnt_work[:120]}")
        rows.append((cid, ev.quality_score, ev.failure_mode, ev.should_retrigger, prior))
        print()

    print("=== summary ===")
    print(f"{'cell':<12} {'new':<6} {'mode':<26} {'retrig':<7} prior-notes-excerpt")
    for cid, score, mode, retrig, prior in rows:
        prior_excerpt = prior[:60].replace("\n", " ")
        print(f"{cid:<12} {score:<6.2f} {mode:<26} {str(retrig):<7} {prior_excerpt}")

    # Quick saturation check: did the 0.82 cluster move?
    moved = [r for r in rows if r[0] in {"cell-0022", "cell-0023", "cell-0024"}]
    if moved:
        print()
        print("saturation check (cells previously at 0.82):")
        for cid, score, mode, _, _ in moved:
            delta = score - 0.82
            arrow = "↓" if delta < -0.02 else "↑" if delta > 0.02 else "≈"
            print(f"  {cid}: 0.82 → {score:.2f} {arrow} (mode={mode})")


if __name__ == "__main__":
    main()
