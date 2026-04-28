"""One-shot append of two hand-authored scene3d demo cells.

These are the iron-man-inspired 3D cells the user asked for — a substrate
orrery (one wireframe per supported cell type, orbiting a central
icosahedron) and a kill-criteria sentinel (three nested tori). Snippets
draw from this session's synthesis so the cells read as real lucida
cells, not fixtures.

After this run, the eventual generate_scene3d_spec specialist should be
able to produce specs of similar shape from arbitrary snippets.

Usage:
  python scratch_scene3d_demo.py            # dry-run, prints planned cells
  python scratch_scene3d_demo.py --commit   # append to cells.json
"""
from __future__ import annotations

import argparse
import datetime
import json
import math
from pathlib import Path

REPO = Path(__file__).parent
CELLS_JSON = REPO / "cells.json"


def next_id(cells: list[dict]) -> str:
    max_n = 0
    for c in cells:
        cid = c.get("id") or ""
        if not cid.startswith("cell-"):
            continue
        try:
            n = int(cid.split("-", 1)[1])
        except ValueError:
            continue
        max_n = max(max_n, n)
    return f"cell-{max_n + 1:04d}"


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()


def substrate_orrery_spec() -> dict:
    """Central icosahedron + 7 substrate-typed wireframes orbiting on the equator."""
    substrates = [
        ("vega",         "torus",            0.42, "$stroke1"),
        ("mermaid",      "wireframe_cube",   0.38, "$stroke2"),
        ("html",         "wireframe_cube",   0.32, "$stroke3"),
        ("animated_svg", "wireframe_sphere", 0.40, "$stroke1"),
        ("scene3d",      "icosahedron",      0.45, "$accent"),
        ("aframe",       "wireframe_sphere", 0.42, "$stroke2"),
        ("lottie",       "torus",            0.36, "$stroke3"),
    ]
    objects: list[dict] = [
        {
            "kind": "icosahedron",
            "size": 0.85,
            "color": "$accent",
            "position": [0, 0, 0],
            "rotation_speed": [0.0, 0.003, 0.0],
        },
        {
            "kind": "particle_cloud",
            "size": 1.0,
            "color": "$muted",
            "count": 220,
            "spread": 5.5,
        },
    ]
    radius = 2.5
    for i, (_substrate, kind, size, color) in enumerate(substrates):
        theta = (2 * math.pi) * i / len(substrates)
        objects.append({
            "kind": kind,
            "size": size,
            "color": color,
            "position": [round(radius * math.cos(theta), 3), 0, round(radius * math.sin(theta), 3)],
            "rotation_speed": [
                round(0.005 + 0.002 * (i % 3), 4),
                round(0.008 - 0.001 * i, 4),
                round(0.003 * ((i % 2) - 0.5), 4),
            ],
        })
    return {
        "background": "transparent",
        "camera_distance": 6.5,
        "objects": objects,
    }


def kill_sentinel_spec() -> dict:
    """Three nested tori, one per kill criterion, rotating on different axes."""
    return {
        "background": "transparent",
        "camera_distance": 5,
        "objects": [
            {
                "kind": "torus",
                "size": 1.9,
                "color": "$stroke1",
                "rotation_speed": [0.001, 0.0045, 0.0],
            },
            {
                "kind": "torus",
                "size": 1.35,
                "color": "$stroke2",
                "rotation_speed": [0.005, 0.0, 0.0035],
            },
            {
                "kind": "torus",
                "size": 0.85,
                "color": "$stroke3",
                "rotation_speed": [0.0, 0.0, 0.012],
            },
            {
                "kind": "particle_cloud",
                "size": 1.0,
                "color": "$muted",
                "count": 150,
                "spread": 4.0,
            },
            {
                "kind": "axis_helper",
                "size": 0.4,
                "color": "$accent",
            },
        ],
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--commit", action="store_true",
                   help="write to cells.json (default: dry-run)")
    args = p.parse_args()

    data = json.loads(CELLS_JSON.read_text())
    cells = data["cells"]

    cell_a_id = next_id(cells)
    cell_a = {
        "id": cell_a_id,
        "timestamp": now_iso(),
        "cell_type": "scene3d",
        "trigger_snippet": (
            "Lucida's cell zoo: vega-lite, mermaid, animated_svg, scene3d, aframe, "
            "lottie — heterogeneous cells accreting around the orchestrator. The "
            "unfilled gap competitive sweep identified: passive listener minting "
            "heterogeneous cells from conversation, where Cursor Canvas is "
            "intentional/skill-driven and Claude Artifacts is replaceable."
        ),
        "prompt": "(hand-authored scene3d demo — substrate orrery)",
        "caption": (
            "Substrate orrery — central icosahedron is the orchestrator/classifier; "
            "seven wireframes orbit the equator, one per supported cell type "
            "(vega/mermaid/html/animated_svg/scene3d/aframe/lottie). Particle "
            "cloud as ambient backdrop. Theme-aware via $tokens."
        ),
        "spec": substrate_orrery_spec(),
        "notes": "(hand-authored demo for iron-man-3D ceiling) [scene3d-demo 2026-04-27]",
        "classifier_reasoning": "(no classifier; hand-authored)",
        "discourse_move": "structural",
        "confidence": None,
        "image_path": None,
        "html": None,
        "attempted_cell_type": None,
        "attempted_spec": None,
        "reflection_source_ids": [],
        "replaces": None,
        "replaced_by": None,
        "retrigger_count": 0,
        "retrigger_reason": None,
    }

    cells.append(cell_a)
    cell_b_id = next_id(cells)
    cell_b = {
        "id": cell_b_id,
        "timestamp": now_iso(),
        "cell_type": "scene3d",
        "trigger_snippet": (
            "Three kill criteria orbit lucida's release path: aesthetic (image "
            "quality, kill #1), mis-routing (classifier accuracy, kill #2), "
            "hallucination (substrate fidelity, kill #3). Each gates "
            "independently. Sentinel rotates each axis at a different rate so "
            "the eye reads them as separate dimensions."
        ),
        "prompt": "(hand-authored scene3d demo — kill-criteria sentinel)",
        "caption": (
            "Kill-criteria sentinel — three nested tori, one per criterion, "
            "rotating on different axes. Outermost ($stroke1) = aesthetic; "
            "middle ($stroke2) = mis-routing; innermost ($stroke3) = "
            "hallucination. Axis helper at center marks the orchestrator's "
            "frame of reference."
        ),
        "spec": kill_sentinel_spec(),
        "notes": "(hand-authored demo for iron-man-3D ceiling) [scene3d-demo 2026-04-27]",
        "classifier_reasoning": "(no classifier; hand-authored)",
        "discourse_move": "structural",
        "confidence": None,
        "image_path": None,
        "html": None,
        "attempted_cell_type": None,
        "attempted_spec": None,
        "reflection_source_ids": [],
        "replaces": None,
        "replaced_by": None,
        "retrigger_count": 0,
        "retrigger_reason": None,
    }
    cells.append(cell_b)

    print(f"would add {cell_a['id']} (substrate orrery)")
    print(f"would add {cell_b['id']} (kill sentinel)")

    if not args.commit:
        print("\n# DRY RUN — pass --commit to write changes")
        return

    CELLS_JSON.write_text(json.dumps(data, indent=2) + "\n")

    # Append to mint_log so the recall hook + HUD see them.
    from orchestrator import _log_mints
    _log_mints([cell_a, cell_b])

    print(f"\n# wrote {CELLS_JSON}")


if __name__ == "__main__":
    main()
