"""One-shot remediation test on the 4 image cells flagged by audit_2026-04-27.

For each cell: re-evaluate to get fresh failure_mode + guidance, route to
i2i edit (missed_detail, literal_simile_color) or fresh generate
(literal_simile_metaphor, wrong_genre), generate new image to /tmp, then
re-evaluate. Prints per-cell delta and summary.

Does NOT modify cells.json — this is a measurement run. If results look
good, the next move is to build the proper `--retrigger CELL_ID` CLI that
writes new cells with replaces/replaced_by chains.

Cost: 4 × (eval + image_gen + eval) ≈ $0.32.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nano_banana
from evaluator import EvaluatorError, evaluate_image_cell


REPO = Path(__file__).parent
CELLS_JSON = REPO / "cells.json"
OUT_DIR = Path("/tmp/lucida_retest")
OUT_DIR.mkdir(exist_ok=True)

I2I_MODES = {"missed_detail", "literal_simile_color"}
TARGETS = ["cell-0010", "cell-0014", "cell-0022", "cell-0025"]


def load_cell(cell_id: str) -> dict:
    data = json.loads(CELLS_JSON.read_text())
    for c in data["cells"]:
        if c["id"] == cell_id:
            return c
    raise KeyError(cell_id)


def base_prompt(cell: dict) -> str:
    """Strip prior corrective sections from prompt, matching orchestrator behavior."""
    p = cell.get("prompt", "") or ""
    p = p.split("\n\nCORRECTIVE GUIDANCE FROM PREVIOUS ATTEMPT")[0]
    p = p.split("\n\n(")[0]
    return p


def retest_cell(cell_id: str) -> dict:
    cell = load_cell(cell_id)
    snippet = cell.get("trigger_snippet", "") or ""
    image_path = REPO / (cell.get("image_path") or "")

    print(f"\n--- {cell_id} ---", file=sys.stderr)
    print(f"snippet head: {snippet[:80]}...", file=sys.stderr)

    try:
        before = evaluate_image_cell(snippet, image_path)
    except EvaluatorError as e:
        return {"id": cell_id, "status": "before_eval_failed", "error": str(e)}

    print(f"before: score={before.quality_score:.2f} mode={before.failure_mode}", file=sys.stderr)
    print(f"        guidance: {before.retrigger_guidance[:120]}", file=sys.stderr)

    use_i2i = before.failure_mode in I2I_MODES
    new_path = OUT_DIR / f"{cell_id}_retest.png"

    try:
        if use_i2i:
            route = "i2i"
            edit_prompt = (
                f"(i2i edit; failure_mode={before.failure_mode})\n\n"
                f"{before.retrigger_guidance}"
            )
            print(f"route: i2i edit ({before.failure_mode})", file=sys.stderr)
            nano_banana.transform_image(image_path, edit_prompt, new_path)
        else:
            route = "fresh"
            enhanced = (
                f"{base_prompt(cell)}\n\n"
                f"CORRECTIVE GUIDANCE FROM PREVIOUS ATTEMPT:\n"
                f"{before.retrigger_guidance}"
            )
            print(f"route: fresh generate ({before.failure_mode})", file=sys.stderr)
            nano_banana.generate(enhanced, new_path)
    except Exception as e:
        return {
            "id": cell_id, "status": "gen_failed", "error": str(e),
            "before_score": before.quality_score, "before_mode": before.failure_mode,
        }

    if not new_path.exists():
        return {
            "id": cell_id, "status": "no_image_written",
            "before_score": before.quality_score, "before_mode": before.failure_mode,
        }

    try:
        after = evaluate_image_cell(snippet, new_path)
    except EvaluatorError as e:
        return {
            "id": cell_id, "status": "after_eval_failed", "error": str(e),
            "before_score": before.quality_score, "before_mode": before.failure_mode,
            "new_path": str(new_path),
        }

    delta = after.quality_score - before.quality_score
    print(f"after:  score={after.quality_score:.2f} mode={after.failure_mode} (Δ={delta:+.2f})", file=sys.stderr)
    return {
        "id": cell_id, "status": "ok",
        "route": route,
        "before_score": before.quality_score, "before_mode": before.failure_mode,
        "after_score": after.quality_score, "after_mode": after.failure_mode,
        "delta": delta,
        "new_path": str(new_path),
        "before_what_didnt_work": before.what_didnt_work,
        "after_what_didnt_work": after.what_didnt_work,
        "guidance_used": before.retrigger_guidance,
    }


def main() -> None:
    results = [retest_cell(cid) for cid in TARGETS]

    print("\n" + "=" * 60, file=sys.stderr)
    print("SUMMARY", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    print(f"\n{'cell':<12} {'route':<6} {'before':>7} {'after':>7} {'Δ':>7} {'mode_after':<25}")
    print("-" * 70)
    ok = [r for r in results if r["status"] == "ok"]
    for r in results:
        if r["status"] == "ok":
            print(f"{r['id']:<12} {r['route']:<6} {r['before_score']:>7.2f} {r['after_score']:>7.2f} {r['delta']:>+7.2f} {r['after_mode']:<25}")
        else:
            print(f"{r['id']:<12} ERROR: {r['status']}")

    if ok:
        before_mean = sum(r["before_score"] for r in ok) / len(ok)
        after_mean = sum(r["after_score"] for r in ok) / len(ok)
        before_failing = sum(1 for r in ok if r["before_score"] < 0.7)
        after_failing = sum(1 for r in ok if r["after_score"] < 0.7)
        print(f"\nmean score: {before_mean:.2f} → {after_mean:.2f} (Δ={after_mean - before_mean:+.2f})")
        print(f"failing (score<0.7): {before_failing}/{len(ok)} → {after_failing}/{len(ok)}")

    out = OUT_DIR / "retest_results.json"
    out.write_text(json.dumps(results, indent=2))
    print(f"\nfull results: {out}")


if __name__ == "__main__":
    main()
