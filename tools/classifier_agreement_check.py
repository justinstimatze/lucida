"""Classifier model-agreement check on historical lucida snippets.

Runs two models over a stratified sample of recorded trigger_snippets
(both on the CURRENT prompt) and reports cell_type/discourse agreement,
confidence distributions, and gate-band crossings (<0.6 suppress /
0.6-0.8 draft). Built for the 2026-06-10 Haiku trial, which it rejected:
36% cell_type agreement, suppress band 7/72 -> 36/72. Re-run before any
future classifier-model swap. Cost ~$0.50 / ~2 min at n=72.
"""

import json
import random
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))
import classifier

N_PER_TYPE = 6
SEED = 1138

cells = json.loads((Path(__file__).parent.parent / "cells.json").read_text())["cells"]
by_type = defaultdict(list)
for c in cells:
    snip = c.get("trigger_snippet") or ""
    if len(snip) > 80 and c.get("cell_type"):
        by_type[c["cell_type"]].append(c)

rng = random.Random(SEED)
sample = []
for _t, group in sorted(by_type.items()):
    sample.extend(rng.sample(group, min(N_PER_TYPE, len(group))))
print(f"sample: {len(sample)} cells across {len(by_type)} recorded types", flush=True)


def run(args):
    cell, model = args
    try:
        r = classifier.classify(cell["trigger_snippet"], "", model)
        return (cell["id"], model, r.cell_type, r.discourse_move, r.confidence, None)
    except Exception as e:
        return (cell["id"], model, None, None, None, str(e)[:80])


jobs = [(c, m) for c in sample for m in ("claude-sonnet-4-6", "claude-haiku-4-5")]
with ThreadPoolExecutor(max_workers=8) as ex:
    results = list(ex.map(run, jobs))

rows = defaultdict(dict)
for cid, model, ctype, move, conf, err in results:
    fam = "haiku" if "haiku" in model else "sonnet"
    rows[cid][fam] = (ctype, move, conf, err)

ok = {
    cid: r
    for cid, r in rows.items()
    if r.get("sonnet", (None,) * 4)[0] and r.get("haiku", (None,) * 4)[0]
}
errs = [(cid, r) for cid, r in rows.items() if cid not in ok]
print(f"paired results: {len(ok)}  errors: {len(errs)}", flush=True)
for cid, r in errs[:5]:
    print("  err:", cid, r)

type_agree = sum(1 for r in ok.values() if r["sonnet"][0] == r["haiku"][0])
move_agree = sum(1 for r in ok.values() if r["sonnet"][1] == r["haiku"][1])
n = len(ok)
print(f"\ncell_type agreement: {type_agree}/{n} = {type_agree / n:.0%}")
print(f"discourse agreement: {move_agree}/{n} = {move_agree / n:.0%}")


def band(c):
    return "suppress(<0.6)" if c < 0.6 else "draft(0.6-0.8)" if c <= 0.8 else "normal(>0.8)"


sc = [r["sonnet"][2] for r in ok.values()]
hc = [r["haiku"][2] for r in ok.values()]
print("\nconfidence  mean      p25/p50/p75")


def _quantile(xs: list[float], p: float) -> float:
    xs = sorted(xs)
    return xs[int(p * (len(xs) - 1))]


for name, xs in (("sonnet", sc), ("haiku", hc)):
    q25, q50, q75 = (_quantile(xs, p) for p in (0.25, 0.5, 0.75))
    print(f"  {name:<8} {sum(xs) / len(xs):.3f}   {q25:.2f}/{q50:.2f}/{q75:.2f}")

print("\ngate bands     sonnet  haiku")
sb, hb = Counter(band(c) for c in sc), Counter(band(c) for c in hc)
for b in ("suppress(<0.6)", "draft(0.6-0.8)", "normal(>0.8)"):
    print(f"  {b:<15} {sb[b]:>5}  {hb[b]:>5}")

crossings = [(cid, r) for cid, r in ok.items() if band(r["sonnet"][2]) != band(r["haiku"][2])]
print(f"\ngate-band crossings: {len(crossings)}/{n}")
for cid, r in crossings:
    s, h = r["sonnet"], r["haiku"]
    print(f"  {cid}: sonnet {s[0]}@{s[2]:.2f} -> haiku {h[0]}@{h[2]:.2f}")

print("\ndisagreements (cell_type):")
for cid, r in ok.items():
    if r["sonnet"][0] != r["haiku"][0]:
        print(
            f"  {cid}: sonnet={r['sonnet'][0]}@{r['sonnet'][2]:.2f}  haiku={r['haiku'][0]}@{r['haiku'][2]:.2f}"
        )
