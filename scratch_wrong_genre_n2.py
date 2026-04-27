"""Test whether wrong-genre is durable beyond cell-0005 (N=1).

Slimemold has flagged the wrong-genre claim as carrying weight on
N=1 evidence. This script does a single fresh text-to-image generation
on a structurally-analogous meta-commentary snippet (pure rhetoric
about an essay, zero scene description) and evaluates it with the
new failure_mode-aware evaluator.

Expected: failure_mode=wrong_genre, score in 0.1-0.3 range. Either
result is informative — confirmation anchors wrong-genre as a real
recurring mode; non-confirmation suggests the mode is too narrow or
cell-0005 was an idiosyncratic case.

Cost: ~$0.06 (1 fresh gen + 1 eval). Output to
cells/wrong_genre_n2_test.png; does NOT modify cells.json.
"""
from __future__ import annotations

from pathlib import Path

import nano_banana
import evaluator


# Authored meta-commentary snippet — structurally analogous to cell-0005's
# "the Margaret moment is the essay's emotional center" but using a
# different rhetorical move (assembly-from-fragments rather than
# culminating-detail) so we're not re-testing the same exact pattern.
SNIPPET = (
    "What makes this argument hold up isn't the data, but the way the "
    "author lets the reader assemble it from fragments. The reader's "
    "act of completing the picture is the essay's actual claim — not "
    "the picture itself."
)

# Use the v0 image-prompt template (closest to what the orchestrator
# would do for a fresh image cell where the specialist hadn't shaped
# anything specific). This is meant to be a clean wrong-genre test,
# not a heavily-templated success case.
PROMPT = (
    f"Conceptual scene illustrating: {SNIPPET}\n\n"
    f"Style: warm, restrained, low-saturation, painterly. No text, no "
    f"captions in the image."
)


def main() -> None:
    repo = Path(__file__).parent
    out = repo / "cells" / "wrong_genre_n2_test.png"

    print(f"snippet:  {SNIPPET[:80]}...")
    print(f"output:   {out}")
    print()
    print("generating (text-to-image)...", end=" ", flush=True)
    gen = nano_banana.generate(PROMPT, out)
    print(f"wrote {gen.bytes_written} bytes")
    print()
    print("evaluating with failure_mode-aware prompt...")
    ev = evaluator.evaluate_image_cell(snippet=SNIPPET, image_path=out)
    print(f"  quality_score:    {ev.quality_score:.2f}")
    print(f"  failure_mode:     {ev.failure_mode}")
    print(f"  should_retrigger: {ev.should_retrigger}")
    print(f"  what_worked:      {ev.what_worked[:200]}")
    print(f"  what_didnt_work:  {ev.what_didnt_work[:200]}")
    print()
    print(f"reference: cell-0005 (Margaret moment) → score 0.15, "
          f"failure_mode=wrong_genre (after i2i)")
    print(f"this attempt:                              "
          f"score {ev.quality_score:.2f}, failure_mode={ev.failure_mode}")


if __name__ == "__main__":
    main()
