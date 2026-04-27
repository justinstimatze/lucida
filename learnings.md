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
   (non-empty `reflection_source_ids`)

Implemented in `orchestrator.py:closed_loop_stats()`; runs via
`python orchestrator.py --metric closed-loop`. The watcher emits the
metric on each pass that mints cells (`watcher.py:watch()`).

Seed cells and infrastructure demos (cells 0011-0013, declared
"infrastructure demo, no real snippet") are excluded from both
numerator and denominator — they are inert by design.

The metric measured against the current corpus:

```
$ python orchestrator.py --metric closed-loop
closed-loop ratio: 6/28 = 21.4%  (of 35 total; seeds & infra demos excluded)
  cell-0014: reflected_on
  cell-0015: reflected_on
  cell-0016: reflection_output
  cell-0023: retrigger
  cell-0024: retrigger
  cell-0025: retrigger
```

**Closed-loop ratio: 6 of 28 content cells = 21.4%.**

Note on omissions from the metric: a fourth criterion I considered —
"specialist follow-on" (a cell whose content is referenced by a later
classifier reasoning string) — turned out too soft to detect
mechanically without explicit ID links. cell-0028's mermaid was
suggested by cell-0016's reflection, but that lineage isn't stored
anywhere queryable. Adding it would inflate the ratio with weak
evidence. Better to keep the metric mechanical and conservative.

This is a more honest measure than "did the human go look" because it
captures what makes lucida structurally different from a folder of
illustrations: cells *produce more cells*. The infrastructure demos and
seed cells aren't penalized for being inert because they *are* inert by
design — but they also don't get to count as wins. A cell that nothing
else touches is overhead.

**Proposed v0.5 → v1 target:** closed-loop ratio ≥ 50% over the next 30
content cells (excluding infrastructure demos). Current baseline 21.4%.
If we can't break 50%, the system is a slow expensive way to log
conversations and we should fold reflection/retrigger into the
orchestrator's default path or rethink.

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

## Appendix: anchoring the "Gemini compromises" claim

Earlier in the v0.5 sprint I leaned on a vibes-claim — "the compromises
Gemini makes in image generation are themselves [structural]" — that the
slimemold framework flagged 3× without me anchoring it. This appendix is
the cataloging pass over the existing 8 PNGs in `cells/` against four
hypothesized failure modes (literal-simile / stock-drift / missed-detail
/ wrong-genre).

Five distinct snippets across 8 cells (lighthouse chain repeats one
snippet 3×, milpa repeats another 2×). Visual inspection of each PNG
against its `trigger_snippet`:

| Cell | Mode | Evidence |
|---|---|---|
| 0005 | **wrong-genre** | snippet is meta-commentary on essay craft ("the Margaret moment ... essay's emotional center"); rendered as a *literal cozy pensioner scene*. Gemini took the referent of "successful pensioner" and skipped the rhetorical frame. |
| 0010 | **literal-simile** (sharp) | "part Lourdes and part Costco" rendered with a literal "COSTCO" sign in the streetscape. The `learnings.md` body above already calls this "substrate hallucination from a simile"; same finding. |
| 0014 | **literal-simile** (color-as-object) | "bone-white corn" rendered as skeletal pale stalks with no living corn morphology, beans absent. The body-text framing emphasises the Mediterranean-village background; the foreground is the literal-simile case. |
| 0015 | none / minor | same snippet as 0014, second attempt; living milpa, woman in traditional dress, beans implied, bone-white kernels visible inside intact husks. Cross-attempt variance is itself a finding. |
| 0022 | **missed-detail** | atmospheric mill OK, but the named props (Singer machines, 1989 calendar) are absent. Eval scored 0.82 and accepted. |
| 0023–0025 | **missed-detail (persistent)** | "alternating bands of unequal width" is the named distinguishing detail in the snippet. All three attempts show ~equal-width bands; 0025 is marginally less equal. Eval@0.82 each time, retrigger fired twice, no real fix across the chain. |

### Modes evidenced vs. unsupported

- **literal-simile** — solidly anchored. Cells 0010 (metaphor) and 0014 (color-word). 2 cells, distinct sub-mechanisms (rendering the literal half of a metaphor; rendering a descriptor word as object morphology).
- **missed-detail** — solidly anchored. Cells 0022 (props), 0023–0025 (geometry). 4 cells, lighthouse chain over-weights it.
- **wrong-genre** — 1 cell (0005). Real but thin.
- **stock-drift** — *not evidenced in this corpus.* Every failure here is *specifically wrong*, not *generically wrong*. The mode I imagined from earlier-session memory does not show up against the v0.5 specialist's heavily-templated prompts. Possible explanation: stock-drift happens at low-effort prompts and the v0.5 pipeline is high-effort by construction. **Killing this mode from the taxonomy until evidence shows up.**

### Strongest single finding

The lighthouse chain (0023→0024→0025) shows that **corrective prompt text
does not reliably break a strong visual prior**, even when the prompt
includes the snippet verbatim, an explicit "bands should be unequal in
width" props line, an explicit "do NOT invent generic candy-stripe equal
bands" do-NOT-invent line, and retrigger-supplied corrective guidance.
The body-text already named the empty-guidance bug as the proximate
cause of the chain not improving; visual inspection across all three
attempts shows that even *with* meaningful guidance text, the equal-bands
prior wins. This shifts the design pressure: the real lever for named-
compromise correction is probably image-to-image edit mode (port from
`seeing/`) or model substitution, not better corrective text.

### What's still vibes after this pass

- Whether `wrong-genre` is a real recurring mode or a one-off depends on more meta-commentary snippets (only 1 cell here).
- Whether `literal-simile` rate scales with simile density in the snippet — the current cells were hand-picked.
- Whether image-to-image edit actually fixes the prior-strength problem; that's a design hypothesis until tested.

A targeted fresh batch (~$0.25, 6 generations) would tighten wrong-genre and falsify-or-confirm stock-drift. Deferred until the prior-strength implication is acted on.

### Followup: i2i edit is mode-conditional, not universal (N=5)

After porting `transform_image` from `seeing/`, ran 5 i2i tests across
the failure modes from the cataloging table above. Each used the
existing `cells/cell-XXXX.png` as the base image plus a manually-
authored corrective brief targeting the snippet's named compromise.
Outputs at `cells/cell-XXXX.i2i_test.png`; cells.json unchanged.

| Cell | Mode | Result | Score |
|---|---|---|---|
| 0023 | missed-detail (geometry) | **fixed** — bands now unequal-width | 0.82 |
| 0022 | missed-detail (named props) | **fixed** — Singer machines visible, calendar present | 0.82 |
| 0014 | literal-simile (color-as-object) | **fixed** — corn is living, beans visible | 0.82 |
| 0010 | literal-simile (metaphor) | **failed** — literal "COSTCO" sign persists despite explicit corrective text | 0.52 |
| 0005 | wrong-genre (meta-commentary) | **catastrophic** — over-corrected to a literal text card reproducing the snippet | 0.15 |

**The pattern: i2i works when the failure is a missing or distorted
concrete detail inside an otherwise-correct interpretation. It fails
when the failure is a wrong interpretation of the snippet** — because
the wrong-interpretation is baked into the base PNG and Gemini anchors
on it. The cataloging's mode taxonomy now has predictive value: the
mode determines whether i2i is the right correction strategy or makes
things worse.

This revises the earlier "i2i is the lever" finding from N=1. It is
*a* lever, but a mode-conditional one.

### Implication for Phase 2 design

A naive "use i2i whenever a previous PNG exists" wiring would have
made `cell-0005` go from score n/a (no eval at the time) to 0.15, and
`cell-0010` from n/a to 0.52. **Mode-aware gating is required, not
optional.**

Three approaches:

1. **Evaluator emits a structured `failure_mode` field** (missed-detail
   / literal-simile / wrong-genre / none). Orchestrator uses i2i only
   for missed-detail and literal-simile-color-as-object; uses fresh
   generate for literal-simile-metaphor and wrong-genre. Cleanest, but
   requires another evaluator-prompt pass and a schema change.
2. **Heuristic on `what_didnt_work` text**: if it contains tokens like
   "literal," "metaphor," "interpretation," fall back to fresh generate;
   else i2i. Cheap, brittle.
3. **Try fresh first, fall back to i2i** if fresh also fails. Most
   robust, double the cost, and would have to evaluate in a loop.

(1) is the right answer; the evaluator already does this analysis
implicitly in `what_worked` / `what_didnt_work`. Adding the structured
field is small.

**Shipped:** approach (1). `evaluator.py` now emits a `failure_mode`
field (enum: missed_detail / literal_simile_color /
literal_simile_metaphor / wrong_genre / none) and the orchestrator's
retrigger loop routes accordingly: i2i for missed_detail and
literal_simile_color, fresh text-to-image for literal_simile_metaphor,
abort retrigger entirely on wrong_genre. Flag-gated via
`LUCIDA_RETRIGGER_USE_I2I` (default on). Not yet validated end-to-end
on a fresh image cell — code review is clean but a live test on a
synthetic snippet would close the loop.

### Side findings from the mini-batch

- *Eval score saturates at 0.82 on near-success.* Three of the four
  i2i fixes (0014, 0022, 0023) all scored exactly 0.82 — once the named
  compromise lands, the eval finds a new minor nit and lands in the
  same band. This is the same finding from the lighthouse pass: the
  0.7-0.9 band is wide and any given image has *some* nit. Doesn't
  block adoption.
- *Evaluator gate fires correctly across the board.* All four
  successful and unsuccessful evals returned `should_retrigger` values
  consistent with their score — `retrigger=False` at 0.82,
  `retrigger=True` at 0.52 and 0.15. The evaluator-prompt tightening
  (this commit) is doing its job.
- *Stock-drift still unsupported.* None of the 5 i2i outputs were
  generic-and-bland; they were either correct, specifically-wrong, or
  catastrophically over-corrected. Mode stays killed.
