"""Week-by-week audit against kill_criteria.md.

Computes:
  #1 generic AI-aesthetic dominance (image cells, quality_score<0.7 proxy)
  #2 classifier mis-routing (parsed from cell notes — free)
  #3 substrate hallucination (what_didnt_work invention patterns)

Kill #4 ("never look at it again") is de-prioritized — see lucida_vision
memory: lucida is an ephemeral in-conversation artifact, not a revisit
archive, so the re-visit metric is no longer load-bearing.

Run:
  python audit_kill_criteria.py                       # write report to audits/
  python audit_kill_criteria.py --no-eval             # free-only (kill #2)
  python audit_kill_criteria.py --report-path PATH    # custom path

Cost: ~$0.02 per image-cell evaluation. With 6 active image cells with
PNGs in the current corpus, full audit ~$0.12.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path

from evaluator import EvaluatorError, evaluate_image_cell


REPO = Path(__file__).parent
CELLS_JSON = REPO / "cells.json"


CLASSIFIER_FORCE_RE = re.compile(r"classifier\([^)]+\)→(\w+);\s*forced→(\w+)")
EVAL_SCORE_RE = re.compile(r"eval@([\d.]+)")
INVENTION_RE = re.compile(
    r"\b(invent(ed|ing|ion)?|fabricat(ed|ing)?|added\s+(?:elements|props|features)|not\s+(?:in|present\s+in)\s+(?:the\s+)?snippet|extraneous)\b",
    re.IGNORECASE,
)


def load_cells() -> list[dict]:
    return json.loads(CELLS_JSON.read_text())["cells"]


def kill2_misrouting(cells: list[dict]) -> dict:
    """Classifier mis-routing rate: cells where notes say classifier→A;forced→B with A≠B."""
    agreed, mis_routed_pairs, no_classifier = 0, [], 0
    for c in cells:
        notes = c.get("notes", "") or ""
        m = CLASSIFIER_FORCE_RE.search(notes)
        if m:
            cls, forced = m.group(1), m.group(2)
            if cls != forced:
                mis_routed_pairs.append((c["id"], cls, forced))
            else:
                agreed += 1
        elif "classifier" in notes:
            agreed += 1
        else:
            no_classifier += 1
    total = agreed + len(mis_routed_pairs)
    rate = len(mis_routed_pairs) / total if total else 0.0
    return {
        "rate": rate,
        "trigger": 0.40,
        "tripped": rate > 0.40,
        "agreed": agreed,
        "mis_routed": len(mis_routed_pairs),
        "no_classifier": no_classifier,
        "mis_routed_pairs": mis_routed_pairs,
    }


def evaluate_image_cells(cells: list[dict]) -> list[dict]:
    """Run evaluator on every active image cell with a PNG. Returns per-cell records."""
    results = []
    for c in cells:
        if c.get("cell_type") != "image":
            continue
        if c.get("replaced_by"):
            continue
        path = c.get("image_path") or ""
        if not path:
            results.append({"id": c["id"], "status": "no_image", "snippet": c.get("trigger_snippet", "")[:80]})
            continue
        png = REPO / path
        if not png.exists():
            results.append({"id": c["id"], "status": "missing_file", "path": str(png)})
            continue
        snippet = c.get("trigger_snippet", "") or ""
        try:
            res = evaluate_image_cell(snippet, png)
        except EvaluatorError as e:
            results.append({"id": c["id"], "status": "eval_error", "error": str(e)})
            continue
        rec = asdict(res)
        rec["id"] = c["id"]
        rec["status"] = "ok"
        rec["snippet_head"] = snippet[:80].replace("\n", " ")
        results.append(rec)
    return results


def kill1_generic_aesthetic(eval_records: list[dict], threshold: float = 0.7) -> dict:
    """Proxy: quality_score < threshold means image fails snippet-fidelity → likely generic."""
    scored = [r for r in eval_records if r.get("status") == "ok"]
    failing = [r for r in scored if r["quality_score"] < threshold]
    rate = len(failing) / len(scored) if scored else 0.0
    return {
        "rate": rate,
        "trigger": 0.50,
        "tripped": rate > 0.50,
        "threshold": threshold,
        "evaluated": len(scored),
        "failing": [(r["id"], r["quality_score"], r["failure_mode"]) for r in failing],
    }


def kill3_substrate_hallucination(eval_records: list[dict]) -> dict:
    """Heuristic: regex over what_didnt_work for invention patterns. Heuristic — manual review recommended."""
    scored = [r for r in eval_records if r.get("status") == "ok"]
    flagged = []
    for r in scored:
        wdw = r.get("what_didnt_work", "") or ""
        m = INVENTION_RE.search(wdw)
        if m:
            flagged.append({"id": r["id"], "matched_phrase": m.group(0), "wdw": wdw[:200]})
    rate = len(flagged) / len(scored) if scored else 0.0
    return {
        "rate": rate,
        "trigger": 0.20,
        "tripped": rate > 0.20,
        "evaluated": len(scored),
        "flagged": flagged,
        "note": "Heuristic regex match on what_didnt_work; manual review recommended for confirmation.",
    }


def render_report(k1: dict, k2: dict, k3: dict, evals: list[dict], audit_date: str) -> str:
    L = []
    add = L.append
    add(f"# Kill-criteria audit — {audit_date}")
    add("")
    add("Triage against `kill_criteria.md`. Kill #4 (revisit) intentionally omitted — see `lucida_vision` memory: lucida is an ephemeral in-conversation artifact, so revisit metric isn't load-bearing.")
    add("")

    def status_line(name, k):
        flag = "TRIPPED" if k["tripped"] else "ok"
        return f"- **{name}**: {k['rate']:.1%} (trigger >{k['trigger']:.0%}) — **{flag}**"

    add("## Summary")
    add(status_line("Kill #1 — generic AI-aesthetic dominance (image)", k1))
    add(status_line("Kill #2 — classifier mis-routing", k2))
    add(status_line("Kill #3 — substrate hallucination (image)", k3))
    add("")

    add("## Kill #1 — generic AI-aesthetic dominance")
    add(f"Proxy: evaluator `quality_score` < {k1['threshold']} (failure to render snippet specifics).")
    add(f"Evaluated {k1['evaluated']} image cells; {len(k1['failing'])} failed.")
    add("")
    if k1["failing"]:
        add("Failing cells:")
        add("")
        add("| cell | score | failure_mode |")
        add("|------|------:|--------------|")
        for cid, s, mode in k1["failing"]:
            add(f"| {cid} | {s:.2f} | {mode} |")
        add("")

    add("## Kill #2 — classifier mis-routing (free; from notes)")
    add(f"Of {k2['agreed'] + k2['mis_routed']} classifier-routed cells, {k2['mis_routed']} were `--type`-overridden.")
    add(f"({k2['no_classifier']} cells had no classifier note — pre-classifier era or hand-edited.)")
    add("")
    if k2["mis_routed_pairs"]:
        add("Overrides (classifier → forced):")
        add("")
        add("| cell | classifier | forced |")
        add("|------|------------|--------|")
        for cid, cls, forced in k2["mis_routed_pairs"]:
            add(f"| {cid} | {cls} | {forced} |")
        add("")

    add("## Kill #3 — substrate hallucination (image)")
    add(f"Heuristic: regex match on evaluator `what_didnt_work` for invention patterns ({k3['note']})")
    add(f"Evaluated {k3['evaluated']} image cells; {len(k3['flagged'])} flagged.")
    add("")
    if k3["flagged"]:
        add("Flagged cells:")
        add("")
        for f in k3["flagged"]:
            add(f"- **{f['id']}** — matched `{f['matched_phrase']}`")
            add(f"  > {f['wdw']}")
        add("")

    add("## Per-cell evaluation detail")
    add("")
    add("| cell | status | score | failure_mode | snippet head |")
    add("|------|--------|------:|--------------|--------------|")
    for r in evals:
        if r.get("status") == "ok":
            add(f"| {r['id']} | ok | {r['quality_score']:.2f} | {r['failure_mode']} | {r['snippet_head']} |")
        else:
            add(f"| {r['id']} | {r.get('status')} | — | — | — |")
    add("")

    add("## Notes")
    add(f"- Audit date: {audit_date}")
    add("- Run `python audit_kill_criteria.py` weekly per `kill_criteria.md` cadence.")
    add("- Cost per full audit: ~$0.02 × N image cells with PNGs.")
    return "\n".join(L)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--no-eval", action="store_true", help="skip paid evaluator step (kill #2 only)")
    p.add_argument("--report-path", help="output path; default audits/audit_YYYY-MM-DD.md")
    args = p.parse_args()

    cells = load_cells()
    audit_date = date.today().isoformat()

    print(f"# Audit {audit_date}", file=sys.stderr)
    print(f"loaded {len(cells)} cells", file=sys.stderr)

    k2 = kill2_misrouting(cells)
    print(f"kill #2: {k2['rate']:.1%} ({k2['mis_routed']}/{k2['agreed'] + k2['mis_routed']})", file=sys.stderr)

    if args.no_eval:
        print("--no-eval: skipping evaluator", file=sys.stderr)
        evals = []
        k1 = {"rate": 0.0, "trigger": 0.50, "tripped": False, "threshold": 0.7, "evaluated": 0, "failing": []}
        k3 = {"rate": 0.0, "trigger": 0.20, "tripped": False, "evaluated": 0, "flagged": [], "note": "skipped"}
    else:
        print("running evaluator on active image cells with PNGs...", file=sys.stderr)
        evals = evaluate_image_cells(cells)
        ok = sum(1 for r in evals if r.get("status") == "ok")
        print(f"  {ok}/{len(evals)} evaluations succeeded", file=sys.stderr)
        k1 = kill1_generic_aesthetic(evals)
        k3 = kill3_substrate_hallucination(evals)
        print(f"kill #1: {k1['rate']:.1%} ({len(k1['failing'])}/{k1['evaluated']})", file=sys.stderr)
        print(f"kill #3: {k3['rate']:.1%} ({len(k3['flagged'])}/{k3['evaluated']})", file=sys.stderr)

    report = render_report(k1, k2, k3, evals, audit_date)

    if args.report_path:
        out = Path(args.report_path)
    else:
        out_dir = REPO / "audits"
        out_dir.mkdir(exist_ok=True)
        out = out_dir / f"audit_{audit_date}.md"
    out.write_text(report)
    print(f"wrote {out}", file=sys.stderr)
    print(report)


if __name__ == "__main__":
    main()
