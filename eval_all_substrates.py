"""Batch-run text_evaluator across all active vega/mermaid/html cells.

Computes kill #3 (substrate hallucination) rate. Reports per-cell quality
score and invention counts, plus aggregate by cell type.

Cost: ~$0.31 across ~26 cells on Sonnet 4.6 with caching.
Outputs report to audits/substrate_eval_YYYY-MM-DD.md.
"""
from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

from text_evaluator import TextEvaluatorError, evaluate_substrate_cell

REPO = Path(__file__).parent
CELLS_JSON = REPO / "cells.json"
AUDITS_DIR = REPO / "audits"

# Sonnet 4.6 pricing (USD per 1M tokens)
_INPUT_COST_PER_M = 3.0
_OUTPUT_COST_PER_M = 15.0


def main() -> None:
    AUDITS_DIR.mkdir(exist_ok=True)
    today = datetime.date.today().isoformat()
    out_path = AUDITS_DIR / f"substrate_eval_{today}.md"

    data = json.loads(CELLS_JSON.read_text())
    targets = [
        c for c in data["cells"]
        if c.get("cell_type") in {"vega", "mermaid", "html"}
        and not c.get("replaced_by")
        and (c.get("spec") is not None or c.get("html") is not None)
    ]
    print(f"# evaluating {len(targets)} cells", file=sys.stderr)

    rows = []
    by_type: dict[str, list[dict]] = {"vega": [], "mermaid": [], "html": []}
    total_in = 0
    total_out = 0
    total_cache_read = 0

    for cell in targets:
        cid = cell["id"]
        ctype = cell["cell_type"]
        print(f"  {cid} ({ctype})...", end=" ", file=sys.stderr, flush=True)
        try:
            r = evaluate_substrate_cell(cell)
        except TextEvaluatorError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            rows.append({"id": cid, "ctype": ctype, "error": str(e)})
            continue
        print(f"score={r.quality_score:.2f} inventions={len(r.invented_substrate_items)}+{len(r.invented_caption_items)}", file=sys.stderr)
        row = {
            "id": cid,
            "ctype": ctype,
            "score": r.quality_score,
            "substrate_inv": r.invented_substrate_items,
            "caption_inv": r.invented_caption_items,
            "demote": r.should_demote_to_text,
            "summary": r.summary,
        }
        rows.append(row)
        by_type[ctype].append(row)
        total_in += r.input_tokens
        total_out += r.output_tokens
        total_cache_read += r.cache_read_tokens

    has_inv = [r for r in rows if "error" not in r and (r["substrate_inv"] or r["caption_inv"])]
    rate = len(has_inv) / max(len(rows), 1)
    kill3_tripped = rate > 0.20

    report = []
    report.append(f"# substrate hallucination eval — {today}\n")
    report.append("Kill #3 trigger: substrate hallucination >20% of cells.\n")
    report.append("## Summary\n")
    report.append(f"- evaluated: {len(rows)} cells ({len(by_type['vega'])} vega, {len(by_type['mermaid'])} mermaid, {len(by_type['html'])} html)")
    report.append(f"- cells with any invention: {len(has_inv)}/{len(rows)} = {rate:.1%}")
    report.append(f"- kill #3 (>20%) tripped: **{'YES' if kill3_tripped else 'no'}**")
    report.append(f"- tokens: in={total_in} out={total_out} cache_read={total_cache_read}")
    est_cost = (total_in * _INPUT_COST_PER_M + total_out * _OUTPUT_COST_PER_M) / 1_000_000
    report.append(f"- est. cost: ~${est_cost:.3f}\n")

    for ctype in ("vega", "mermaid", "html"):
        type_rows = by_type[ctype]
        if not type_rows:
            continue
        type_inv = [r for r in type_rows if r["substrate_inv"] or r["caption_inv"]]
        report.append(f"## {ctype} ({len(type_rows)} cells, {len(type_inv)} with inventions)\n")
        report.append("| cell | score | sub-inv | cap-inv | demote? | summary |")
        report.append("|---|---|---|---|---|---|")
        for r in type_rows:
            sub = len(r["substrate_inv"])
            cap = len(r["caption_inv"])
            score = f"{r['score']:.2f}"
            demote = "yes" if r["demote"] else ""
            summary_short = r["summary"].replace("\n", " ").replace("|", "\\|")
            if len(summary_short) > 200:
                summary_short = summary_short[:200] + "..."
            report.append(f"| {r['id']} | {score} | {sub} | {cap} | {demote} | {summary_short} |")
        report.append("")

        invs = [r for r in type_rows if r["substrate_inv"] or r["caption_inv"]]
        if invs:
            report.append(f"### {ctype} inventions detail\n")
            for r in invs:
                report.append(f"**{r['id']}** (score {r['score']:.2f}):")
                for item in r["substrate_inv"]:
                    report.append(f"- substrate: {item}")
                for item in r["caption_inv"]:
                    report.append(f"- caption: {item}")
                report.append("")

    errors = [r for r in rows if "error" in r]
    if errors:
        report.append("## Errors\n")
        for r in errors:
            report.append(f"- {r['id']} ({r['ctype']}): {r['error']}")
        report.append("")

    out_path.write_text("\n".join(report))
    print(f"\n# wrote {out_path}", file=sys.stderr)
    print(f"\nkill #3 rate: {rate:.1%} ({len(has_inv)}/{len(rows)})", file=sys.stderr)
    print(f"kill #3 tripped (>20%): {kill3_tripped}", file=sys.stderr)

    raw_path = AUDITS_DIR / f"substrate_eval_{today}.json"
    raw_path.write_text(json.dumps(rows, indent=2))
    print(f"raw results: {raw_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
