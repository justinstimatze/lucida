# substrate hallucination eval — 2026-04-28

Companion to audit_2026-04-27.md (image-only). Kill #3 trigger: substrate hallucination >20% of cells.

## Summary

- evaluated: 38 cells (2 vega, 13 mermaid, 23 html)
- cells with any invention: 21/38 = 55.3%
- kill #3 (>20%) tripped: **YES**
- tokens: in=66969 out=16860 cache_read=0
- est. cost: ~$0.454

## vega (2 cells, 1 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0057 | 0.40 | 2 | 2 |  | The 'after' values and the visible-cells delta are all directly supported by the snippet, but the 'before' values for trigger blocks (0) and scan lines (0) are invented — the snippet only states curre... |
| cell-0058 | 1.00 | 0 | 0 |  | All three data rows (html=3, mermaid=1, animated_svg=1) map directly to explicit counts in the snippet, and the axis title "cells in viewport" faithfully reflects the context. The caption accurately p... |

### vega inventions detail

**cell-0057** (score 0.40):
- substrate: Trigger blocks 'before' value = 0 (snippet says 'all 44 collapsed' but does not state the before value was 0)
- substrate: Scan lines 'before' value = 0 (snippet does not state a prior count of scan lines; 0 is assumed/invented)
- caption: 'substrate diversity bias' listed as one of three engineering tasks — the snippet makes no mention of substrate diversity bias
- caption: 'HTML/FUI scan-line injection' — the snippet says 'magi html scan lines active' but does not name the task 'injection' or use the label 'FUI'

## mermaid (13 cells, 8 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0003 | 0.70 | 1 | 2 |  | The substrate nodes and core edges are well-grounded in the snippet; the only minor substrate issue is the 'builds toward' edge label, which subtly conflicts with the snippet's explicit 'each step is ... |
| cell-0007 | 0.40 | 8 | 2 | yes | The snippet says only that the author intends to map the cell-persistence path in order to figure out where to thread session_id — it does not name any nodes (CellProposal, append_proposal, reflect_an... |
| cell-0008 | 1.00 | 0 | 2 |  | The mermaid substrate is clean: every node and every directed edge traces directly to the snippet. The caption introduces two minor inventions — asserting the threading is "sequential" and adding a no... |
| cell-0009 | 1.00 | 0 | 0 |  | Every node, edge, and label in the graph traces directly to an explicit claim in the snippet: watcher.py as the entry-point, transcript path stem as the source of session_id, the derivation relationsh... |
| cell-0010 | 1.00 | 0 | 0 |  | Every node label, edge verb, and data point in the graph traces directly to the snippet. The four nodes (segmenter, classifier with <0.6 threshold, orchestrator.py:616-618, text cell) and the three ed... |
| cell-0015 | 1.00 | 0 | 0 |  | Every node, edge, and label in the graph traces directly to claims in the snippet: the proportional-font measurement, the magi CSS override to Courier New, the ~15% wider-per-char figure, the foreignO... |
| cell-0030 | 0.40 | 6 | 7 | yes | The snippet provides only two grounded facts: this is item (4) in a series and it concerns inter-cell connections / how reflection cells are identified. Every other node (A, B, C, KS), every edge rela... |
| cell-0031 | 0.70 | 2 | 1 |  | The three nodes and the NR→SVG→CD chain are broadly supported by the snippet, but the node sub-labels ('full-canvas layer', 'inter-cell line renderer') and the caption's assertion of a wiring/renderin... |
| cell-0044 | 0.40 | 2 | 1 |  | The core R→P promotion driven by visual weight and connection lines is supported, but the standalone A→P edge fabricates an ambient-to-prominent relationship not attributed to reflections in the snipp... |
| cell-0045 | 0.70 | 2 | 2 |  | The substrate is largely faithful to the snippet; the two minor inventions are positional labels ('top of column', 'bottom of column') that the snippet does not assert. The caption adds two unsupporte... |
| cell-0053 | 1.00 | 0 | 0 |  | Every node label, edge, and edge verb in the graph maps directly to an explicit claim in the snippet. The causal chain (rename → stale reference → ReferenceError → silent catch → typeInto suppressed) ... |
| cell-0062 | 1.00 | 0 | 0 |  | All four nodes and all three edges trace directly to explicit claims in the snippet. The caption accurately paraphrases the same relationships without adding unsupported detail. No inventions detected... |
| cell-0065 | 0.40 | 0 | 1 |  | The substrate itself is clean — both nodes and both edges trace directly to the snippet. However, the caption invents a material claim: it asserts the updates are "part of the N-column mission control... |

### mermaid inventions detail

**cell-0003** (score 0.70):
- substrate: Edge label 'builds toward' on S1-->S2 and S2-->S3 (snippet says 'in order' and 'independently useful' but never uses the phrase 'builds toward'; minor paraphrase addition that slightly contradicts 'independently useful')
- caption: 'multi-session stream viewing in lucida' — snippet does not mention 'stream viewing' or 'lucida' as the context for this roadmap.
- caption: 'mission-control layout' — snippet says 'N-column' and 'iron-man-HUD aesthetic' but never uses the phrase 'mission-control layout'.

**cell-0007** (score 0.40):
- substrate: Node: CellProposal data structure
- substrate: Node: append_proposal function
- substrate: Node: reflect_and_persist function
- substrate: Node: watcher function
- substrate: Edge: SID -.threads through.-> CP (session_id threads through CellProposal)
- substrate: Edge: CP -.passes into.-> AP (CellProposal passes into append_proposal)
- substrate: Edge: AP -.passes into.-> RP (append_proposal passes into reflect_and_persist)
- substrate: Edge: RP -.passes into.-> W (reflect_and_persist passes into watcher)
- caption: The chain CellProposal → append_proposal → reflect_and_persist → watcher is stated as the cell-persistence path
- caption: session_id needs to be threaded through each stage of that specific chain

**cell-0008** (score 1.00):
- caption: caption states the threading is 'sequential' — the snippet implies a chain but does not explicitly assert sequentiality as an ordering constraint
- caption: caption states these are 'three touch-points that must all receive the new field' — the normative 'must' is not stated in the snippet

**cell-0030** (score 0.40):
- substrate: Node A: 'reverse-chronological cell feed' — not mentioned in snippet.
- substrate: Node B: 'peripheral-to-center bloom animation' — not mentioned in snippet.
- substrate: Node C: 'magi-flavored CSS glow styling' — not mentioned in snippet.
- substrate: Node KS: 'kill-state hook' — not mentioned in snippet.
- substrate: Edge: B -.wired to.-> KS — relationship not stated in snippet.
- substrate: Edge: D -.starts from.-> RC — 'starts from' framing is an invention; snippet only says connections are being looked at re: how reflection cells are identified, not that D starts from RC as a directed dependency.
- caption: 'reverse-chronological cell feed' as feature 1 — not in snippet.
- caption: 'peripheral-to-center bloom animation' as feature 2 — not in snippet.
- caption: 'bloom animation tied to a kill-state hook' — not in snippet.
- caption: 'CSS glow styling' as feature 3 — not in snippet.
- caption: 'magi-flavored' qualifier — not in snippet.
- caption: 'Four incremental UI/notebook features in a developer's working log' — the snippet only introduces item 4; items 1–3 are entirely invented.
- caption: 'the fourth feature begins by examining how reflection cells are identified' — this part is supported by the snippet.

**cell-0031** (score 0.70):
- substrate: SVG overlay element described as 'full-canvas layer' (snippet does not state this)
- substrate: connection drawer described as 'inter-cell line renderer' (snippet does not state this)
- caption: connection drawer is 'wired to the SVG layer to render inter-cell connections' — the wiring/rendering relationship is not stated in the snippet

**cell-0044** (score 0.40):
- substrate: Edge: A (ambient tier) -- 'source tier for promotion' --> P (prominent tier). The snippet states reflections move from ambient to prominent; it does not assert a standalone ambient→prominent relationship or label ambient as a 'source tier for promotion' independent of reflections.
- substrate: Node: R -- 'auto-promote via visual weight' --> P as a separate edge from R -- 'auto-promote via connection lines' --> P. The snippet combines both signals into one compound mechanism; splitting them into two parallel directed edges implies they are independent promotion paths, which the snippet does not state.
- caption: 'break the recency-based demotion pattern' — the snippet makes no mention of a recency-based demotion pattern; this is an invention.

**cell-0045** (score 0.70):
- substrate: H node label: 'top of column' — snippet says hero is part of the column but does not specify positional placement (top)
- substrate: A node label: 'bottom of column' — snippet says ambient is part of the column but does not specify positional placement (bottom)
- caption: 'existing three-tier hierarchy' — snippet references 'step 3' but does not describe it as a three-tier hierarchy
- caption: 'concurrent sessions' — snippet says 'each session' but does not explicitly use the word 'concurrent'

**cell-0065** (score 0.40):
- caption: the updates are part of the N-column mission control layout feature

## html (23 cells, 12 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0001 | 1.00 | 0 | 0 |  | Every cell value, label, and empty cell in the table traces directly to claims in the snippet. The caption accurately characterizes the table's scope and the deliberate use of empty cells for underspe... |
| cell-0011 | 0.70 | 1 | 0 |  | The table is largely faithful to the snippet. One minor invention: labeling Option 1's aggressiveness as "Moderate" — the snippet never assigns Option 1 a relative aggressiveness tier; it only says Op... |
| cell-0012 | 0.40 | 5 | 3 |  |  |
| cell-0013 | 1.00 | 0 | 0 |  | Every cell value in the table traces directly to the snippet: React Flow's primary unit (node), layout paradigm (manipulable graph), and core interaction strengths (drag nodes, connect them, custom no... |
| cell-0014 | 0.40 | 5 | 1 |  | The table's two core facts (React Flow needs React + a build pipeline; the shift is major; the current vanilla-JS + IntersectionObserver model is working well) are grounded in the snippet, but several... |
| cell-0023 | 1.00 | 0 | 1 |  | Every cell value in the table traces directly to the snippet: both-wins, Iron HUD brand alignment for bloom, structural meaning and reflection-chain visibility for connections, and empty cells where t... |
| cell-0025 | 0.70 | 2 | 2 |  | The HTML table itself is largely clean — cell IDs, types, and caption excerpts trace directly to the snippet. However, the inline prose body invents two specific row-name labels ('brand alignment' and... |
| cell-0026 | 1.00 | 0 | 0 |  | Every row label, item description, and pass condition in the table maps directly to one of the four explicitly enumerated checklist items in the snippet. The caption's characterization as a "four-poin... |
| cell-0034 | 0.70 | 1 | 1 |  | The three data rows map cleanly to the snippet's three URLs, with content descriptions accurately paraphrased. However, the 'Session-scoped' label in the Scope column is invented — the snippet only su... |
| cell-0035 | 1.00 | 0 | 0 |  | Every cell, row label, and column label in the table traces directly to an explicit claim in the snippet. The caption accurately characterizes the scope of the changes without adding unsupported detai... |
| cell-0036 | 0.40 | 7 | 4 |  | The table's row labels (cell IDs) and type/caption columns contain several invented claims — notably the detailed captions for cell-0031 and cell-0032 assert specific DOM anchoring behavior and scroll... |
| cell-0037 | 1.00 | 0 | 0 |  | Every row label and cell value in the table maps directly to an explicit claim in the snippet — interaction trigger, view effect, dismiss action, deep-link format, shareability context, estimated scop... |
| cell-0038 | 0.40 | 8 | 1 | yes | The snippet describes exactly one feature (Session-discovery dropdown); the other two columns ('Per-cell focus mode' and 'Multi-stream mission control') and all their cell values are entirely fabricat... |
| cell-0039 | 0.40 | 4 | 0 | yes | The snippet exclusively describes Step 3 (multi-stream mission control); it names no other steps, assigns no labels like 'Per-cell focus mode' or 'Session-discovery dropdown', and provides no attribut... |
| cell-0043 | 1.00 | 0 | 0 |  | Every atomic claim in the table — tier names, cell ranges, width, size, visual treatment, and layout values — traces directly to the snippet. Empty cells are correctly left blank where the snippet gen... |
| cell-0047 | 0.00 | 10 | 3 | yes | The snippet contains exactly two claims — no clicks are needed, and the layout conveys information — neither of which names any tier (hero/transitional/ambient), any recency ranking, any animation, an... |
| cell-0048 | 0.40 | 4 | 3 |  |  |
| cell-0049 | 1.00 | 0 | 0 |  | Every cell value in the table — column count (2), column width (484px each), grid rule (minmax(380px, 1fr)), paths rendered (2, in-viewport pairs only), path style (vertical/S-curves at correct coordi... |
| cell-0052 | 1.00 | 0 | 0 |  | Every atomic claim in the table substrate traces directly to the snippet: all four cell IDs, before/after heights, cap rule (55vh), overflow class values, and fade gradient presence/absence are verbat... |
| cell-0054 | 1.00 | 0 | 0 |  | Every cell value, row label, column label, and caption claim traces directly back to the snippet. The table cleanly maps all stated facts — the 507px hero height, the 762px below-HUD space, the 2-cell... |
| cell-0055 | 1.00 | 0 | 0 |  | Every row and cell value in the table maps directly to a claim in the snippet: the CSS-only framing, the FUI goal, and all four named techniques (animated row reveals, amber scan line, border glow, le... |
| cell-0059 | 0.40 | 3 | 3 |  | The HTML table's row data (cell IDs, types, caption excerpts) is largely DIRECT or paraphrased from the snippet, but the 'worked/didn't/proposed next' prose blocks introduce several material invention... |
| cell-0067 | 1.00 | 0 | 0 |  | Every atomic cell value in the table traces directly back to the snippet. Numeric values (47, 4, 35px), layout descriptor (flex-row / side-by-side), live-stream status, and HUD compression are all DIR... |

### html inventions detail

**cell-0011** (score 0.70):
- substrate: Aggressiveness row label 'Moderate' for Option 1 — snippet does not assign a relative aggressiveness label to Option 1; it only calls Option 2 'most aggressive'

**cell-0012** (score 0.40):
- substrate: cell-0007 caption: 'session_id needing to be thread' — snippet does not state that cell-0007 itself mentions session_id needing to be threaded; that detail belongs to cell-0008
- substrate: cell-0008 caption: 'three touch-points' — the snippet says the three touch-points are append_proposal, reflect_and_persist, and watcher, but does NOT state cell-0008 explicitly labels them as 'three touch-points' in its caption/content
- substrate: cell-0009 caption: '--ses' (truncated flag name) — snippet says '--ses' flag exists but the full flag name is not given; minor truncation invention
- substrate: cell-0010 caption: 'orchestrator' truncated — the caption cuts off before citing orchestrator.py:616-618, which the snippet does support, so the truncation itself is not an invention but the implied completeness is misleading
- substrate: cell-0007 caption claims the chain is 'CellProposal → append_proposal → reflect_and_persist → watcher' as a 'cell-persistence path' — the snippet attributes this topology to BOTH 0007 and 0008 as near-duplicates, but the caption assigns the session_id threading detail specifically to 0007, which the snippet says is 0008's refinement
- caption: Caption states 'two suppression fixes (cell 11)' comparing Option 1 vs Option 2 — the snippet does support this, so NOT invented
- caption: Caption says 'classifier threshold' is one of the two intertwined threads — the snippet supports this via the low-confidence classifier and the proposed <0.6 threshold, so NOT invented
- caption: No materially invented claims found in the caption itself

**cell-0014** (score 0.40):
- substrate: Row 'Runtime dependencies', cell 'Vanilla-JS + IntersectionObserver': 'none beyond browser APIs' — the snippet never characterises the dependency footprint of the current approach; it only names the technology.
- substrate: Row 'Architectural model', cell 'React Flow': 'component-based / React paradigm' — the snippet says 'React + a build pipeline' but never uses the label 'component-based' or 'React paradigm'.
- substrate: Row 'Architectural model', cell 'Vanilla-JS + IntersectionObserver': 'vanilla JS' — the snippet names the full stack 'vanilla-JS-with-IntersectionObserver'; stripping it to just 'vanilla JS' drops a named entity, but more critically the cell label omits IntersectionObserver which is the technology actually named in the snippet.
- substrate: Row 'Current status', cell 'React Flow': 'proposed' — the snippet never states React Flow is 'proposed'; it only frames it as a hypothetical adoption scenario.
- substrate: Row 'Architectural shift required', cell 'Vanilla-JS + IntersectionObserver': 'none (incumbent)' — the snippet states no shift is required for the current approach, but the parenthetical '(incumbent)' is an editorial addition not present in the snippet.
- caption: 'Empty cells where the snippet underspecifies a dimension for that approach' — there are no empty cells in the table, making this claim directly false and misleading.

**cell-0023** (score 1.00):
- caption: trade-offs before direction choice — the snippet does not frame this as a trade-off or pre-decision comparison; it presents both as wins with different qualities

**cell-0025** (score 0.70):
- substrate: cell-0020 caption in table reads 'all the rendering plumbing solid' — the snippet says 'solid' but the table silently truncates cell-0021 and cell-0022 captions mid-sentence with no ellipsis indicator, potentially misrepresenting completeness (minor framing issue, not a factual invention)
- substrate: The 'worked / didn't / proposed next' body prose asserts cell-0023 leaves 'brand alignment' row empty for inter-cell connections and 'structural meaning' empty for bloom — these specific row-name labels ('brand alignment', 'structural meaning') do not appear in the trigger snippet and are invented column/row identifiers
- caption: Caption states 'Wakisaka reflection loop' — the name 'Wakisaka' does not appear anywhere in the trigger snippet and is an invented proper noun / attribution
- caption: Caption describes the arc as 'status check → two animated FUI artifacts built → a comparison table weighing them → a deferral note' — this sequencing is broadly supported, but 'status check' as a label for cell-0020 is a paraphrase not explicitly stated (minor)

**cell-0034** (score 0.70):
- substrate: 'Session-scoped' label applied to both localhost:8766/?session=lucida_live and localhost:8766/?session=untagged — the snippet never uses the term 'Session-scoped'; it only labels the first as 'unscoped' and implies the others are filtered but does not coin a scope label for them
- caption: 'Three canonical test URLs validating session-filter behavior' — the snippet does not describe these as 'canonical test URLs' or frame them as 'validating session-filter behavior'; this framing is editorially invented

**cell-0036** (score 0.40):
- substrate: cell-0031 caption claim: 'SVG overlay element is anchored to the notebook root in the DOM body' — not stated in the snippet
- substrate: cell-0031 caption claim: 'connection drawer is then wired to the SVG layer to render int[eractions]' — not stated in the snippet
- substrate: cell-0032 type 'animated_svg' — not stated in the snippet; the snippet does not name this cell type
- substrate: cell-0032 caption claim: 'Scroll + resize event hooks (left) feed signal flow via dashed lines into the draw-connections function (center), which fires and re-renders' — not stated in the snippet
- substrate: cell-0033 caption claim: 'The filter principle is now memory; the implementation already follows it' — this is a paraphrase of the snippet but the specific framing 'is now memory' is an interpretive invention beyond what the snippet states
- substrate: cell-0034 caption claim: 'unscoped default vs. two scoped session views' — the snippet mentions three URLs but does not specify 'unscoped default vs. two scoped session views' breakdown
- substrate: cell-0035 caption claim: 'SESSION slot display logic and kill-gauge scoping' — partially supported, but the specific framing 'HUD UI changes' is an invention; the snippet only says 'HUD UI changes from session-filter implementation'
- caption: 'From implementation mechanics (SVG overlay wiring, scroll/resize hooks)' — SVG overlay wiring and scroll/resize hooks are asserted as established facts about cells 0031–0032, but the snippet does not confirm these details
- caption: 'The thread is now squarely about the live-viewer's session-filter feature' — 'live-viewer' is an invented label not present in the snippet
- caption: 'what it does, how its UI exposes it, and how its scoping rules behave in practice' — characterizes the last three cells in specific behavioral terms not directly supported by the snippet
- caption: 'The last three cells are all behavioral/state documentation of a working system' — 'working system' and 'behavioral/state documentation' are interpretive claims not traceable to the snippet

**cell-0038** (score 0.40):
- substrate: Column: 'Per-cell focus mode' — not mentioned in the snippet
- substrate: Column: 'Multi-stream mission control' — not mentioned in the snippet
- substrate: Row cell Scope/size for 'Per-cell focus mode': 'small' — invented, snippet says nothing about this feature
- substrate: Row cell Step for 'Per-cell focus mode': 'step 1' — invented, snippet says nothing about this feature
- substrate: Row cell Step for 'Session-discovery dropdown': 'step 2 / toward step 3' — snippet says 'small step toward step 3', not 'step 2 / toward step 3'; labelling it as step 2 is an invention
- substrate: Row cell Scope/size for 'Multi-stream mission control': 'big (sprint)' — invented, snippet says nothing about this feature
- substrate: Row cell Step for 'Multi-stream mission control': 'step 3' — invented, snippet says nothing about this feature
- substrate: Row 'Role' for 'Session-discovery dropdown': 'bridge / prerequisite' — snippet says 'makes step 2 discoverable', not 'bridge / prerequisite'; the framing is an invention
- caption: 'Three feature options compared' — the snippet describes only one feature (Session-discovery dropdown); the other two columns are entirely invented

**cell-0039** (score 0.40):
- substrate: Column header 'Per-cell focus mode' — the snippet does not name or describe any step called 'Per-cell focus mode'
- substrate: Column header 'Session-discovery dropdown' — the snippet does not name or describe any step called 'Session-discovery dropdown'
- substrate: Row cell Step=1 for 'Per-cell focus mode' — the snippet does not assign a step number to any feature called 'Per-cell focus mode'
- substrate: Row cell Step=2 for 'Session-discovery dropdown' — the snippet does not assign a step number to any feature called 'Session-discovery dropdown'

**cell-0047** (score 0.00):
- substrate: Column label: hero
- substrate: Column label: transitional
- substrate: Column label: ambient
- substrate: Row: recency rank — most recent / middle / oldest
- substrate: Row: information visibility — full / foregrounded / partial / background
- substrate: Row: click required — no / no / no (the source supports 'no clicks' generically but assigning it across three named tiers is invented)
- substrate: Row: reflections auto-promoted — yes (for hero)
- substrate: Row: demotion trigger — new cell creation (for hero and transitional)
- substrate: Row: demotion animation — FLIP cascade (for hero and transitional)
- substrate: Row: column composition — multi-stream (for hero and transitional)
- caption: Three-tier recency hierarchy: hero / transitional / ambient
- caption: All tiers are always visible
- caption: Empty cells where the snippet underspecifies a dimension for that tier

**cell-0048** (score 0.40):
- substrate: caption column cell for cell-0043 truncates mid-sentence ('hero layo') — the truncation itself is not an invention, but the table presents this truncated caption as if it is the full caption claim, which misrepresents the source
- substrate: caption column cell for cell-0044 truncates mid-sentence ('visual weight ') — same representation issue
- substrate: caption column cell for cell-0045 truncates mid-sentence ('existing thre') — same
- substrate: caption column cell for cell-0047 truncates mid-sentence ('the snippe') — same
- caption: The caption describes cell-0046 as covering 'animation mechanic' — the snippet supports this, no invention.
- caption: The caption claims 'layout itself is the information channel, not interaction' — this is an interpretive synthesis not explicitly stated in the snippet; it is a plausible inference but goes beyond what the snippet directly asserts.
- caption: The caption describes the five cells as collectively describing 'a single coherent system' — this is an editorial judgment not directly stated in the snippet, which notes the cells are near-duplicate and have gaps.

**cell-0059** (score 0.40):
- substrate: tbody row for cell-0054: caption truncated text 'leaving only' — the snippet states hero at 507px and 762px below HUD but the table caption implies a numeric remainder that is not stated in the snippet
- substrate: tbody row for cell-0055: label 'Read 1 of 3' — snippet says 'Read 1 of 3' in the cell-0055 caption excerpt, this is passable, but the truncation '…Only one approa' invents an implied continuation not verifiable
- substrate: tbody row for cell-0056: label 'Task 2 of 3' — snippet uses this phrasing in the cell-0056 caption excerpt, acceptable; however the truncated tail is unverifiable
- caption: 'the last 5 cells are all about the notebook's own layout density, FUI styling, and substrate diversity' — this is a synthesis claim; while supportable from the individual cell descriptions, it is an editorial generalization not directly stated in the snippet
- caption: 'cells 54-58 are engineering telemetry for that goal, not content about any external subject' — 'engineering telemetry' framing is an interpretive label not present in the snippet
- caption: 'the thread being pulled is make the notebook feel alive and varied' — this motivational framing is not stated in the snippet; it is an authorial inference
