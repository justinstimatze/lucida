# lucida — co-evolving notebook

A *camera lucida* for conversation: a chronological notebook of generated
artifacts (diagrams, plots, sketches, images) that accretes alongside an
ongoing conversation with an agent. Like having a team of grad students
producing illustrations on the fly.

This is the v0 prototype — 2 weeks to feel out the shape, then a learning
report and a real metric.

## Status

v0. The notebook surface (`index.html`) renders heterogeneous cells from
`cells.json`. The orchestrator (`orchestrator.py`) takes a conversation
snippet, classifies what kind of artifact to produce, builds the prompt
for the appropriate specialist, and (with `--generate`) actually calls
nano banana for image cells. Vega/Mermaid spec generation is still
stubbed in v0 — fill in `spec` manually until we wire LLM specialists
in v0.5.

## Cell types

The notebook supports a hybrid of qualitative and quantitative renderers:

- **image** — generated image (nano banana / static file). For structural,
  conceptual, scene, sketch artifacts where exact values don't matter.
- **vega** — Vega-Lite spec rendered via vega-embed. For precise
  quantitative plots, distributions, faceted views.
- **mermaid** — Mermaid string rendered via mermaid.js. For sequence,
  state, flow, architecture, and graph diagrams where structural
  precision matters.
- **html** — raw HTML/SVG inline. For tables, matrices, anything
  custom-rendered.
- **text** — markdown caption only. For when the right artifact is just
  prose.

## Files

```
lucida/
├── README.md            # this
├── pyproject.toml       # python deps
├── .env.example         # GOOGLE_API_KEY placeholder
├── .gitignore
├── index.html           # notebook surface
├── notebook.css         # minimal styling
├── cells.json           # cell data (chronological)
├── orchestrator.py      # prompt-builder + dispatcher
├── nano_banana.py       # Gemini image specialist
└── cells/               # generated images live here
    └── placeholder.svg
```

## Setup

```bash
cd ~/Documents/lucida
uv venv
uv pip install -e .
cp .env.example .env
$EDITOR .env   # GOOGLE_API_KEY=...
```

If you don't use uv:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Running

Notebook surface (always-on while iterating):
```bash
python3 -m http.server 8766
# open http://localhost:8766/
```

Add a cell from a conversation snippet:
```bash
# propose only — emit JSON, do not write
python orchestrator.py --snippet "..."

# write proposal to cells.json
python orchestrator.py --snippet "..." --write

# write + actually generate image (image cells only — type must
# resolve to "image", either via the classifier or via --type image)
python orchestrator.py --snippet "..." --type image --write --generate

# force a specific cell type
python orchestrator.py --snippet "..." --type mermaid --write
```

The notebook reads `cells.json` and renders cells chronologically. Reload
the browser after writes; live reload is out of scope for v0.

## What's not in v0

- Live conversation listener — cells added by hand or via orchestrator CLI
- LLM-driven Vega/Mermaid spec generation — still stubbed
- Persistence beyond `cells.json` (no winze, no MQTT)
- Aesthetic investment beyond legibility
- Interactivity beyond scroll + collapse-toggle on prompt/snippet sections

## Test corpus

Drawing from `~/Documents/zerosum/`. See `cells.json` for seed cells
spanning structural (mermaid), conceptual/scene (image), quantitative
(vega), and matrix (html) viz needs. Real session cases get appended via
the orchestrator.

## After 2 weeks

Output is a learning report (`learnings.md`) covering:
- which cell types fired most
- where image-gen surprised (good or bad)
- where structured renderers were forced
- where the dispatcher mis-routed
- candidate output metric *proposed from observation*, not before

Then we decide whether to invest in v0.5 (LLM-driven Vega/Mermaid
specialists, conversation listener, etc.) or pivot.

## Cost ceiling

`.env` has `LUCIDA_DAILY_IMAGE_CAP=200` as a tripwire. Override there.
Set a hard $ ceiling on the Google Cloud billing console as a second
layer of defense.
