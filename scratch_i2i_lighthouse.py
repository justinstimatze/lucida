"""Test the load-bearing hypothesis from learnings.md → "Appendix:
anchoring the Gemini compromises claim":

  Corrective prompt text alone does not reliably break a strong visual
  prior (lighthouse chain 0023→0024→0025: three eval@0.82 attempts,
  ~equal-width bands every time). The implied design lever is
  image-to-image edit — does feeding the previous PNG back to Gemini
  alongside a corrective brief get the unequal-width bands to land?

This script tests that on cell-0023 specifically. One i2i call
(transform_image of cell-0023.png + a manually-authored corrective
brief targeting the named compromise), then one evaluator call against
the same snippet, then before/after score comparison.

Cost: ~$0.06 (one $0.04 i2i + one $0.02 eval). Outputs go to
cells/cell-0023.i2i_test.png so the on-disk file doesn't collide with
the existing chain. Does NOT modify cells.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nano_banana
import evaluator


# Manually-authored corrective brief — what the eval *should* have
# produced as retrigger_guidance for cell-0023, had it not hit the
# empty-guidance bug. Targets the named compromise from the snippet:
# "alternating bands of unequal width."
CORRECTIVE_BRIEF = (
    "Edit this image: the red-and-white bands of the lighthouse tower "
    "must be clearly UNEQUAL in width. Each band should visibly differ "
    "in height from its neighbors — some narrow, some wider, an "
    "irregular striping pattern that distinguishes this lighthouse "
    "from any other. Do not produce evenly-spaced candy-stripe bands. "
    "Keep everything else (cliff geometry, Atlantic surf, overcast "
    "mood, muted palette) unchanged."
)


def main() -> None:
    repo = Path(__file__).parent
    src = repo / "cells" / "cell-0023.png"
    out = repo / "cells" / "cell-0023.i2i_test.png"
    if not src.exists():
        print(f"missing source: {src}", file=sys.stderr)
        sys.exit(1)

    cells = json.loads((repo / "cells.json").read_text())
    c23 = next(c for c in cells["cells"] if c["id"] == "cell-0023")
    snippet = c23["trigger_snippet"]

    print(f"input:  {src}")
    print(f"output: {out}")
    print(f"brief:  {CORRECTIVE_BRIEF[:80]}...")
    print()
    print("running transform_image...")
    result = nano_banana.transform_image(
        input_image=src,
        prompt=CORRECTIVE_BRIEF,
        out_path=out,
        temperature=0.4,  # tighter adherence to the corrective brief
    )
    print(f"  wrote {result.bytes_written} bytes via {result.model}")
    print()
    print("evaluating against original snippet...")
    eval_result = evaluator.evaluate_image_cell(
        snippet=snippet,
        image_path=out,
    )
    print(f"  quality_score:    {eval_result.quality_score:.2f}")
    print(f"  what_worked:      {eval_result.what_worked[:200]}")
    print(f"  what_didnt_work:  {eval_result.what_didnt_work[:200]}")
    print(f"  should_retrigger: {eval_result.should_retrigger}")
    print()
    print(f"reference: cell-0023/0024/0025 each scored 0.82 in the chain.")
    print(f"i2i this attempt scored: {eval_result.quality_score:.2f}")


if __name__ == "__main__":
    main()
