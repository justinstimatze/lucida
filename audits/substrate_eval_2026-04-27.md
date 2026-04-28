# substrate hallucination eval — 2026-04-27

Companion to audit_2026-04-27.md (image-only). Kill #3 trigger: substrate hallucination >20% of cells.

## Summary

- evaluated: 30 cells (8 vega, 4 mermaid, 18 html)
- cells with any invention: 6/30 = 20.0%
- kill #3 (>20%) tripped: **no**
- tokens: in=62895 out=10057 cache_read=0
- est. cost: ~$0.340

## vega (8 cells, 0 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0017 | 1.00 | 0 | 0 |  | All data points in the spec (Top 10% = 56%, Bottom 50% = 4%) are directly stated in the snippet. The middle 40% delta is correctly withheld from the bar chart and transparently noted in the caption as... |
| cell-0027 | 1.00 | 0 | 0 |  | All two data rows (Top 10%: 56, Bottom 50%: 4) are directly stated in the snippet, axis labels are faithful, and the caption correctly explains why the middle 40% is omitted (only a delta is available... |
| cell-0029 | 1.00 | 0 | 0 |  | All atomic claims in the spec and caption trace directly to the snippet. The two data rows (65% productivity, 14% compensation), the time-period label (1979–2019), the axis title, and the 51-point gap... |
| cell-0035 | 1.00 | 0 | 0 |  | Every data point, axis label, and caption claim traces directly to the snippet. Both numeric values (121% and 8%), the real-terms qualifier, the time range (1979–2019), and the two named series are al... |
| cell-0070 | 1.00 | 0 | 0 |  | All data points in the spec (21.4% baseline, 50% target) and all labels trace directly to the snippet. The caption faithfully reproduces every stated claim, including the 6/28 breakdown and the 30-con... |
| cell-0071 | 1.00 | 0 | 0 |  | Every atomic claim in the spec and caption — both ratio values (21.4%, 17.1%), both raw counts (6 closed, 28 and 35 total), the direction of change, and the +7 denominator growth — is directly stated ... |
| cell-0073 | 1.00 | 0 | 0 |  | Every atomic claim in the spec and caption traces directly to the snippet. The four pass values (17.1%, 26.7%, 32.1%, 35.8%), the ~54.5% predicted asymptote (K=3 N=5), and the 50% structural target ar... |
| cell-0064 | 1.00 | 0 | 0 |  | Every atomic claim in the substrate and caption traces directly back to the snippet. The two bar values (+6 closures, +11 cells), the asymptote rule at 6/11 ≈ 54.5%, the label text, and the caption's ... |

## mermaid (4 cells, 2 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0028 | 1.00 | 0 | 0 |  | Every node, edge, and edge label in the graph maps directly to an explicit causal claim in the snippet, including the closing feedback loop. The caption faithfully paraphrases the snippet's reinforcin... |
| cell-0047 | 1.00 | 0 | 0 |  | Every node and edge in the graph traces directly to the snippet: the five named categories, the discourse-move taxonomy as classifier target, grounding as a co-determining input, and cell type as the ... |
| cell-0072 | 0.70 | 1 | 0 |  | The graph is largely faithful to the snippet. Five of the six edges are DIRECT. The one minor invention is the edge EV → RT ("evaluator required for retrigger lineage"): the snippet says both are abse... |
| cell-0065 | 0.70 | 1 | 0 |  | The graph is largely clean and well-supported by the snippet, but there is one structural invention: all three fix edges terminate at the EXT (extractor) node, whereas the snippet clearly assigns FIX2... |

### mermaid inventions detail

**cell-0072** (score 0.70):
- substrate: EV -->|'required for'| RT (the snippet states both evaluator and retrigger lineage are absent without --generate, but does not explicitly state that the evaluator is itself a prerequisite for retrigger lineage as a direct causal edge; the snippet only says 'no evaluator AND no retrigger lineage', not that evaluator causes retrigger lineage)

**cell-0065** (score 0.70):
- substrate: FIX1, FIX2, FIX3 all point to EXT (the extractor node) — the snippet presents the three fixes as alternatives targeting different pipeline stages (extractor, segmenter prompt, trivial filter), not all targeting the extractor node

## html (18 cells, 4 with inventions)

| cell | score | sub-inv | cap-inv | demote? | summary |
|---|---|---|---|---|---|
| cell-0008 | 1.00 | 0 | 0 |  | Every populated cell in the table traces directly to the snippet: cooperative=above-market wages, competitor=below-market wages and lower prices, cooperative solvency response=match wages OR lose cust... |
| cell-0021 | 1.00 | 0 | 0 |  | Every cell value, row label, and column label in the table traces directly to an explicit claim in the snippet. The caption accurately summarizes the table's scope without adding unsupported details. |
| cell-0026 | 1.00 | 0 | 0 |  | Every cell value in the table maps directly to an explicit claim in the snippet, with no numeric values, extra entities, or relationships introduced beyond what the snippet states. The caption accurat... |
| cell-0033 | 0.70 | 1 | 0 |  | The table is largely well-grounded, but one cell is a material invention: assigning 'topology of the data' as the query cost driver for the relational database. The snippet explicitly frames topology ... |
| cell-0036 | 1.00 | 0 | 0 |  | Every cell value in the table traces directly to the snippet: input sources, output surfaces, and loop latency for ambient image generation are all stated explicitly, and the lucida loop-latency cell ... |
| cell-0037 | 0.40 | 2 | 0 |  | The 'key strength' row is clean (both cells are verbatim from the snippet), but the 'role' row is materially invented: the snippet poses 'who decides when a cell should happen' as the framing question... |
| cell-0038 | 1.00 | 0 | 0 |  | Every atomic claim in the table — the three source field values and the shared cells.json substrate — traces directly to the snippet. The caption faithfully reproduces the empirical question verbatim ... |
| cell-0039 | 1.00 | 0 | 0 |  | All six table rows trace directly to the snippet: model name, per-image cost, daily cap with env var name, derived max daily cost, and both lines of defense. The caption's multiplication (200 × $0.039... |
| cell-0045 | 1.00 | 0 | 0 |  | Every cell value, row label, and column label in the table traces directly to explicit claims in the snippet. The caption accurately paraphrases the same claims without adding anything unsupported. No... |
| cell-0048 | 1.00 | 0 | 0 |  | Every cell, row label, and column label in the table traces directly to explicit claims in the snippet. The caption accurately summarises the structural conclusion stated in the snippet without adding... |
| cell-0049 | 1.00 | 0 | 0 |  | Every cell value, row label, and column label in the table traces directly to the snippet. Empty cells for cell-0005 on the anti-hallucination and "no text" rows are correct and conservative — the sni... |
| cell-0051 | 0.40 | 3 | 0 | yes | The table materially invents a one-to-one mapping between each trivial viz and a specific proposed fix ('judge filter' → mermaid; 'complexity thresholding' → bar graph), but the snippet presents both ... |
| cell-0054 | 1.00 | 0 | 0 |  | Every cell value, row label, column label, and data point in the table traces directly back to the snippet. The caption accurately summarizes what the snippet states — including the intentional empty ... |
| cell-0059 | 1.00 | 0 | 0 |  | Every row, cell value, and label in the table traces directly to the snippet. The Sora 2 cost range is correctly left blank rather than fabricated, and the caption accurately explains why. No inventio... |
| cell-0060 | 0.70 | 2 | 0 |  | The table is largely faithful to the snippet. Two minor interpretive inventions appear: (1) the snippet gives 'Cream + brass' as a single combined color description for gastown, but the table splits t... |
| cell-0061 | 1.00 | 0 | 0 |  | Every row label, mechanism cell, and property cell traces directly to a corresponding claim in the snippet. The table correctly leaves the "Specific properties" cells empty for mermaid, aframe, and an... |
| cell-0062 | 1.00 | 0 | 0 |  | Every cell value in the table traces directly to the snippet: the mechanism labels, the 0/5 zerosum routing result, kill criterion #2 being tripped, the Claude call return signature, and all three con... |
| cell-0066 | 1.00 | 0 | 0 |  | Every row label, example cell, and empty-cell pattern in the table traces directly to the snippet. The four failure modes, their anecdotal examples, and the three absent research activities (rate meas... |

### html inventions detail

**cell-0033** (score 0.70):
- substrate: Query cost driver for Relational database = 'topology of the data' — the snippet attributes topology as the cost driver specifically for graph databases; it does not state that relational databases are also governed by topology. The relational cost driver implied by the snippet is table/row scale (multi-million-row tables), not topology.

**cell-0037** (score 0.40):
- substrate: role row, Orchestrator-as-editor cell: 'decides when a cell should happen' — the snippet frames 'who decides when a cell should happen' as the shared axis/question, not as the role of Orchestrator-as-editor specifically.
- substrate: role row, Claude-as-editor cell: 'decides when a cell should happen' — same invention; the snippet does not assign this as Claude-as-editor's role either. Assigning an identical role to both entities is not supported and flattens a distinction the snippet does not make.

**cell-0051** (score 0.40):
- substrate: Assigning 'judge filter before displaying' exclusively to the first viz (mermaid diagram) — the snippet does not pair specific fixes to specific vizzes; both fixes are posed as general alternatives
- substrate: Assigning 'better complexity thresholding' exclusively to the second viz (bar graph) — same reason; the snippet poses both as open alternatives, not matched to individual cases
- substrate: Leaving the 'equivalent to' cell empty for the mermaid case — while the snippet does not use that exact phrase, assigning the pairing of fixes to rows structurally implies the mermaid has no text-equivalence problem, which is an invented structural claim

**cell-0060** (score 0.70):
- substrate: gastown Primary Color cell value 'brass' — the snippet says 'Cream + brass' as a combined color description, not a single primary color called 'brass'; treating it as a distinct primary color for one column while 'cream' is placed in Background is a structural split the snippet does not make
- substrate: minimal Background cell value 'clean light' — snippet says 'Clean light' as part of the overall vibe description ('Clean light, Inter, no glows'), not explicitly labelled as a background color
