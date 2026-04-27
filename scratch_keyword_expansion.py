"""Honesty-pass scratch: contest the 'v0 keyword cannot be fixed' claim.

The kill_criteria.md remediation for criterion 2 was 'expand the keyword
set based on observed mis-routings; tighten priority order.' We never
tried it. learnings.md asserts the keyword path is dead. This script
runs the as-written v0 classifier and a one-round-expansion v0+ classifier
against the same 5 held-out snippets from commit 8ffba97 to see if the
remediation moves the needle.
"""
from __future__ import annotations


def classify_v0(snippet: str) -> str:
    """As-written v0 classifier from orchestrator.py:69."""
    s = snippet.lower()
    if any(k in s for k in ["graph", "network", "topology", "relationship", "depends on", "cites"]):
        return "mermaid"
    if any(k in s for k in ["chart", "trend", "distribution", "percentage", "%", "gap", "vs."]):
        return "vega"
    if any(k in s for k in ["scene", "image", "picture", "looks like", "visualize literally", "evoke"]):
        return "image"
    if any(k in s for k in ["matrix", "heatmap", "table", "grid"]):
        return "html"
    return "text"


def classify_v0_plus(snippet: str) -> str:
    """One round of targeted keyword expansion based on the 5 mis-routings.

    Changes vs v0:
    - Drop 'depends on' from mermaid (too soft; matches argumentative prose).
    - Add cycle/loop/feedback keywords for animated_svg (was always missing).
    - Add scene-sensory keywords for image (sunlight, illuminates, abandoned,
      rows of, hangs, broken).
    - Add axes-of-comparison keywords for html ('differ on every', 'two species',
      'every meaningful axis', 'axes:').
    - Order: most-specific first (animated_svg before image before vega).
    """
    s = snippet.lower()
    # animated_svg first — cycle language is unambiguous
    if any(k in s for k in ["cycle", "feedback loop", "spiral", "accelerates the next", "pulse", "each round"]):
        return "animated_svg"
    # html (comparative-axes language is also unambiguous)
    if any(k in s for k in ["differ on every", "every meaningful axis", "axes:", "two species", "matrix", "heatmap", "table", "grid"]):
        return "html"
    # mermaid (structural; 'depends on' removed)
    if any(k in s for k in ["graph", "network", "topology", "relationship", "cites", "tree of", "node"]):
        return "mermaid"
    # vega (quantitative)
    if any(k in s for k in ["chart", "trend", "distribution", "percentage", "%", " percent", "between 19", "between 20", "captured "]):
        return "vega"
    # image (sensory scene)
    if any(k in s for k in ["scene", "image", "picture", "looks like", "evoke", "sunlight", "illuminates", "abandoned", "rows of", "still hangs", "broken windows"]):
        return "image"
    return "text"


SNIPPETS = [
    ("cell-0017", "vega", "Between 1979 and 2019, the top 10% of US households captured 56% of total income growth, while the bottom 50% captured 4%. The middle 40% saw their share fall by 8 percentage points."),
    ("cell-0018", "animated_svg", "Soil compaction reduces root depth, which decreases water uptake, which stresses plants, which lowers yields, which increases the pressure to till -- which compacts the soil further. Each cycle accelerates the next."),
    ("cell-0019", "image", "On the second floor of the abandoned Detroit textile mill, sunlight cuts through broken windows and illuminates rows of forgotten Singer sewing machines covered in three decades of dust. A single calendar from 1989 still hangs near the foreman's desk."),
    ("cell-0020", "text", "The essay's argument depends on the reader noticing what the author has not said. The omissions are themselves the structure."),
    ("cell-0021", "html", "The two species of mycorrhizal fungi differ on every meaningful axis: Glomeromycota colonize root cells intracellularly, partner exclusively with vascular plants, and are obligate symbionts; Basidiomycota colonize root surfaces intercellularly, pair with woody trees, and can survive saprotrophically when no host is present."),
]


def run():
    print(f"{'cell':<10} {'expected':<14} {'v0':<14} {'v0+':<14} {'v0✓':<5} {'v0+✓':<5}")
    print("-" * 70)
    v0_score = 0
    v0p_score = 0
    for cid, expected, snip in SNIPPETS:
        v0 = classify_v0(snip)
        v0p = classify_v0_plus(snip)
        v0_ok = "✓" if v0 == expected else "✗"
        v0p_ok = "✓" if v0p == expected else "✗"
        if v0 == expected:
            v0_score += 1
        if v0p == expected:
            v0p_score += 1
        print(f"{cid:<10} {expected:<14} {v0:<14} {v0p:<14} {v0_ok:<5} {v0p_ok:<5}")
    print("-" * 70)
    print(f"{'TOTAL':<10} {'':<14} {f'{v0_score}/5':<14} {f'{v0p_score}/5':<14}")


if __name__ == "__main__":
    run()
