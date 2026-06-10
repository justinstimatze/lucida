"""Reconstruct per-stage API spend from cells.json mint records.

cells.json doesn't store raw input/output token counts per mint, but each
cell's ``notes`` string records the cache counters per stage
(``classifier(...) cache:hit/Nt``, ``[<type>-specialist:cache:hit/Nt]``),
and the cell itself carries the actual generated output (spec/html). That
is enough to reconstruct the spend distribution:

  - cached prefix tokens: exact, from the recorded cache counters
  - uncached input tail:  estimated from trigger_snippet chars
  - output tokens:        estimated from the stored spec/html chars

Char->token ratios are calibrated against the free count_tokens endpoint
on a sample of real cells (pass --no-calibrate to use the 4.0/3.4 priors
offline). Estimates are labeled as such in the output.

Usage:
    python tools/spend_audit.py [--cells cells.json] [--no-calibrate]
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

# $/MTok input, output (Sonnet 4.6 / Haiku 4.5, 2026-06)
PRICES = {
    "sonnet": (3.00, 15.00),
    "haiku": (1.00, 5.00),
}
CACHE_READ_MULT = 0.10
CACHE_WRITE_MULT = 1.25

# Measured cacheable prefixes (tools+system, count_tokens, 2026-06-10).
# Used when a specialist call left no cache counter (cache:miss = prefix
# below the model's min cacheable size, so it was billed as plain input).
SPECIALIST_PREFIX = {
    "mermaid": 3122,
    "vega": 3252,
    "html": 3198,
    "animated_svg": 2704,
    "scene3d": 5486,
    "treemap": 1583,
    "sparkline": 1564,
    "gauge": 1884,
    "timeline_ribbon": 2082,
    "trajectory": 2567,
    "force_graph": 2460,
    "image": 2199,
}
CLASSIFIER_PREFIX = 11475  # used only for cache:miss classifier calls

# Matches the orchestrator's classifier marker without a lazy .*? gap (a
# gap can skip a classifier cache:miss and capture the SPECIALIST's
# counter instead, double-counting it). Bracket groups like [v0→text]
# are matched explicitly; cache:miss(prefix<min) is a real writer path
# (orchestrator.py ~:964).
CLASSIFIER_RE = re.compile(
    r"classifier\(([\w.-]+)\)→\S+@[\d.]+(?:\s+\[[^\]]*\])*\s+cache:(?:(hit|wrote)/(\d+)t|(miss))"
)
SPECIALIST_RE = re.compile(r"\[(\w+)-specialist:cache:(?:(hit|wrote)/(\d+)t|(miss))\]")

# Fields whose text is the specialist's generated output.
OUTPUT_FIELDS = ("spec", "html")


@dataclass
class StageTotals:
    calls: int = 0
    cache_read: int = 0  # tokens billed at 0.1x
    cache_write: int = 0  # tokens billed at 1.25x
    plain_in: int = 0  # tokens billed at 1x (uncached tail + missed prefixes)
    out: int = 0
    # Pricing family recorded in the notes (classifier records its model;
    # specialists don't, so they assume the sonnet default).
    model: str = "sonnet"

    def cost(self, model: str | None = None) -> float:
        in_rate, out_rate = PRICES[model or self.model]
        return (
            self.cache_read * CACHE_READ_MULT * in_rate
            + self.cache_write * CACHE_WRITE_MULT * in_rate
            + self.plain_in * in_rate
            + self.out * out_rate
        ) / 1e6


@dataclass
class Ratios:
    prose: float = 4.0  # chars per token, snippets/captions
    spec: float = 3.4  # chars per token, generated specs/html


def calibrate(cells: list[dict]) -> Ratios:
    """Calibrate chars/token on a sample of real cells (free endpoint)."""
    import anthropic

    client = anthropic.Anthropic()

    def ratio(samples: list[str], default: float) -> float:
        samples = [s for s in samples if len(s) > 400][:8]
        if not samples:
            return default
        chars = toks = 0
        for s in samples:
            chars += len(s)
            toks += client.messages.count_tokens(
                model="claude-sonnet-4-6",
                messages=[{"role": "user", "content": s}],
            ).input_tokens
        return chars / max(toks, 1)

    prose = ratio([c.get("trigger_snippet") or "" for c in cells], 4.0)
    spec = ratio([t for c in cells for t in _output_texts(c)], 3.4)
    return Ratios(prose=prose, spec=spec)


def _output_texts(cell: dict) -> list[str]:
    """The specialist-generated output texts of a cell (shared between
    calibration and audit so both measure the same text population)."""
    texts = []
    for f in OUTPUT_FIELDS:
        v = cell.get(f)
        if isinstance(v, str):
            texts.append(v)
        elif isinstance(v, dict):
            texts.append(json.dumps(v))
    return texts


def audit(cells: list[dict], r: Ratios) -> dict[str, StageTotals]:
    stages: dict[str, StageTotals] = defaultdict(StageTotals)

    for c in cells:
        notes = c.get("notes") or ""
        snippet_toks = int(len(c.get("trigger_snippet") or "") / r.prose)

        m = CLASSIFIER_RE.search(notes)
        if m:
            family = "haiku" if "haiku" in m.group(1) else "sonnet"
            st = stages[f"classifier({family})"]
            st.model = family
            st.calls += 1
            if m.group(4) == "miss":
                # prefix below the model's cache floor -> billed plain
                st.plain_in += CLASSIFIER_PREFIX
            elif m.group(2) == "hit":
                st.cache_read += int(m.group(3))
            else:
                st.cache_write += int(m.group(3))
            # uncached tail = snippet + wrapper; output = tool fields
            st.plain_in += snippet_toks + 40
            out_chars = len(c.get("classifier_reasoning") or "") + len(c.get("title") or "")
            st.out += int(out_chars / r.prose) + 60

        sm = SPECIALIST_RE.search(notes)
        out_toks = int(sum(len(t) for t in _output_texts(c)) / r.spec)

        if sm:
            stype = sm.group(1)
            st = stages[f"spec:{stype}"]
            st.calls += 1
            st.plain_in += snippet_toks + 60
            st.out += out_toks + 40
            if sm.group(4) == "miss":
                # prefix below cache floor -> billed as plain input
                st.plain_in += SPECIALIST_PREFIX.get(stype, 2000)
            elif sm.group(2) == "hit":
                st.cache_read += int(sm.group(3))
            else:
                st.cache_write += int(sm.group(3))
        elif "backfilled" in notes and out_toks:
            # backfill pass didn't record specialist cache counters; assume
            # cached prefix (it ran in a tight loop) + measured prefix size
            st = stages["spec:backfill(est)"]
            st.calls += 1
            st.cache_read += SPECIALIST_PREFIX.get(c.get("cell_type", ""), 3000)
            st.plain_in += snippet_toks + 60
            st.out += out_toks + 40

    return stages


def fmt_money(x: float) -> str:
    return f"${x:,.2f}"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cells", default=str(Path(__file__).parent.parent / "cells.json"))
    p.add_argument("--no-calibrate", action="store_true", help="skip count_tokens calibration")
    args = p.parse_args()

    data = json.loads(Path(args.cells).read_text())
    cells = data["cells"] if isinstance(data, dict) else data

    r = Ratios()
    if not args.no_calibrate:
        try:
            r = calibrate(cells)
        except Exception as e:  # offline fallback is fine
            print(f"(calibration skipped: {e}; using priors)")
    print(f"chars/token: prose={r.prose:.2f} spec={r.spec:.2f}  cells={len(cells)}\n")

    stages = audit(cells, r)
    total = sum(s.cost() for s in stages.values())
    if not total:
        print("no recorded spend found (no classifier/specialist markers in notes)")
        return

    hdr = f"{'stage':<20}{'calls':>6}{'cacheRd kt':>11}{'cacheWr kt':>11}{'plain kt':>10}{'out kt':>8}{'cost':>9}{'share':>7}"
    print(hdr)
    print("-" * len(hdr))
    for name, s in sorted(stages.items(), key=lambda kv: -kv[1].cost()):
        c = s.cost()
        print(
            f"{name:<20}{s.calls:>6}{s.cache_read / 1e3:>11.1f}{s.cache_write / 1e3:>11.1f}"
            f"{s.plain_in / 1e3:>10.1f}{s.out / 1e3:>8.1f}{fmt_money(c):>9}{c / total:>7.1%}"
        )
    print("-" * len(hdr))
    print(f"{'TOTAL (at each call recorded model)':<46}{fmt_money(total):>22}")

    # What-if scenarios -------------------------------------------------
    scalar = {"spec:sparkline", "spec:gauge", "spec:timeline_ribbon", "spec:trajectory"}

    def scenario(label: str, picker) -> None:
        cost = sum(s.cost(picker(name)) for name, s in stages.items())
        print(f"  {label:<52}{fmt_money(cost):>9}  ({cost / total - 1:+.0%})")

    print("\nwhat-if (same call pattern, different model defaults):")
    scenario(
        "A: classifier -> haiku (rejected on quality 2026-06-10)",
        lambda n: "haiku" if n.startswith("classifier") else "sonnet",
    )
    scenario(
        "B: A + scalar specialists -> haiku",
        lambda n: "haiku" if n.startswith("classifier") or n in scalar else "sonnet",
    )
    scenario("C: everything -> haiku (upper bound, not advised)", lambda n: "haiku")

    print(
        "\nnotes: segmenter + evaluator calls are not recorded in cells.json"
        "\n(per-pass, not per-cell) and are NOT included. 'plain kt' includes"
        "\nsub-floor prompts billed full price on cache:miss."
    )


if __name__ == "__main__":
    main()
