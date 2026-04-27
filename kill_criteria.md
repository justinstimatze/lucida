# lucida v0 kill criteria

Pre-committed before the 5-snippet expansion (2026-04-26) so the next
2 weeks of cell generation produce data *against* falsifiable failure
conditions, not data in search of a metric. Pattern inherited from
seeing/ARCHITECTURE.md.

Re-evaluate weekly. If any condition triggers and the listed remediation
doesn't move the needle within one week of attempting it, kill the
implicated component decisively rather than nursing it.

## The four conditions

### 1. Generic AI-aesthetic dominance (image cells)

**Trigger:** >50% of generated image cells, on honest naked-eye review,
read as "generic stock illustration" — pleasant scene-furniture rather
than a load-bearing visual of what the snippet actually claims.

**Why this matters:** Already observed once on cell-0005 (Margaret).
Gemini invented garden + tea + bread + notebook because the prompt
was underspecified. If the anti-hallucination clauses we just added
to the image prompt template don't drop this rate below 50%, image
cells aren't pulling weight as a default cell type.

**Remediation to try first:** prompt-specificity discipline (paragraph-
length lens-style prompts à la seeing/) plus the v0.5 image specialist
that extracts the load-bearing visual detail from the snippet before
generating.

**Kill action if remediation fails by week 3:** demote `image` from
the default classifier vocabulary; require explicit `--type image` to
opt in. Image cells become a deliberate move, not a default.

### 2. Classifier mis-routing

**Trigger:** >40% of cells generated via the auto-classifier need to
be re-typed manually (i.e. `classify()` picks the wrong cell type and
the human overrides with `--type`).

**Why this matters:** The keyword heuristic in `orchestrator.py:47`
is a placeholder. We need to know whether it's *bad enough* to block
the v0 → v0.5 transition or *good enough* that the LLM classifier is
just an upgrade rather than a rescue.

**Remediation to try first:** expand the keyword set based on the
specific mis-routings observed; tighten the priority order.

**Kill action if remediation fails by week 2:** rip out the auto-
classifier; make `--type` required. Defer the LLM classifier to
explicit user opt-in (`--auto-classify`) rather than the default path.

### 3. Substrate hallucination (any cell type)

**Trigger:** >20% of cells contain entities, values, or relationships
that are not present in the trigger snippet. (For images: invented
props/characters. For vega: invented numbers. For mermaid: invented
nodes/edges. For html: invented rows/columns.)

**Why this matters:** Inherited directly from `leg5_spec.md` substrate-
grounding rule and from seeing's anti-invention clause. Hallucinated
content makes cells *worse than no cell* because they look authoritative
while smuggling in fabrications.

**Remediation to try first:** anti-invention clauses on every prompt
template (already added 2026-04-26) plus a post-generation check that
flags cells where the rendered content has entities not in the snippet.

**Kill action if remediation fails by week 3:** kill the offending
cell type's auto-generation specifically (e.g. if vega keeps inventing
numbers, vega cells become hand-edit-only until the v0.5 LLM specialist
can be grounded against a verified-fact source).

### 4. The "never look at it again" failure (whole project)

**Trigger:** Sustained 2+ weeks of "I generate cells but never re-open
the notebook surface to look at them" — i.e. cells get produced as a
side effect of conversation but never return value as a referenced
artifact.

**Why this matters:** Lucida's whole premise is that the notebook is
*useful as a notebook* — a reflective surface you come back to. If
nobody comes back, lucida is just a slow expensive way to log
conversations. This is the analogue of seeing's "novelty cliff"
condition.

**Remediation to try first:** explicit "what made me look back?" review
every Friday for 2 weeks; tag re-visited cells; observe what makes a
cell sticky.

**Kill action if remediation fails by week 4:** write the post-mortem,
stop generating cells, and either pivot the project shape (towards
real-time/ambient à la Wakisaka, or towards something else entirely)
or shelve it.

## What's deliberately not on this list

- **Cost overrun.** The daily-cap tripwire in `nano_banana.py` already
  bounds spend; this is an ops concern not a kill criterion.
- **Generation latency.** Inherited as an open question from
  `leg5_spec.md` but not load-bearing for a CLI-driven notebook (only
  becomes a kill criterion when shape A / live transcript-watcher
  lands in v0.5+).
- **Cell-type bloat.** Already managed by the lens-earmarking rule
  inherited from leg5 (no new cell type without ≥10 logged ad-hoc
  cases). This is process, not a kill criterion.
