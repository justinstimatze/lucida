# substrate hallucination eval — 2026-04-28

Companion to audit_2026-04-27.md (image-only). Kill #3 trigger: substrate hallucination >20% of cells.

## Summary

- evaluated: 66 cells (5 vega, 26 mermaid, 35 html)
- cells with any invention: 41/66 = 62.1%
- kill #3 (>20%) tripped: **YES**
- tokens: in=143127 out=29912 cache_read=0
- est. cost: ~$0.878

## vega (5 cells, 3 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0057 | 0.40 | 2 | 2 |  | The 'after' values for all three metrics are correctly sourced from the snippet, and the before-state for visible cells (4→5) is also explicit. However, the 'before' values for trigger blocks and scan... |
| cell-0058 | 1.00 | 0 | 0 |  | All three data rows (html=3, mermaid=1, animated_svg=1) are directly stated in the snippet, and the caption faithfully paraphrases both the counts and the diversity-bias behaviour. No inventions detec... |
| cell-0068 | 0.40 | 2 | 2 | yes | The 'Clean: 19' bar is a material invention — the snippet only says ~7 of 26 were flagged mid-run; it does not state the remaining 19 are clean, only that evaluation was partial. The caption also inve... |
| cell-0069 | 1.00 | 0 | 0 |  | All atomic claims in both the Vega-Lite spec and the caption trace directly back to the snippet. The two data rows (27% invention rate, 20% kill threshold), the axis title, and the bar labels are all ... |
| cell-0105 | 0.70 | 1 | 1 |  | The two data rows (Prior audit: $0.43/36 cells; Current estimate: $0.73/61 cells) are all DIRECT from the snippet, and the caption faithfully paraphrases it. The only non-snippet element is the axis s... |

### vega inventions detail

**cell-0057** (score 0.40):
- substrate: before=0 for 'Trigger blocks collapsed' (snippet states 44 collapsed now but gives no prior count; 0 is invented)
- substrate: before=0 for 'Scan lines active' (snippet states 21 active now but gives no prior count; 0 is invented)
- caption: 'substrate diversity bias' as a third engineering task — the snippet mentions no such task
- caption: 'HTML/FUI scan-line injection' label — snippet says 'magi html scan lines', not 'HTML/FUI'; 'FUI' is invented detail

**cell-0068** (score 0.40):
- substrate: 'Clean' row with cells = 19: the snippet states ~7 of 26 were flagged but does NOT state the remaining cells were clean — they are unaudited/unevaluated at point of partial run
- substrate: x-axis title 'cells (of 26 evaluated)': the 26 figure refers to total cells, not all of which were necessarily evaluated and clean; pairing it with a 'Clean' bar of 19 implies 26 were fully resolved
- caption: 'Remaining cells were unaudited at point of failure' — the snippet does not mention a 'crash' or 'point of failure'; it says 'mid-run partial'
- caption: 'at crash' — the snippet does not mention a crash

**cell-0105** (score 0.70):
- substrate: x-axis scale domain upper bound of 0.85 (snippet provides no scale range; minor but not stated)
- caption: 'original greenlight threshold' implies a specific named threshold value; snippet says 'above the original greenlight' but never names it a 'threshold' — minor framing addition, not a numeric invention

## mermaid (26 cells, 17 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0003 | 0.70 | 1 | 2 |  | The three nodes and their labels are all DIRECT from the snippet, and the HUD node with 'earns its keep' is DIRECT. The edge label 'builds toward' is a minor invention (the snippet implies order but d... |
| cell-0007 | 0.40 | 8 | 2 | yes | The snippet is a single-sentence intent statement — it names only session_id and the abstract concept of a "cell-persistence path," providing no named nodes, no functions, and no explicit edges. Every... |
| cell-0008 | 1.00 | 0 | 0 |  | Every node, edge, and label in the graph traces directly to the snippet. The caption accurately restates the snippet's claims without adding any unsupported detail. No inventions detected. |
| cell-0009 | 1.00 | 0 | 0 |  | Every node, edge, and label in the graph traces directly to the snippet: watcher.py as the entry-point, transcript path stem as the source of session_id, the derivation relationship, plumbing through,... |
| cell-0010 | 1.00 | 0 | 0 |  | Every node label, edge verb, and caption claim traces directly to the snippet. The four nodes (segmenter, classifier with <0.6 threshold, orchestrator.py:616-618, emitted text cell) and all three edge... |
| cell-0015 | 1.00 | 0 | 0 |  | Every node label, edge verb, and data point in the graph traces directly to the snippet. The caption accurately restates the root-cause chain without adding unsupported claims. No inventions detected. |
| cell-0030 | 0.40 | 8 | 4 | yes | The snippet provides only a single atomic claim: feature (4) concerns inter-cell connections, and the current work is examining how reflection cells are identified. The graph invents three additional ... |
| cell-0031 | 0.70 | 3 | 1 | yes | The snippet names three entities (notebook root, SVG overlay, connection drawer) and one explicit relationship (notebook root located in body), but does not state how the SVG overlay and connection dr... |
| cell-0044 | 0.40 | 3 | 1 |  | The substrate correctly captures the two promotion signals (visual weight, connection lines) and the ambient→prominent direction for Reflections, but adds a spurious standalone ambient→prominent edge ... |
| cell-0045 | 0.70 | 2 | 1 |  | The core graph structure is well-supported by the snippet, but two node labels add positional details ('top of column', 'bottom of column') that the snippet never states, and the caption invents the c... |
| cell-0053 | 1.00 | 0 | 0 |  | Every node label, edge, and caption claim traces directly back to the snippet. No inventions detected anywhere in the substrate or caption; the causal chain is faithfully and completely represented. |
| cell-0062 | 1.00 | 0 | 0 |  | All four nodes and all three edges in the graph trace directly to claims in the snippet. The caption faithfully paraphrases those same relationships without adding unsupported detail. No inventions de... |
| cell-0065 | 0.40 | 0 | 1 |  | The mermaid substrate is clean — both nodes and both edges trace directly to the snippet. However, the caption invents a specific motivating feature ("N-column mission control layout feature") that th... |
| cell-0071 | 1.00 | 0 | 0 |  | Every node, edge, and label in the graph traces directly to the snippet: the gate/unblocking relationship, the three named candidates, the adapter script filename pattern, and the multi-stream composi... |
| cell-0072 | 0.70 | 1 | 0 |  | The graph's structural claims (cells as 2D containers, the five named substrates with their 2D/3D classifications, connection lines as 2D paths in fixed-viewport space, and the containment/hosting rel... |
| cell-0078 | 0.40 | 4 | 0 | yes | The snippet describes a single, combined swap (OrthographicCamera → PerspectiveCamera + WebXR) as one mechanical step to reach VR mode. The graph misrepresents this by splitting PerspectiveCamera and ... |
| cell-0083 | 0.70 | 1 | 1 |  | The graph is largely clean and well-grounded in the snippet. One minor edge-direction/label nuance exists (TZ 'not accounted for by' TJS slightly inverts the snippet's framing), and the caption adds '... |
| cell-0085 | 1.00 | 0 | 0 |  | Every node, edge, and numeric value in the graph traces directly to the snippet: the five stubs below cell-0082, X=507, the saturated green bar, startY=1004, viewport=967, and canvas extending past th... |
| cell-0087 | 1.00 | 0 | 0 |  | Every node, edge, and label in the graph traces directly back to the snippet: the load() function, the prepend loop, the isMultiStream() check, the multi-stream branch re-running the prepend, and the ... |
| cell-0090 | 0.70 | 1 | 1 |  | The graph is almost entirely clean — all five nodes, their order, the biggest-leverage label, and the conditional dashed edge for liveAppend are all directly supported by the snippet. The one minor in... |
| cell-0092 | 0.40 | 2 | 2 | yes | The snippet supports only three claims: rerenderNotebook is the patch target, observers are disconnected, and disconnection happens before the DOM nuke. The graph invents a specific observer type (Int... |
| cell-0093 | 0.40 | 0 | 1 |  | The mermaid graph itself is fully clean — every node label and every edge traces directly to the snippet. However, the caption invents a specific commit hash ("9e51764") that does not appear anywhere ... |
| cell-0097 | 0.40 | 2 | 2 |  | The three core nodes (A, B, C) and their edges faithfully reflect the snippet, but Node D and its incoming edge fabricate a causal consequence — a 'green bar artifact' — that the snippet never mention... |
| cell-0099 | 0.40 | 7 | 2 | yes | The snippet is a terse fix instruction with three atomic claims (drop inline style, let CSS handle displayed size, update buffer on resize); the graph invents a central 'floating green bar artifact' n... |
| cell-0103 | 0.40 | 3 | 1 |  | The overall graph structure (1a+1b → 3 → 2) faithfully mirrors the snippet, but three node labels append implementation details not found in the snippet ('loadHud/pollAll/updateHud', 'adapter wiring',... |
| cell-0104 | 0.70 | 1 | 1 |  | The two split edges (LH → PA, LH → UH) and all node labels are directly supported by the snippet. However, the third edge (PA --feeds--> UH) and its caption echo are an inference — the snippet says th... |

### mermaid inventions detail

**cell-0003** (score 0.70):
- substrate: Edge label 'builds toward' on S1→S2 and S2→S3 — the snippet implies sequential ordering but never uses this phrase or any explicit dependency verb between the steps; the snippet only lists them in order and says each is independently useful, which could argue against a strict 'builds toward' dependency framing
- caption: 'multi-session stream viewing' — the snippet never mentions streams or multi-session viewing as the purpose; it describes the build order abstractly
- caption: 'mission-control layout' — the snippet only says 'N-column'; 'mission-control' is an embellishment not present in the snippet

**cell-0007** (score 0.40):
- substrate: Node: CellProposal (data structure) — snippet does not name this entity
- substrate: Node: append_proposal (function) — snippet does not name this entity
- substrate: Node: reflect_and_persist (function) — snippet does not name this entity
- substrate: Node: watcher (function) — snippet does not name this entity
- substrate: Edge: SID -.threads through.-> CP — specific threading relationship to CellProposal not stated in snippet
- substrate: Edge: CP -.passes into.-> AP — relationship between CellProposal and append_proposal not stated in snippet
- substrate: Edge: AP -.passes into.-> RP — relationship between append_proposal and reflect_and_persist not stated in snippet
- substrate: Edge: RP -.passes into.-> W — relationship between reflect_and_persist and watcher not stated in snippet
- caption: Chain CellProposal → append_proposal → reflect_and_persist → watcher — none of these named stages appear in the snippet
- caption: session_id needing to be threaded through each stage — the snippet only says 'where to thread session_id', not that it threads through all of these specific named stages

**cell-0030** (score 0.40):
- substrate: Node A: 'reverse-chronological cell feed' — not mentioned in snippet
- substrate: Node B: 'peripheral-to-center bloom animation' — not mentioned in snippet
- substrate: Node C: 'magi-flavored CSS glow styling' — not mentioned in snippet
- substrate: Node KS: 'kill-state hook' — not mentioned in snippet
- substrate: Edge B -.wired to.-> KS — relationship not mentioned in snippet
- substrate: Edge D -.starts from.-> RC — the direction/verb 'starts from' is not stated; only 'looking at how reflection cells are currently identified' is stated
- substrate: Node D label 'SVG overlay system' — SVG is not mentioned in snippet; only 'inter-cell connections' is mentioned
- substrate: The framing of four numbered features (1–4) with nodes A, B, C, D — only feature 4 is referenced in the snippet
- caption: 'a cell feed' (feature 1) — not in snippet
- caption: 'a bloom animation tied to a kill-state hook' (feature 2) — not in snippet
- caption: 'CSS glow styling' (feature 3) — not in snippet
- caption: 'the fourth feature begins by examining how reflection cells are identified' — this paraphrase is broadly supported, though 'begins by' is a slight invention; 'SVG overlay system' label is invented

**cell-0031** (score 0.70):
- substrate: SVG overlay element described as 'full-canvas layer'
- substrate: connection drawer described as 'inter-cell line renderer'
- substrate: SVG --> CD edge (the snippet does not state a relationship between the SVG overlay and the connection drawer)
- caption: 'wired to the SVG layer to render inter-cell connections' — the snippet does not state the connection drawer is wired to SVG or that it renders inter-cell connections

**cell-0044** (score 0.40):
- substrate: Edge: A (ambient) -- 'source tier for promotion' --> P (prominent) — the snippet describes the promotion path as Reflections moving from ambient to prominent; it does not assert a standalone ambient→prominent relationship independent of Reflections. This edge implies a general tier-escalation pathway between ambient and prominent that the snippet does not state.
- substrate: Node R is labeled 'reflections\ncell type' — the snippet does not call Reflections a 'cell type'; that label addition is an invented descriptor not present in the snippet.
- substrate: Node A is labeled 'ambient\ntier' and Node P is labeled 'prominent\ntier' — calling these 'tiers' is a minor paraphrase not directly supported by the snippet, which only uses the words 'ambient' and 'prominent' without the word 'tier'.
- caption: 'break the recency-based demotion pattern' — the snippet makes no mention of a recency-based demotion pattern; this is an invented claim not present in the snippet.

**cell-0045** (score 0.70):
- substrate: H node label: 'hero\ntop of column' — the snippet says hero is part of the column but does NOT specify it is at the top
- substrate: A node label: 'ambient\nbottom of column' — the snippet says ambient is part of the column but does NOT specify it is at the bottom
- caption: 'existing three-tier hierarchy' — the snippet never describes step 3 as a three-tier hierarchy; it only names it 'step 3'

**cell-0065** (score 0.40):
- caption: the updates are part of an 'N-column mission control layout feature'

**cell-0072** (score 0.70):
- substrate: L node label addition: 'co-evolving notebook interface' — the snippet never describes lucida as a 'co-evolving notebook interface'; it only says lucida 'already lives in the mix'

**cell-0078** (score 0.40):
- substrate: Edge: PC --'+ swap to'--> XR (implies PerspectiveCamera sequentially swaps to WebXR; snippet treats PerspectiveCamera + WebXR as a combined simultaneous swap target, not a chain)
- substrate: Edge: PC --> VR (PerspectiveCamera alone leads to VR mode; snippet does not state PerspectiveCamera independently enables VR — it is PerspectiveCamera + WebXR together)
- substrate: Node label: PC labeled 'VR prerequisite' — snippet does not characterize PerspectiveCamera as a prerequisite; it is part of a combined swap
- substrate: Node label: XR labeled 'VR runtime' — snippet does not use the term 'VR runtime' or characterize WebXR this way

**cell-0083** (score 0.70):
- substrate: Edge label 'not accounted for by' on TZ --> TJS: the snippet says Three.js lines don't account for hero's Z, but the causal arrow goes from translateZ directly to Three.js anchors; more precisely the snippet says the anchors fail to account for the Z, making the direction of the edge slightly misleading/invented — minor, but the snippet frames it as a property of the anchors, not a direct action of translateZ on the anchors
- caption: 'viewport-edge clipping' — the snippet says the cell is pushed into the viewport-edge region, but never uses the word 'clipping'; this is an added inference not explicitly stated

**cell-0090** (score 0.70):
- substrate: GB node label includes '(CSS bug)' — the snippet does not characterize the green bar fix as a CSS bug
- caption: Caption describes the green bar fix as 'CSS green-bar fix' — snippet does not identify it as a CSS bug

**cell-0092** (score 0.40):
- substrate: Node label: 'IntersectionObserver\nlifecycle cleanup' — the snippet says 'observers' generically; 'IntersectionObserver' is a specific type not stated in the snippet
- substrate: Edge: 'IO -.governs.-> RN' — no governing relationship between any observer type and rerenderNotebook is stated in the snippet
- caption: 'IntersectionObservers' — the snippet says 'observers', not specifically IntersectionObservers
- caption: 'step two of the two-step observer cleanup sequence' — the snippet makes no mention of a multi-step sequence or that this is step two of anything

**cell-0093** (score 0.40):
- caption: commit 9e51764 — no commit hash is mentioned in the snippet

**cell-0097** (score 0.40):
- substrate: Node D label 'stale inline style remains after resize / root cause of green bar artifact' — the snippet never mentions a 'green bar artifact'; no causal link to any visual artifact is stated
- substrate: Edge A -->|'causes'| D — the snippet does not state that the stale inline style causes any artifact; this causal relationship is invented
- caption: 'floating green bar artifact' — the snippet does not mention any green bar or visual artifact
- caption: 'leaving a stale dimension that produces the artifact' — causal link to an artifact is not stated in the snippet

**cell-0099** (score 0.40):
- substrate: IS node label: 'initial viewport size (stale on resize)' — snippet does not describe what the inline style contains or that it captures viewport size
- substrate: IS node label: 'stale on resize' — snippet implies staleness by saying to drop it, but never states this explicitly as a property of the inline style
- substrate: GB node: 'floating green bar artifact' — snippet never mentions a green bar, a floating element, or any visual artifact
- substrate: IS --causes--> GB edge — snippet does not state the inline style causes a green bar artifact
- substrate: IS --drop--> CSS edge — direction/verb is misleading; snippet says drop IS and let CSS handle size, not that IS 'drops to' CSS
- substrate: CSS --handles--> GB edge — snippet says CSS handles displayed size, not that it handles/fixes the green bar artifact
- substrate: BUF --updated on--> GB edge — snippet says buffer is updated on resize, not that buffer acts on a green bar artifact
- caption: 'the stale inline style causes the green bar artifact' — snippet never mentions staleness of inline style as a described property, nor any green bar artifact
- caption: 'Root-cause and fix map' — the snippet describes a fix, not a diagnosed root cause of a named artifact

**cell-0103** (score 0.40):
- substrate: Node A label: 'decouple loadHud into pollAll + updateHud' — the snippet says only 'decouple'; 'loadHud', 'pollAll', and 'updateHud' are not mentioned.
- substrate: Node D label: 'multi-assistant adapter wiring' — the snippet says only 'multi-assistant'; 'adapter wiring' is not mentioned.
- substrate: Node B label: 'mermaid CSS consolidation to theme tokens' — the snippet says 'mermaid CSS consolidation'; 'to theme tokens' is not mentioned.
- caption: Caption says 1a and 1b 'run in parallel' — the snippet says 'done together', which does not explicitly assert parallelism vs. sequential co-grouping.

**cell-0104** (score 0.70):
- substrate: Edge: PA --feeds--> UH (the snippet states loadHud is split into pollAll + updateHud so layering is explicit, but does not explicitly state that pollAll feeds into updateHud as a directed data-flow relationship)
- caption: 'with pollAll feeding into updateHud' — this directional data-flow relationship is not stated in the snippet; it is a plausible inference but not an explicit claim

## html (35 cells, 21 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0001 | 1.00 | 0 | 0 |  | Every cell value in the table traces directly to the snippet: startup modes, discovery path, alignment claim, and complexity details are all explicitly stated. Empty cells are correctly left blank whe... |
| cell-0011 | 0.70 | 1 | 0 |  | The table is largely clean and faithfully reproduces the snippet's claims. One minor invention exists: the 'Moderate' aggressiveness label for Option 1 — the snippet only states Option 2 is 'most aggr... |
| cell-0012 | 0.40 | 4 | 2 |  |  |
| cell-0013 | 1.00 | 0 | 0 |  | Every cell value in the table traces directly to the snippet: React Flow's primary unit (node), layout paradigm (manipulable graph), and core interaction strength (drag nodes, connect them, custom nod... |
| cell-0014 | 0.40 | 4 | 1 | yes | The snippet supports only three direct facts (React Flow needs React + build pipeline; this is a major architectural shift; the vanilla-JS/IntersectionObserver model is serving us well), but the table... |
| cell-0023 | 1.00 | 0 | 1 |  | All four data cells and their row/column labels trace directly to the snippet with no invented values; the only mild concern is the caption's framing of "trade-offs before direction choice," which imp... |
| cell-0025 | 0.40 | 4 | 4 |  | The HTML table is largely grounded in the snippet, but the formal 'type' column (using values like 'animated_svg', 'html', 'text' as a typed schema) is an invented structural layer the snippet does no... |
| cell-0026 | 1.00 | 0 | 0 |  | All four rows in the HTML table map directly to the four checklist items (a)–(d) in the snippet, with pass conditions faithfully paraphrasing the stated criteria. The caption's characterization of a "... |
| cell-0034 | 0.70 | 1 | 1 |  | The table's core data rows are clean and trace directly to the snippet, but the 'Session-scoped' label applied to both filtered rows is an introduced term — the snippet only uses 'unscoped' for the fi... |
| cell-0035 | 1.00 | 0 | 0 |  | Every cell value, row label, and column label in the table traces directly to the snippet. The caption is an accurate, non-inventive summary. No hallucinations detected. |
| cell-0036 | 0.40 | 5 | 4 |  | The HTML table's structure (cell IDs and substrate types) is directly supported by the trigger snippet, but every caption cell contains invented content — specific architectural claims, commit hashes,... |
| cell-0037 | 1.00 | 0 | 0 |  | Every row in the table maps directly to an explicit claim in the snippet — interaction trigger, view effect, dismiss action, deep-link format, shareability, estimated scope, and design principle are a... |
| cell-0038 | 0.40 | 8 | 1 | yes | The snippet describes exactly one feature (Session-discovery dropdown); the two flanking columns ('Per-cell focus mode' and 'Multi-stream mission control') are entirely invented, with all their cell v... |
| cell-0039 | 0.40 | 4 | 0 |  | The Step 3 column and all its cell values are fully supported by the snippet. However, the two sibling columns ('Per-cell focus mode' / Step 1 and 'Session-discovery dropdown' / Step 2) are materially... |
| cell-0043 | 1.00 | 0 | 0 |  | Every cell value in the table traces directly to the snippet. Blank cells are correctly left empty where the snippet is silent (e.g., transitional width/layout, hero layout), and the caption accuratel... |
| cell-0047 | 0.00 | 8 | 4 | yes | The snippet supplies exactly two facts — no clicks needed, and the layout carries information — neither of which is enough to populate a multi-row, multi-column comparison table. Every tier name, ever... |
| cell-0048 | 0.40 | 0 | 2 |  |  |
| cell-0049 | 1.00 | 0 | 0 |  | Every atomic claim in the table — column count (2), column width (484px each), grid rule (minmax(380px, 1fr)), paths rendered (2, in-viewport pairs only), path style (vertical/S-curves at correct coor... |
| cell-0052 | 1.00 | 0 | 0 |  | Every cell value, column header, and row in the table traces directly to the snippet. The cap rule (55vh), before/after heights, overflow class values, and fade gradient presence/absence are all expli... |
| cell-0054 | 1.00 | 0 | 0 |  | Every atomic claim in the table and caption traces directly back to the snippet. The Hero's 507px height, the 762px below-HUD space, the 2-visible-cells problem, the 2-tier simplification, the dropped... |
| cell-0055 | 0.70 | 1 | 1 |  | The substrate body is clean: all five data rows trace directly to the snippet, with 'Typography' being a minor label paraphrase that is not load-bearing. However, the caption materially misstates the ... |
| cell-0059 | 0.40 | 5 | 0 |  | The HTML reflection table is largely traceable — all five cell IDs, types, and partial captions correspond to claims in the snippet. However, every caption cell is truncated mid-sentence, creating fiv... |
| cell-0067 | 1.00 | 0 | 0 |  | Every atomic claim in the table traces directly to the snippet: cell counts (47, 4), layout (flex-row / side-by-side), live-stream active (yes for lucida_live), and HUD height (35px compressed). Empty... |
| cell-0070 | 0.40 | 4 | 2 |  |  |
| cell-0073 | 1.00 | 0 | 0 |  | Every atomic cell value in the table traces directly to the snippet: dimensionality labels (pure 2D / mixed 2D–3D / pure 3D), characteristic problems (sterile for MDR, disorienting for Hubs/VR, blank ... |
| cell-0079 | 1.00 | 0 | 0 |  | Every cell value, row label, and column label in the table traces directly to the snippet. The empty cell for Scene3d's visual result is an honest omission — the snippet attributes the visual outcome ... |
| cell-0081 | 1.00 | 0 | 0 |  | Every cell value in the table — the ISO 8601 example, its 25-char count, the info-density verdict, the short-time example and its 5-char count, and the relative example — maps directly to a claim in t... |
| cell-0082 | 0.40 | 4 | 0 |  |  |
| cell-0088 | 1.00 | 0 | 0 |  | Every cell in the table traces directly to an explicit claim in the snippet: both selector strings, their specificity values (3 and 2), the max-height values (28vh / none), the winner of the specifici... |
| cell-0089 | 0.40 | 1 | 0 |  | The table is largely well-formed, but one material invention is present: the Track A / Mermaid rendering cell incorrectly lists 'consolidate mermaid CSS via custom properties' as a Track A task — the ... |
| cell-0094 | 0.70 | 0 | 1 |  | The HTML table body is fully grounded in the snippet: all four rows (overflow-x, edge stroke, drop-shadow, green bar) trace directly to stated claims with correct before/after values. The only inventi... |
| cell-0096 | 0.40 | 4 | 1 |  | The table's structure (source, type, caption) is directionally supported, but all four truncated caption cells are rendered mid-word/mid-sentence — this is a systematic provenance failure because no a... |
| cell-0102 | 0.70 | 1 | 1 |  | The three effect names and types (border, pulse, sweep) are all DIRECT from the snippet and the table structure is coherent. However, the Status column universally labels all three as 'should remove',... |
| cell-0106 | 0.40 | 3 | 1 |  | Three atomic values in the substrate are invented: the coverage descriptions for 'full audit' ('complete') and 'sample-30' ('30 cells (random sample)'), and the cost of 'skip' ('$0.00'). The snippet p... |
| cell-0107 | 0.40 | 5 | 3 |  |  |

### html inventions detail

**cell-0011** (score 0.70):
- substrate: Aggressiveness row: Option 1 labeled 'Moderate' — the snippet does not assign a relative aggressiveness label to Option 1; it only says Option 2 is 'most aggressive', which implies Option 1 is less aggressive, but 'Moderate' as a specific label is an invention.

**cell-0012** (score 0.40):
- substrate: cell-0007 caption: 'session_id needing to be thread' — the snippet says cell-0007 established the pipeline shape/topology but does NOT state session_id was the subject of cell-0007 (that refinement is attributed to cell-0008)
- substrate: cell-0008 caption: 'three touch-points' — the snippet names three nodes (append_proposal, reflect_and_persist, watcher) but does not use the phrase 'three touch-points' as a stated count label; minor but the number 3 is derivable
- substrate: cell-0009 caption: 'overridable via a --ses' — this is a truncated reference to a CLI flag (--session or similar) that is NOT stated anywhere in the snippet; the snippet only says 'override', not the flag name
- substrate: cell-0010 caption: 'orchestrator' ending is truncated — the snippet does reference orchestrator.py:616-618 but the caption omits this anchor, potentially misrepresenting the cell's content
- caption: 'two intertwined threads' — while inferable, the snippet does not explicitly frame the session as exactly two intertwined threads; this is an interpretive addition
- caption: 'both touching the same orchestrator/watcher code' — the snippet mentions orchestrator.py and watcher.py separately but does not explicitly claim both changes touch the same code files simultaneously

**cell-0014** (score 0.40):
- substrate: Runtime dependencies row, Vanilla-JS column: 'none beyond browser APIs' — snippet never characterises the dependency footprint of the vanilla approach; it only names it.
- substrate: Architectural model row, React Flow column: 'component-based / React paradigm' — snippet does not describe the paradigm, only names React + build pipeline as a dependency cost.
- substrate: Architectural model row, Vanilla-JS column: 'vanilla JS' — this partially restates the name rather than a described attribute, but more importantly the row label frames it as a distinct architectural model dimension, which the snippet does not articulate.
- substrate: Current status row, React Flow column: 'proposed' — the snippet never says React Flow is merely proposed; it frames it as a decision being considered but does not assign a formal status label.
- caption: 'Empty cells where the snippet underspecifies a dimension for that approach' — there are no empty cells in the table, making this caption claim actively false and therefore invented.

**cell-0023** (score 1.00):
- caption: 'trade-offs before direction choice' — the snippet does not describe these as trade-offs or frame them as preceding a direction decision; it simply characterises both options positively with different emphases

**cell-0025** (score 0.40):
- substrate: cell-0021 caption truncated with 'Concret' — partial text, not necessarily invented but unverifiable
- substrate: cell-0022 caption truncated with 'this analy' — partial text, not verifiable
- substrate: The table structure asserts that cell-0020 is type 'text', cell-0021 is 'animated_svg', cell-0022 is 'animated_svg', cell-0023 is 'html', cell-0024 is 'text' — the snippet describes these types but does not explicitly label them as such in a typed schema; 'animated_svg' and 'html' as formal type labels are inferred/invented column values not stated verbatim in the snippet
- substrate: The column label 'type' is an invented schema dimension — the snippet does not define or label cell types in a formal taxonomy
- caption: 'Wakisaka reflection loop' — the name 'Wakisaka' does not appear anywhere in the trigger snippet; this is an invented proper noun / attribution
- caption: 'Iron HUD aesthetic' appears in the snippet implicitly (Iron HUD signature animation), so this is borderline DIRECT — acceptable
- caption: 'JARVIS-style provenance' is supported by 'JARVIS-style' in snippet — acceptable
- caption: The summary characterization 'we built both things, now which direction to push next?' is a reasonable paraphrase of the snippet's arc and is not materially invented

**cell-0034** (score 0.70):
- substrate: Column label 'Scope' and cell value 'Session-scoped' for both scoped URLs — the snippet never uses the term 'Session-scoped'; it only distinguishes 'unscoped' vs. the two filtered URLs
- caption: 'Three canonical test URLs validating session-filter behavior' — the snippet does not describe these as 'canonical test URLs' nor characterize them as 'validating session-filter behavior'

**cell-0036** (score 0.40):
- substrate: cell-0031 caption: 'The SVG overlay element is anchored to the notebook root in the DOM body; the connection drawer is then wired to the SVG layer to render int' — the specific architectural claim (SVG anchored to notebook root in DOM body, connection drawer wired to SVG layer) is not stated in the trigger snippet
- substrate: cell-0032 caption: 'Scroll + resize event hooks (left) feed signal flow via dashed lines into the draw-connections function (center), which fires and re-renders' — the specific mechanism (scroll+resize hooks, dashed lines, draw-connections function) is not stated in the trigger snippet
- substrate: cell-0033 caption: 'Step 2 landed (`73520bf`). The filter principle is now memory; the implementation already follows it.' — the commit hash `73520bf`, the phrase 'filter principle is now memory', and the claim 'implementation already follows it' are not stated in the trigger snippet
- substrate: cell-0034 caption: 'Three canonical test URLs validating session-filter behavior: unscoped default vs. two scoped session views.' — the specific claim of three canonical test URLs, unscoped default vs. two scoped session views is not stated in the trigger snippet
- substrate: cell-0035 caption: 'HUD UI changes from session-filter implementation: SESSION slot display logic and kill-gauge scoping.' — the specific claim about SESSION slot display logic and kill-gauge scoping is not stated in the trigger snippet
- caption: 'from implementation mechanics (SVG overlay wiring, scroll/resize hooks) into operational validation' — SVG overlay wiring and scroll/resize hooks as specific mechanics are not stated in the trigger snippet
- caption: 'commit landed, URLs confirmed, HUD display logic documented' — these specifics are not stated in the trigger snippet
- caption: 'session-filter feature: what it does, how its UI exposes it, and how its scoping rules behave in practice' — the characterization of the last three cells as behavioral/state documentation of a working system, while plausible, is not stated in the trigger snippet
- caption: 'The last three cells are all behavioral/state documentation of a working system' — not stated in the trigger snippet

**cell-0038** (score 0.40):
- substrate: Column: 'Per-cell focus mode' — no such feature is mentioned in the snippet
- substrate: Column: 'Multi-stream mission control' — no such feature is mentioned in the snippet
- substrate: Row cell: Per-cell focus mode → Scope = 'small' — invented; snippet says nothing about this feature
- substrate: Row cell: Per-cell focus mode → Step = 'step 1' — invented; snippet says nothing about this feature
- substrate: Row cell: Multi-stream mission control → Scope = 'big (sprint)' — invented; snippet says nothing about this feature
- substrate: Row cell: Multi-stream mission control → Step = 'step 3' — invented; snippet says nothing about this feature
- substrate: Row cell: Session-discovery dropdown → Step = 'step 2 / toward step 3' — snippet says 'toward step 3'; the 'step 2' framing is invented (snippet says it 'makes step 2 discoverable', not that it IS step 2)
- substrate: Row cell: Session-discovery dropdown → Role = 'bridge / prerequisite' — 'prerequisite' is not stated in the snippet; 'bridge' is an inference not directly supported
- caption: 'Three feature options compared' — the snippet describes only one feature; the existence of three comparable options is not stated in the snippet

**cell-0039** (score 0.40):
- substrate: Column header: 'Per-cell focus mode' — the snippet does not name or describe any Step 1 feature
- substrate: Column header: 'Session-discovery dropdown' — the snippet does not name or describe any Step 2 feature
- substrate: Row cell Step=1 for 'Per-cell focus mode' — the snippet does not state Step 1 exists or its step number
- substrate: Row cell Step=2 for 'Session-discovery dropdown' — the snippet does not state Step 2 exists or its step number

**cell-0047** (score 0.00):
- substrate: hero / transitional / ambient column labels (three named tiers not in snippet)
- substrate: recency rank row: most recent / middle / oldest (not in snippet)
- substrate: information visibility row: full/foregrounded / partial / background (not in snippet)
- substrate: click required row: no / no / no (only partially traceable; the tier framing is invented)
- substrate: reflections auto-promoted row and 'yes' value (not in snippet)
- substrate: demotion trigger row: 'new cell creation' values (not in snippet)
- substrate: demotion animation row: 'FLIP cascade' values (not in snippet)
- substrate: column composition row: 'multi-stream' values (not in snippet)
- caption: Three-tier recency hierarchy framing (not in snippet)
- caption: hero / transitional / ambient named tiers (not in snippet)
- caption: 'All tiers are always visible' (tiers themselves are invented)
- caption: 'Empty cells where the snippet underspecifies a dimension for that tier' (invented framing about underspecification)

**cell-0048** (score 0.40):
- caption: Caption describes cell-0044 as covering 'promotion exception' — the snippet's own text says the demotion pattern is broken by auto-promoting from ambient to prominent (not just 'exception'), and the caption compresses this without invention, but the phrase 'from four different angles' implies a clean taxonomy (attribute table / promotion exception / multi-stream extension / animation mechanic / second attribute table) that the snippet does not explicitly name as four angles — it identifies five cells and four roles but the framing 'four different angles' mismatches the five cells listed
- caption: Caption states 'The conversation is designing a spatial UI grammar where layout itself is the information channel, not interaction' — the snippet does say 'no clicks required' and 'layout itself is the information channel', but the characterisation of the entire conversation's design intent is an editorial inference not directly supported by the five-cell reflection snippet alone

**cell-0055** (score 0.70):
- substrate: Row label 'Typography' — the snippet does not use the word 'typography'; it says 'letter-spaced monospace data', so the label is a paraphrase that adds a categorical term not present in the snippet
- caption: 'Only one approach is described in this snippet; remaining reads are out of scope here.' — The snippet describes four distinct CSS techniques within Read 1, not 'only one approach'. This mischaracterizes the snippet's content and is a material caption invention.

**cell-0059** (score 0.40):
- substrate: tbody row for cell-0054: caption text truncated mid-sentence ('leaving only') — the truncation implies a specific numeric completion (e.g., remaining pixel value) that is not verifiable from the snippet and could mislead
- substrate: tbody row for cell-0055: caption text truncated mid-sentence ('Only one approa') — again implying a specific continuation not surfaced in the snippet
- substrate: tbody row for cell-0056: caption text truncated mid-sentence ('a scan line sweeps top-to-bo') — partial claim whose omitted portion is not auditable
- substrate: tbody row for cell-0057: caption text truncated mid-sentence ('Grey = bef') — implies a color-coding scheme detail not stated in the snippet
- substrate: tbody row for cell-0058: caption text truncated mid-sentence ('will down-weight back-to-back') — implies a specific algorithmic rule whose completion is not in the snippet

**cell-0070** (score 0.40):
- substrate: cell-0065 caption text is truncated mid-sentence — the table presents a partial string ending in 'as part of' with no ellipsis, implying a complete caption was available but is not reproduced faithfully; the implied completeness is an artifact invention
- substrate: cell-0066 caption text is truncated mid-sentence ending in '— the st' with no ellipsis, same issue
- substrate: The 'worked' section states cell-0068 shows a '7/19 flagged/clean split across 26 cells' — 7 + 19 = 26, but the snippet only states '~7 of 26 flagged'; the '19 clean' figure is a derived complement not explicitly stated and is presented as a direct table cell fact in the worked prose
- substrate: The 'didn't' section states cell-0065 'doesn't show what the single-stream call path looked like before, nor what the N-stream fan-out looks like after' — this is an evaluative claim about what the cell should have shown; 'single-stream call path' as a prior state is not established in the snippet
- caption: Caption states 'cells 65–67' are the UI architecture thread and are left 'dangling without resolution' — the snippet does not explicitly state the UI architecture thread is unresolved or dangling; this is an editorial inference beyond what the snippet supports
- caption: Caption describes the multi-stream layout as 'N-column' — the snippet references multi-stream but does not use the label 'N-column' in the snippet text provided

**cell-0082** (score 0.40):
- substrate: cell-0077 caption text 'Signal-flow orrery — hero icosahedron sits proud (+z) of the ambient orbital plane, echoing the 18px z-lift in the commit. Six cells orbit t...' — the snippet references this content, but the table is presenting this as a column value derived from the cell itself, not from the reflection snippet; 'signal-flow orrery' and 'ambient orbital plane' terminology are not stated in the reflection snippet
- substrate: cell-0078 caption text 'Camera architecture upgrade path: OrthographicCamera swaps to PerspectiveCamera + WebXR as a mechanical step to enable VR mode.' — framing as 'mechanical step' is not stated in the reflection snippet
- substrate: cell-0079 caption text ending '...causing the 3D viewport to...' is truncated but the causal framing '360px min-height exceeds ~270px max-height cap' is attributed as a caption value; '28vh ≈ 270px' is a specific numeric derivation not explicitly in the reflection snippet text as a table cell value
- substrate: cell-0081 caption truncated '...Character count and info-density verdict sourced directly from s...' — 'sourced directly from s[nippet]' is a meta-claim about provenance inserted as a caption cell value, not a content description from the snippet

**cell-0089** (score 0.40):
- substrate: Track A / Mermaid rendering cell: 'consolidate mermaid CSS via custom properties' — the snippet assigns CSS consolidation exclusively to Track B, not Track A

**cell-0094** (score 0.70):
- caption: commit 9e51764 — the snippet mentions no commit hash; this is an invented specific identifier

**cell-0096** (score 0.40):
- substrate: cell-0091 caption text 'encoding the ren' — the caption is truncated mid-word, making it impossible to verify the full claim; the truncation itself may misrepresent the actual caption content
- substrate: cell-0092 caption text 'step two of the two-step observer cleanu' — truncated mid-word, unverifiable as a complete claim and potentially misrepresenting the original
- substrate: cell-0093 caption text 'organized across five n' — truncated mid-word; 'five namespaces' is consistent with the snippet but the truncation is not a faithful representation
- substrate: cell-0095 caption text 'still on the table for a' — truncated mid-sentence, partial claim unverifiable from snippet
- caption: 'The notebook has reached a natural pause point, and the user is being asked whether to continue or land here.' — this framing is not stated in the snippet; the snippet describes ongoing proposed work (a next mermaid cell) with no explicit 'pause point' framing or question to the user about stopping

**cell-0102** (score 0.70):
- substrate: Status column value 'present (should remove)' for all three rows — the snippet says reduce to ONE effect, not remove all three; it does not specify which one(s) to remove
- caption: 'remove the other two' — the snippet says keep one, but does not specify removing exactly two specific ones; this is a minor paraphrase that is technically correct in count but frames the decision as already made when the snippet only says 'should be one effect, not three'

**cell-0106** (score 0.40):
- substrate: coverage row, full audit cell: 'complete' — snippet does not state coverage for full audit
- substrate: coverage row, sample-30 cell: '30 cells (random sample)' — snippet does not state what sample-30 covers or that it is a random sample of cells
- substrate: cost row, skip cell: '$0.00' — snippet does not state the cost of skipping is $0.00
- caption: 'Empty cells where the snippet underspecifies coverage/next-step for full and sample-30' — this framing is partially correct but implicitly ratifies the invented coverage and $0.00 cost values as legitimate inferences rather than flagging them as inventions

**cell-0107** (score 0.40):
- substrate: caption for cell-0102 states 'remove the other two to eliminate visual' — the table caption here paraphrases correctly, but the truncation obscures whether 'which effect survives' is identified; no fabricated entity, this is acceptable truncation
- substrate: caption for cell-0103 truncated at 'multi-assistant wiring (' — no invented claim, just truncation
- substrate: caption for cell-0104 truncated at 'layering explicit, w' — no invented claim, just truncation
- substrate: caption for cell-0105 truncated at 'above the original greenlight thresho' — no invented claim, just truncation
- substrate: caption for cell-0106 truncated at 'Empty cells where the snippet underspecifies cove' — no invented claim, just truncation
- caption: '1b CSS consolidation' — the snippet mentions step 1b only as running in parallel with 1a and feeding into step 3; it does not label step 1b as 'CSS consolidation'
- caption: 'hero indicator de-noising' — the snippet describes amber effects on the hero cell but never uses the phrase 'de-noising' or 'hero indicator de-noising' as a label for that task
- caption: 'The notebook is now sitting at an open decision gate waiting for the user's pick' — plausible inference but the snippet does not state this; it is an editorially invented framing not supported by any explicit claim in the trigger
