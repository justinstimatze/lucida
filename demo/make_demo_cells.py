#!/usr/bin/env python3
"""Generate demo cells for the lucida recording.

Calls each specialist with a carefully crafted snippet designed to trigger
a specific substrate type. Saves the resulting cells to demo/demo_cells.json
for use with demo/replay.py.

Run once before recording (costs ~$0.20 in API tokens, ~2 min):

    cd ~/Documents/lucida
    python demo/make_demo_cells.py

Options:
    --out PATH      output path (default: demo/demo_cells.json)
    --session ID    session_id tag (default: lucida-demo)
    --no-scene3d    skip scene3d cell (slower / more variable quality)
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from specialists import (  # noqa: E402
    SpecialistResult,
    generate_animated_svg_spec,
    generate_html_spec,
    generate_mermaid_spec,
    generate_scene3d_spec,
    generate_sparkline_spec,
    generate_treemap_spec,
    generate_vega_spec,
)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass
class Seed:
    cell_type: str
    title: str
    snippet: str
    context: str = ""
    subtype_hint: str = ""   # mermaid only
    layout_hint: str = ""    # html only


SEEDS: list[Seed] = [
    Seed(
        cell_type="mermaid",
        title="Recommendation Pipeline",
        subtype_hint="flowchart TD",
        snippet=(
            "The real-time recommendation pipeline flows through five stages: "
            "the Ingestion Service receives raw clickstream events and writes them "
            "to the Event Queue; the Feature Extractor consumes the queue and updates "
            "the Feature Store with derived user-item signals; the Embedding Service "
            "reads from the Feature Store and writes 128-dimension vectors to the "
            "Vector Index; the Ranking Model queries both the Feature Store and Vector "
            "Index, scores candidates, and writes ranked results to the Result Cache; "
            "the API Gateway reads from the Result Cache and returns responses to clients."
        ),
        context="System architecture overview for a real-time recommendation engine.",
    ),
    Seed(
        cell_type="vega",
        title="Caching Layer Latency",
        snippet=(
            "Benchmark results for p50 request latency across four caching "
            "configurations: no caching 340ms, feature cache only 210ms, "
            "result cache only 85ms, both caches enabled 42ms."
        ),
        context="Latency benchmark comparing caching strategies.",
    ),
    Seed(
        cell_type="animated_svg",
        title="Cache Invalidation Cycle",
        snippet=(
            "Cache invalidation runs as a continuous loop: a new catalog item enters "
            "the Ingestion Service, propagates to the Feature Extractor (~40ms), "
            "reaches the Embedding Service which computes its vector (~180ms), the new "
            "vector triggers a Vector Index update, the index update signals affected "
            "Result Cache keys, those keys are evicted, and the next user request for "
            "a result involving the new item triggers a fresh Ranking pass and "
            "repopulates the cache — completing the loop back to the serving path."
        ),
        context="Cache invalidation process for new catalog items.",
    ),
    Seed(
        cell_type="html",
        title="Cold-Start Strategy Tradeoffs",
        layout_hint="table",
        snippet=(
            "Comparing four cold-start strategies: "
            "content-based filtering — precision@10=0.31, cold-start latency<20ms, "
            "infra cost=low, requires item metadata; "
            "collaborative filtering — precision@10=0.67, first-request latency>400ms, "
            "infra cost=medium, requires interaction history; "
            "hybrid (content + collaborative) — precision@10=0.61, latency=50ms, "
            "infra cost=high, requires both metadata and history; "
            "trending-based — precision@10=0.18, latency<5ms, "
            "infra cost=minimal, requires no per-user state."
        ),
        context="Pre-launch decision: which cold-start strategy to ship with.",
    ),
    Seed(
        cell_type="treemap",
        title="Daily Request Distribution",
        snippet=(
            "Of 100,000 daily API calls to the recommendation service: "
            "homepage feed 42,000 requests, "
            "item detail pages 28,000, "
            "search result augmentation 16,000, "
            "autocomplete suggestions 9,000, "
            "email digest generation 3,500, "
            "push notification click-through 1,500."
        ),
        context="Traffic breakdown by entry point for capacity planning.",
    ),
    Seed(
        cell_type="sparkline",
        title="Model Validation Loss",
        snippet=(
            "Validation loss over 12 training epochs: "
            "0.831, 0.712, 0.634, 0.571, 0.518, 0.472, "
            "0.438, 0.411, 0.393, 0.381, 0.376, 0.373 — "
            "sharply decaying through epoch 6 then plateauing, "
            "indicating convergence around epoch 8."
        ),
        context="Ranking model training run — deciding whether to adjust schedule.",
    ),
    Seed(
        cell_type="vega",
        title="A/B Test: CTR Over 14 Days",
        snippet=(
            "A/B test measuring click-through rate over 14 days: "
            "control group held at 3.2% throughout. "
            "Treatment group (hybrid cold-start) started at 2.9% day 1, "
            "crossed the control line on day 4 at 3.3%, "
            "and reached 4.1% by day 14. "
            "The +0.9pp delta reached statistical significance (p=0.003) by day 11."
        ),
        context="Ship/no-ship decision for hybrid cold-start strategy.",
    ),
    Seed(
        cell_type="scene3d",
        title="User Embedding Space",
        snippet=(
            "The user embedding space shows three spatially separated clusters "
            "when projected to 3D: heavy content consumers cluster in the "
            "positive-X/positive-Y region around (0.8, 0.3, 0.1); casual browsers "
            "fill the central region near the origin (0.05, -0.1, 0.0); "
            "deal-seekers concentrate in the negative-Z quadrant at (-0.2, 0.1, -0.9). "
            "The clusters are linearly separable at depth, confirming the embedding "
            "geometry is semantically meaningful."
        ),
        context="Embedding space analysis to inform personalization strategy.",
    ),
]


def call_specialist(seed: Seed) -> SpecialistResult:
    if seed.cell_type == "mermaid":
        return generate_mermaid_spec(seed.snippet, seed.context, subtype_hint=seed.subtype_hint)
    elif seed.cell_type == "vega":
        return generate_vega_spec(seed.snippet, seed.context)
    elif seed.cell_type == "animated_svg":
        return generate_animated_svg_spec(seed.snippet, seed.context)
    elif seed.cell_type == "html":
        return generate_html_spec(seed.snippet, seed.context, layout_hint=seed.layout_hint)
    elif seed.cell_type == "treemap":
        return generate_treemap_spec(seed.snippet, seed.context)
    elif seed.cell_type == "sparkline":
        return generate_sparkline_spec(seed.snippet, seed.context)
    elif seed.cell_type == "scene3d":
        return generate_scene3d_spec(seed.snippet, seed.context)
    else:
        raise ValueError(f"unknown cell_type: {seed.cell_type}")


def build_cell(seed: Seed, result: SpecialistResult, idx: int, session_id: str) -> dict:
    cell_id = f"demo-{idx:04d}"
    is_html = seed.cell_type == "html"
    return {
        "id": cell_id,
        "timestamp": _now(),
        "cell_type": seed.cell_type,
        "trigger_snippet": seed.snippet.strip(),
        "prompt": "",
        "image_path": None,
        "spec": None if is_html else result.spec,
        "html": result.spec if is_html else None,
        "caption": result.caption,
        "notes": f"demo cell — {seed.cell_type} specialist [{result.model}]",
        "attempted_cell_type": None,
        "attempted_spec": None,
        "discourse_move": _discourse_move(seed.cell_type),
        "confidence": 0.92,
        "classifier_reasoning": "demo cell — seed snippet is substrate-targeted",
        "title": seed.title,
        "mermaid_subtype": seed.subtype_hint if seed.cell_type == "mermaid" else None,
        "html_layout": seed.layout_hint if seed.cell_type == "html" else None,
        "reflection_source_ids": None,
        "replaces": None,
        "replaced_by": None,
        "retrigger_count": 0,
        "retrigger_reason": None,
        "session_id": session_id,
    }


def _discourse_move(cell_type: str) -> str:
    return {
        "mermaid": "structural",
        "vega": "quantitative",
        "animated_svg": "temporal",
        "html": "comparative",
        "treemap": "quantitative",
        "sparkline": "quantitative",
        "scene3d": "structural",
    }.get(cell_type, "structural")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, default=Path(__file__).parent / "demo_cells.json")
    p.add_argument("--session", default="lucida-demo")
    p.add_argument("--no-scene3d", action="store_true", help="skip scene3d (can be slow/variable)")
    args = p.parse_args()

    seeds = [s for s in SEEDS if not (args.no_scene3d and s.cell_type == "scene3d")]
    cells = []
    total_in = total_out = 0

    print(f"Generating {len(seeds)} demo cells → {args.out}")
    for i, seed in enumerate(seeds, 1):
        print(f"  [{i}/{len(seeds)}] {seed.cell_type:14s} — {seed.title} ...", end=" ", flush=True)
        try:
            result = call_specialist(seed)
        except Exception as e:
            print(f"FAILED: {e}")
            continue

        if result.should_demote_to_text:
            print(f"demoted ({result.demotion_reason[:60]})")
            continue

        total_in += result.input_tokens
        total_out += result.output_tokens
        cell = build_cell(seed, result, i, args.session)
        cells.append(cell)

        cache_note = (
            f"cache_hit={result.cache_read_tokens}t" if result.cache_read_tokens
            else f"cache_wrote={result.cache_creation_tokens}t"
        )
        print(f"ok ({cache_note}  in={result.input_tokens} out={result.output_tokens})")

    data = {"session_id": args.session, "cells": cells}
    args.out.write_text(json.dumps(data, indent=2) + "\n")
    approx_cost = (total_in * 3 + total_out * 15) / 1_000_000
    print(f"\n{len(cells)} cells saved to {args.out}")
    print(f"tokens: {total_in:,} in / {total_out:,} out  (~${approx_cost:.3f})")


if __name__ == "__main__":
    main()
