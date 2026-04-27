# lucida v0 → v0.5 learning report

The v0 README promised this writeup "after 2 weeks." The sprint front-loaded
the build, so we have 35 cells, 8 generated images, two reflection passes,
one autonomous retrigger chain, and three classifier head-to-heads to
synthesize against. Pre-committed kill criteria in `kill_criteria.md`.

## Corpus at time of writing

35 cells in `cells.json`:

| type | count | notes |
|---|---|---|
| image | 12 | 8 actually rendered to disk (`cells/*.png`); 4 awaiting generation |
| text | 7 | mix of v0 hand-fills, evaluator demotions, and reflection cell |
| vega | 5 | 3 awaiting generation, 1 specialist-built, 1 seed |
| html | 5 | 1 specialist-built (cell-0026), rest hand-filled or awaiting |
| mermaid | 2 | 1 specialist-built (cell-0028), 1 seed |
| animated_svg | 2 | both hand-authored / awaiting; no LLM generator yet |
| scene3d | 1 | hand-authored infrastructure demo |
| aframe | 1 | hand-authored infrastructure demo |

Two clean A/B pairs and one retrigger lineage of 3 sit inside this corpus.
That's the bulk of the evidence.

## Verdict per kill criterion

### Criterion 1 — generic AI-aesthetic dominance (>50%)

**Trigger fired in v0. Remediation worked in v0.5.**

The v0 image prompt template (`Conceptual scene illustrating: {snippet}.
Style: warm, restrained, low-saturation, painterly.`) produced exactly the
failure mode the criterion described:

- **cell-0005** (v0 prompt, "the Margaret moment"): Gemini invented garden
  furniture, tea, bread, a notebook — none in the snippet. Pleasant scene-
  furniture, zero load-bearing visual content. This was the original
  motivation for the criterion.
- **cell-0010** (v0 prompt, Los Algodones snippet containing the simile
  "part Lourdes and part Costco"): rendered as a literal Costco interior
  with shelves and shopping carts. Substrate hallucination *from a simile*.

The v0.5 image specialist (`image_specialist.py`) replaces this with a
2-step shape: extract `subject / setting / mood / composition / props /
avoid` from the snippet, then compose into the Gemini prompt. A/B on the
same Doña Esperanza snippet:

- **cell-0014** (v0.5 specialist, first attempt): Zapotec milpa rendered
  with a Moroccan/Mediterranean village in the background, the woman
  crouched and faceless, the corn rendered chalk-white-skeletal rather
  than heritage-cream. *Specifically named by the cell-0016 reflection.*
- **cell-0015** (v0.5 specialist, second attempt, same snippet): bone-
  white corn, bean vines visibly climbing the stalks, stone-walled
  terrace edge, woman in a rebozo with a planting stick. Ethnographic
  weight without romanticizing.

So: criterion 1 fired against v0 at well over 50% (every v0 image cell
above is generic stock at the snippet level). v0.5 specialist drops it
to roughly 1-of-2-attempts on a hard snippet (the Andean/Mediterranean
village hallucination is exactly the failure mode), but the load-bearing
visual specificity (rebozo, huaraches, climbing bean vines, stone
terraces) does land when the specialist works. Remediation moved the
needle. **No kill action needed; keep image as a default cell type.**

Caveat: I haven't generated enough v0.5 image cells to publish a clean
percentage. 8 generated PNGs is a small sample; the next 2 weeks should
push to 30+ image cells before re-evaluating this criterion with a real
ratio.

### Criterion 2 — classifier mis-routing (>40%)

**Trigger fired hard against v0. v0.5 LLM classifier shipped as the kill
action. Honesty caveat: keyword-expansion remediation, never tried in
the sprint, would have moved the in-sample needle — the LLM classifier
wins on robustness and on outputs the keyword path cannot produce, not
on raw routing accuracy alone.**

Direct head-to-head from commit 8ffba97, five held-out snippets:

| snippet | v0 keyword | v0.5 LLM | correct |
|---|---|---|---|
| income share %      | vega    | vega @0.93        | vega (v0 was an accident — matched on `%`) |
| soil compaction cycle | text  | animated_svg @0.85 | animated_svg (cyclic causal needs motion) |
| Detroit mill scene  | text    | image @0.93       | image |
| meta-cognitive omission | mermaid | text @0.72 [draft] | text |
| mycorrhizal comparison | text  | html @0.93        | html |

**v0 keyword (as-written): 1/5. v0.5 LLM: 5/5.**

**Honesty pass on the keyword path** — `kill_criteria.md` pre-committed
the remediation "expand the keyword set based on observed mis-routings;
tighten priority order." That remediation was never executed during the
sprint; we jumped to the LLM classifier. Re-running it in
`scratch_keyword_expansion.py` after the report's first draft, with
~30 minutes of targeted edits (drop the soft "depends on" trigger from
mermaid, add cycle/feedback-loop terms for animated_svg, add scene-
sensory terms for image, add axes-of-comparison terms for html, reorder
specific-before-generic):

```
v0 keyword (as-written):  1/5
v0+ (one-round expansion): 5/5
v0.5 LLM:                  5/5
```

So the pre-committed remediation does work *on this test set*. The
correct interpretation of the criterion-2 outcome is therefore:

1. **In-sample accuracy is not the load-bearing differentiator.** Both
   keyword-expanded and LLM hit 5/5. The keyword version was hand-tuned
   to a known test, which is exactly the failure mode keyword classifiers
   generalize into — every new snippet category requires another patch.
2. **The LLM classifier wins on three things keywords cannot give:**
   (a) discourse-move output (`temporal/causal/quantitative/comparative/
   structural/none`) which the specialists consume, (b) a calibrated
   confidence score (cell-0034 @0.55 → text, cell-0020 @0.72 → draft,
   cells 0017-0021 unambiguous cases all >0.85), and (c) generalization
   without per-snippet maintenance.
3. **The kill criterion's kill action ("rip out the auto-classifier;
   make `--type` required") was the wrong kill.** The real choice was
   *upgrade* vs *kill*, and the upgrade was justified — but on robustness
   grounds, not because the keyword path was unsalvageable.

Confidence calibration is meaningful, not vibes. cell-0034 ("we're
talking again about the productivity-compensation gap") landed at
**0.55** and was correctly demoted to text by the confidence gate at
`orchestrator.py:552`. cell-0020 ("the essay depends on what the author
has *not* said") landed at **0.72** and was marked draft. The
unambiguous cases all sat above 0.85. The threshold semantics from
leg5_spec.md transferred cleanly.

Operational evidence the remediation also works on volume:
- Caching verified across processes: cache:wrote/2550t on call 1,
  cache:hit/2550t on calls 2-5, ~10× cost drop after the first write.
- The `discourse_move + cell_type` joint output is more useful than
  `cell_type` alone — it tells the specialist *what move the snippet is
  making*, which the v0 path could not surface at all.

This was the criterion most cleanly answered, with one important
caveat surfaced post-write (above). The v0 keyword classifier in
`orchestrator.py:69` is not dead code in principle — it is dead code
*for this project's needs* because we want discourse-move output, a
confidence score, and generalization. As an `--no-llm-classify`
fallback for offline / API-key-absent use it still earns its keep.

### Criterion 3 — substrate hallucination (>20%)

**Trigger fires across cell types. Remediation partial. Worth a closer pass.**

Documented hallucinations across the corpus:

- **cell-0005** (Margaret): garden + tea + bread + notebook, none in snippet
- **cell-0010** (Los Algodones): literal Costco shelves from a simile
- **cell-0014** (Doña Esperanza): Moroccan-Mediterranean village in place
  of Zapotec highland; beans absent; figure crouched and faceless

3 of 8 generated image cells (37.5%) contain at least one named substrate
hallucination — over the 20% trigger. But this counts the v0-prompt cells
(0005, 0010) which the v0.5 path replaces. Filtering to v0.5-specialist
cells only: cell-0014 fails, cell-0015 succeeds, cell-0022 (Detroit) is
clean, cells 0023-0025 (lighthouse) — see below. So among v0.5 image
cells with content: ~1 of 5, or 20%. Right on the trigger.

**The interesting finding is *who caught the hallucination*:** not the
per-cell evaluator (`evaluator.py`). cell-0014 has no eval annotation in
its notes — the per-cell evaluator either didn't fire or scored it
acceptable. The **multi-cell reflection** (cell-0016, `reflect.py`) is
what surfaced the Moroccan-village failure, and it surfaced it by
*comparing two attempts side-by-side*. That's a structural lesson:
substrate hallucination is more legibly diagnosed at the comparison
layer than at the individual-cell layer.

The **autonomous retrigger loop** (`orchestrator.py:529+`) does *not*
appear to fix hallucination on its own. cell-0023 → cell-0024 → cell-0025
(Maine lighthouse): three attempts, all evaluator @0.82 with
`should_retrigger=True`, no score improvement across the chain. The
empty-guidance bug we noted in the handoff is the proximate cause: when
`should_retrigger` fires without `should_retrigger=True` in the
evaluator's intent (i.e. via score-floor only) the corrective brief is
empty or generic. But even the path where it fires *with* intent (the
lighthouse case) isn't producing improvement, which suggests the
evaluator's "should retrigger" bit is noisy and the corrective guidance
isn't actionable enough to differentiate one attempt from the next.

Kill action calibration: the criterion's kill is "kill the offending cell
type's auto-generation specifically." We're not at the kill threshold for
any specific cell type yet — vega/mermaid/html specialists (cells 26-28)
have not yet shown invented numbers/edges/rows; the failures are all in
image. The right next move is **promoting reflection from "demo" to
"required-pass-before-accept"** for image cells, not killing image
auto-gen.

### Criterion 4 — never look at it again

**Inconclusive. Probably not the right framing for this project shape.**

The trigger is "sustained 2+ weeks of generating cells but never re-opening
the notebook surface." The 2-week clock hasn't run. But more importantly,
the data we *do* have suggests the kill criterion was framed for a
different mental model than the one the build converged on:

- The notebook surface (`index.html` at localhost:8766) was opened
  multiple times during the sprint, mostly to validate renderer
  correctness rather than to *consult past cells*. That's surface
  visits, not cell consumption.
- Cells get re-read by the *system itself*: the reflection pass
  (cell-0016) read cells 0011-0015 as multimodal input, the retrigger
  loop reads its own previous attempt's brief, the watcher's dedup pass
  reads existing snippets. **The system is its own most attentive reader.**
- The closed-loop moments — cells 0014→0015→0016, cells 0023→0024→0025,
  the cell-0028 mermaid that built on cell-0016's reflection-suggested
  follow-on — are the cells that earn their existence. Cells with no
  loop closure (the seed cells, cells 0006-0009 hand-filled v0
  substitutes, the infrastructure demos 0011-0013) are inert.

So the criterion's premise — "the human comes back to look" — is the
wrong measure for a system whose value is in **what cells produce
together**, not in what any one cell shows. The correct generalization
is below.

## Proposed output metric

The README explicitly defers metric selection until after observation.
After 35 cells the metric I'd commit to is:

> **Closed-loop ratio** = cells whose existence is justified by a
> downstream artifact / total cells.

A cell *closes a loop* when it satisfies at least one of:
1. **Retrigger lineage** — it replaces or is replaced by another cell
   (`replaces` or `replaced_by` populated)
2. **Reflection input** — it appears in another cell's
   `reflection_source_ids`
3. **Reflection output** — it is itself a reflection cell
4. **Specialist follow-on** — its content is referenced by a later
   classifier reasoning string or specialist prompt

Counting against the current corpus:

- Retrigger lineages: cell-0023, 0024, 0025 → **3**
- Reflection input: cells 0011, 0012, 0013, 0014, 0015 → **5**
- Reflection output: cell-0016 → **1**
- Specialist follow-on: cell-0028 (mermaid) was suggested by cell-0016 → **1**

**Closed-loop count: 10 of 35 = 28.6%.**

This is a more honest measure than "did the human go look" because it
captures what makes lucida structurally different from a folder of
illustrations: cells *produce more cells*. The infrastructure demos and
seed cells aren't penalized for being inert because they *are* inert by
design — but they also don't get to count as wins. A cell that nothing
else touches is overhead.

**Proposed v0.5 → v1 target:** closed-loop ratio ≥ 50% over the next 30
content cells (excluding infrastructure demos). If we can't break 50%,
the system is a slow expensive way to log conversations and we should
fold reflection/retrigger into the orchestrator's default path or rethink.

## What I'd change about the kill criteria themselves

The 4-criterion frame was mostly load-bearing. Three observations:

1. **Criterion 4 ("never look at it again")** is the one that aged worst.
   It anchors on human re-consultation; the build converged on
   system-internal re-consultation (reflection, retrigger, dedup). Replace
   with the closed-loop metric above.

2. **Criterion 3 ("substrate hallucination")** would benefit from being
   split per-cell-type. Image hallucination and vega-numbers hallucination
   are diagnosed differently and should fail differently. Right now they
   share a kill action that doesn't actually fit either.

3. We should **add a fifth criterion**: *evaluator agreement with
   reflection.* If `evaluator.py` accepts a cell that `reflect.py` later
   flags (cell-0014 case), that's a signal the per-cell judge is
   miscalibrated. >30% disagreement = kill the per-cell evaluator and lean
   exclusively on reflection batches.

## Carry-forward into v0.5+

Concrete, in priority order:

1. **Empty retrigger guidance bug** (cells 0023-0025 lineage). Fix the
   path in `orchestrator.py:565+` where `should_retrigger=True` from
   score-floor doesn't carry meaningful corrective text. Until fixed,
   the retrigger loop is degenerate.
2. **Reflection-as-default for image cells**, not just on-demand. The
   per-cell evaluator missed cell-0014's village; the reflection caught
   it. Promote reflection from `--reflect` opt-in to running automatically
   every N image cells.
3. **Closed-loop metric** wired into the watcher's logging output so
   we can track it live during shape-A operation.
4. The known caveats from the handoff (A-Frame chrome stripping
   brittleness, watcher input validation, lottie hand-authoring,
   document-segmenter cross-delta context) are all real but none is
   load-bearing for the metric verdict above.

## Cost summary

8 generated images on `gemini-2.5-flash-image`. Classifier and specialist
calls on Sonnet 4.6 with cache:hit on the 2550-token system prompts after
the first write. Approximate sprint spend: ~$0.85. Daily image cap
(`LUCIDA_DAILY_IMAGE_CAP=200`) never came near firing. Cost ceiling is
not a v0.5 concern.
