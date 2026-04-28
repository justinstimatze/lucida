# lucida

A passive-listener companion artifact that hovers next to a Claude Code
conversation. Watches the transcript, mints heterogeneous cells (vega
charts, mermaid diagrams, html tables, animated SVG, Three.js scenes,
A-Frame WebGL, lottie placeholders) as conversation flows past, and
renders them live in an accreting notebook surface with iron-man-HUD
aesthetic.

The differentiated frame: where Cursor Canvas is intentional/skill-driven
and Claude Artifacts is one-at-a-time-replaceable, lucida is a *passive
listener* minting *heterogeneous cells* from a conversation transcript —
a niche unfilled by current generative-UI tools. See
`memory/positioning_candidates.md` for the longer framing.

## What it does

1. **Watches** a Claude Code session transcript via `watcher.py`.
2. **Segments** new prose into snippets (`segmenter.py`).
3. **Classifies** each snippet into a cell type (`classifier.py`).
4. **Dispatches** to a substrate specialist (`specialists.py`) which
   produces a snippet-grounded spec.
5. **Persists** the cell to `cells.json` and appends a record to
   `mint_log.jsonl`.
6. **Renders** live in the open notebook page at
   <http://localhost:8766/> — new cells slide in with a substrate-
   appropriate entrance animation; the HUD strip updates with cell
   counts, kill-criteria gauges, and recent-mint ticker.
7. **Reflects** on every Nth mint via `reflect.py` — produces a
   structured html cell summarizing what worked / didn't / proposed-next.
8. **Closes the loop** via the UserPromptSubmit hook in
   `hooks/recent_mints.sh`: recent mints are injected into the next
   Claude Code prompt as context, so the conversation knows what just
   landed.

## Cell types

Nine substrates, each with a specialist function. Specialists run with
`--generate`; without it the watcher mints classifier-only proposals.

| Type           | Specialist                       | Best for                                                |
| -------------- | -------------------------------- | ------------------------------------------------------- |
| `vega`         | `generate_vega_spec`             | precise quantitative charts, multi-point series         |
| `mermaid`      | `generate_mermaid_spec`          | structural graphs, named entities + edges               |
| `html`         | `generate_html_spec`             | comparison tables (≥2 entities × ≥2 dimensions)         |
| `animated_svg` | `generate_animated_svg_spec`     | motion-graphics encoding flow / cycle / decay           |
| `scene3d`      | `generate_scene3d_spec`          | wireframe Three.js scenes, iron-HUD topology            |
| `aframe`       | `generate_aframe_spec`           | declarative WebGL scenes via A-Frame                    |
| `lottie`       | `generate_lottie_spec`           | usually demotes-with-redirect; Lottie isn't LLM-tractable |
| `image`        | `image_specialist.py` + Gemini   | scene/illustrative — demoted from auto-classifier (kill #1) |
| `text`         | n/a                              | meta-commentary; the value-prop failure mode             |

All non-image specialists produce snippet-grounded specs via Anthropic
Sonnet 4.6 with prompt caching. Each has a forcing-step audit
(enumerate-then-classify the input data as DIRECT / DERIVED / INVENTED)
that prevents substrate hallucination — see `learnings.md` for
calibration history.

## Themes

Four themes, all extensible via the `.theme-<name>` block in
`notebook.css`:

- `lab` — dark notebook (default), cyan accent
- `magi` — Eva/NERV amber-on-black, Courier New monospace, FUI dialect
  (mermaid SVG glow + scan-lines + animated dashed edges)
- `minimal` — Vercel/Linear flat
- `gastown` — steampunk brass + serif

Switch via `?theme=magi` URL param or `lucida_theme` cookie. Adding a
new theme = one CSS block setting the `--vis-*` token vocabulary.
See `memory/feedback_themes_extensible.md` — the system is intended
to support custom-FUI extensions per user (Bladerunner, Severance, Tron,
etc.); don't entrench in magi-specific globals.

## Setup

```bash
cd ~/Documents/lucida
uv venv && uv pip install -e .            # or python3 -m venv .venv && pip install -e .
cp .env.example .env
$EDITOR .env                              # ANTHROPIC_API_KEY (required) + GOOGLE_API_KEY (only if --generate on image cells)
```

Both API keys: ANTHROPIC for classifier / specialists / evaluator /
reflection; GOOGLE for image generation via Gemini (only fires when
`--type image --generate`).

## Running

Renderer (always-on while iterating):

```bash
python3 -m http.server 8766
# http://localhost:8766/
```

One-shot mint via orchestrator:

```bash
python orchestrator.py --snippet "..." --write --generate
python orchestrator.py --snippet "..." --type mermaid --write   # force type
```

Continuous passive-listener mode via watcher:

```bash
python watcher.py --transcript /path/to/session.jsonl --watch 30 --write --generate
```

Or one-pass:

```bash
python watcher.py --transcript /path/to/session.txt --write --generate
```

For Claude Code session logs (jsonl), pre-process via:

```bash
python jsonl_to_transcript.py < session.jsonl > /tmp/transcript.txt
```

## Conversation-loop integration

A `UserPromptSubmit` hook in `.claude/settings.json` runs
`hooks/recent_mints.sh` on every prompt submit. The hook tails
`mint_log.jsonl` (filtered to last 60 min) and prints a summary line
per recent mint, which Claude Code injects as context. The conversation
naturally knows what cells just landed without polling cells.json.

Disable by removing the hook from `.claude/settings.json`. Tune the
window via `LUCIDA_MINT_WINDOW_MIN`.

## Audits + kill criteria

Pre-committed kill criteria in `kill_criteria.md`. Two audit scripts:

- `python audit_kill_criteria.py` — image-only kill #1/2/3 audit, free
  (counts heuristics over `cells.json` notes)
- `python eval_all_substrates.py` — substrate hallucination audit
  (DIRECT/DERIVED/INVENTED provenance check on every active vega /
  mermaid / html cell), ~$0.30 across the corpus. Writes
  `audits/substrate_eval_<date>.{md,json}`. The HUD reads the latest.

## Architecture references

- Memory directory at
  `~/.claude/projects/-home-gas6amus-Documents-lucida/memory/`
  holds the durable design context: vision, positioning candidates,
  theme-extensibility guardrail, awaiting-generation backlog notes.
- `design-references.md` — curated FUI/sci-fi-interface references
  (Coleran's pragmatic futurism, Noessel's four awarenesses, Hojlund's
  hero/ambient split, Iron HUD corpus). Bookmark list of source URLs.
- `learnings.md` — calibration history: forcing-step iterations,
  i2i remediation disconfirms, score-saturation findings.
- `research/` (gitignored) — local-only deeper scrapes of source
  archives (`design-references-archive.md`,
  `competitive-landscape.md`).

## Files

```
lucida/
├── README.md                  this
├── pyproject.toml             python deps
├── .env.example
├── .gitignore                 mint_log.jsonl + research/ + cells/cell-*.png are local-only
├── .claude/settings.json      UserPromptSubmit hook for conversation-loop
├── hooks/recent_mints.sh      hook that surfaces fresh mints to Claude Code
├── index.html                 renderer (HUD + cell stream + live append)
├── notebook.css               theme tokens + cell + HUD styling
├── cells.json                 cell corpus (chronological, append-only)
├── mint_log.jsonl             runtime mint log (gitignored)
├── orchestrator.py            entry point: classify → specialist → cells.json
├── classifier.py              v0.5 LLM classifier (Sonnet 4.6, cached)
├── specialists.py             vega/mermaid/html/animated_svg/scene3d/aframe/lottie
├── image_specialist.py        Gemini image-prompt builder
├── nano_banana.py             Google AI / Gemini SDK wrapper
├── evaluator.py               image-cell quality scorer + retrigger guidance
├── text_evaluator.py          substrate-hallucination provenance check
├── reflect.py                 reflective synthesis over recent cells
├── watcher.py                 transcript-delta listener with polling loop
├── segmenter.py               prose → snippet segmentation
├── jsonl_to_transcript.py     Claude Code .jsonl → flat transcript
├── audit_kill_criteria.py     image-only kill #1/2/3 audit
├── eval_all_substrates.py     substrate-hallucination audit driver
├── audits/                    audit reports by date
├── kill_criteria.md           pre-committed kill conditions
├── learnings.md               calibration history + disconfirms
├── design-references.md       curated FUI bookmarks (committed)
├── research/                  local-only deeper scrapes (gitignored)
├── scratch_scene3d_demo.py    one-shot generator for iron-man-3D demos
├── scratch_backfill_reflection_html.py   idempotent text→html migration
└── cells/
    ├── placeholder.svg        the only tracked cell asset
    └── cell-*.png             generated images (gitignored)
```

## Cost notes

- Classifier: Sonnet 4.6 with caching, ~$0.005 per snippet
- Specialist: Sonnet 4.6, ~$0.020 per spec
- Evaluator (image cells): Sonnet 4.6, ~$0.020 per eval
- Substrate-hallucination eval: Sonnet 4.6, ~$0.012 per cell
- Image generation: Gemini 2.5 Flash Image, ~$0.039 per image
- Daily image cap: `LUCIDA_DAILY_IMAGE_CAP` env var (default 200)

Set a hard $ ceiling on the cloud billing console as a second layer of
defense.
