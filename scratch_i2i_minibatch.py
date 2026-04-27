"""i2i mini-batch test across failure modes from learnings.md appendix.

cell-0023 already established: i2i fixes missed-detail (geometry case)
that prompt-text alone could not. This mini-batch tests whether the
result generalizes:

  - cell-0010 (literal-simile, metaphor): does i2i remove the literal
    COSTCO sign, or does the wrong-interpretation base anchor the model
    harder on the literal reading? This is the highest-leverage test.
  - cell-0014 (literal-simile, color-as-object): does i2i fix the
    skeletal-stalk reading of "bone-white corn"?
  - cell-0005 (wrong-genre, meta-commentary): can i2i shift genre at
    all when the base is a concrete cottage scene?
  - cell-0022 (missed-detail, named props): does i2i add the missing
    Singer machines + 1989 calendar that prompt-text alone missed?

Cost: ~$0.24 (4 i2i × $0.04 + 4 eval × $0.02). Outputs to
cells/cell-XXXX.i2i_test.png; does NOT modify cells.json.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

import nano_banana
import evaluator


@dataclass
class Case:
    cell_id: str
    mode: str
    brief: str


CASES: list[Case] = [
    Case(
        cell_id="cell-0010",
        mode="literal-simile (metaphor)",
        brief=(
            "Edit this image to REMOVE the literal 'COSTCO' sign and any "
            "Costco branding. The phrase 'part Lourdes and part Costco' was "
            "a metaphor about the combination of pilgrimage and bulk "
            "commerce — not a literal Costco store. Replace the COSTCO "
            "signage with regular Mexican border-town signage (FARMACIA, "
            "CLINICA DENTAL, ÓPTICA, panaderia). Keep the streetscape, the "
            "dry air, palm trees, snowbird tourists, fountain — but no "
            "actual Costco branding anywhere."
        ),
    ),
    Case(
        cell_id="cell-0014",
        mode="literal-simile (color-as-object)",
        brief=(
            "Edit this image: the corn must be LIVING and healthy. 'Bone-"
            "white corn' refers to the KERNEL COLOR of a heritage variety, "
            "not skeletal stalks. Show robust mature corn plants with green "
            "stalks and leaves, with bone-white kernels visible inside open "
            "husks. Add visible bean vines climbing the corn stalks "
            "(intercrop). Keep the terraced highland setting, the figure, "
            "the village in the background."
        ),
    ),
    Case(
        cell_id="cell-0005",
        mode="wrong-genre (meta-commentary)",
        brief=(
            "Edit this image so it does NOT depict a literal pensioner "
            "scene. The trigger snippet is meta-commentary about an essay's "
            "rhetoric — 'the Margaret moment is the essay's emotional "
            "center' — not a description of a person to render. Replace "
            "this concrete scene with something more abstract and "
            "typographic: a partial book page, an essay's text in profile, "
            "or a diagrammatic gesture toward 'the emotional center of an "
            "argument.' No people, no garden, no tea, no cottage."
        ),
    ),
    Case(
        cell_id="cell-0022",
        mode="missed-detail (named props)",
        brief=(
            "Edit this image to ADD: (1) rows of forgotten Singer sewing "
            "machines on the long tables — black cast-iron treadle-style "
            "machines with gold 'SINGER' lettering, covered in heavy dust; "
            "(2) a 1989 calendar hanging on the wall near the foreman's "
            "desk visible in the background. Keep the atmospheric "
            "lighting through broken windows, the dusty floor, the "
            "industrial scale of the abandoned mill — just add the named "
            "props that should already be there."
        ),
    ),
]


def main() -> None:
    repo = Path(__file__).parent
    cells_data = json.loads((repo / "cells.json").read_text())

    results = []
    for case in CASES:
        src = repo / "cells" / f"{case.cell_id}.png"
        out = repo / "cells" / f"{case.cell_id}.i2i_test.png"
        if not src.exists():
            print(f"SKIP {case.cell_id}: missing {src}", file=sys.stderr)
            continue

        cell = next(c for c in cells_data["cells"] if c["id"] == case.cell_id)
        snippet = cell["trigger_snippet"]

        print(f"=== {case.cell_id} ({case.mode}) ===")
        print(f"  brief: {case.brief[:100]}...")
        print(f"  generating...", end=" ", flush=True)
        try:
            gen = nano_banana.transform_image(
                input_image=src,
                prompt=case.brief,
                out_path=out,
                temperature=0.4,
            )
            print(f"wrote {gen.bytes_written} bytes → {out.name}")
        except nano_banana.NanoBananaError as e:
            print(f"FAILED: {e}")
            results.append((case, None, None))
            continue

        print(f"  evaluating...", end=" ", flush=True)
        try:
            ev = evaluator.evaluate_image_cell(
                snippet=snippet, image_path=out,
            )
            print(f"score={ev.quality_score:.2f}  retrigger={ev.should_retrigger}")
            print(f"  worked:  {ev.what_worked[:140]}")
            print(f"  didnt:   {ev.what_didnt_work[:140]}")
            results.append((case, gen, ev))
        except Exception as e:
            print(f"EVAL FAILED: {e}")
            results.append((case, gen, None))
        print()

    print("=== summary ===")
    for case, gen, ev in results:
        score = f"{ev.quality_score:.2f}" if ev else "n/a"
        retrig = ev.should_retrigger if ev else "n/a"
        print(f"  {case.cell_id} ({case.mode}): score={score} retrigger={retrig}")


if __name__ == "__main__":
    main()
