# lucida

[![CI](https://github.com/justinstimatze/lucida/actions/workflows/ci.yml/badge.svg)](https://github.com/justinstimatze/lucida/actions/workflows/ci.yml)

*For the monitor where you used to read code.*

Your Claude Code session, rendered live as a mission-control display. Every
decision, comparison, flow, and structure becomes a live visual cell — charts,
diagrams, 3D scenes, animated SVGs. The display builds up as you work.

It probably doesn't make you more productive. Das Blinkenlights for AI sessions.

https://github.com/user-attachments/assets/d08aa14f-2a12-4f6d-a107-d71d98529dac

---

## Themes

The dashboard ships thirteen themes. Switch via `?theme=` in the URL or the
`THEME` chip in the HUD.

| Theme       | Feel                                                       |
| ----------- | ---------------------------------------------------------- |
| `lab`       | Default dark, cyan accent                                  |
| `vigil`     | MCU/Jarvis — cold electric cyan, arc reactor gold          |
| `ops`       | Star Trek LCARS — full L-frame chrome                      |
| `circuit`   | Tron Legacy — hard grid, neon data strip                   |
| `noir`      | Blade Runner 2049 — amber holograms, blue-black            |
| `terminus`  | Alien/Nostromo — phosphor green, CRT vignette              |
| `renegade`  | Mass Effect N7 — omnitool orange, diagonal geometry        |
| `mainframe` | ReBoot (1994) — Energy Sea teal                            |
| `conclave`  | Eva/NERV — amber scan lines, monospace                     |
| `minimal`   | Vercel/Linear — clean flat light                           |
| `gastown`   | Steampunk brass + serif                                    |
| `hackers`   | Hackers (1995) Gibson canyon — cyan-dominant, rare magenta |
| `hailmary`  | Project Hail Mary — cyan-white wireframe, monochrome       |

Each theme ships per-theme entrance animations and window-edge chrome
authentic to its source material. Themes also declare a preferred layout
that activates on switch.

https://github.com/user-attachments/assets/6da05581-f458-48f4-9044-4ad3795d152f

---

## Get running in 5 minutes

**Requirements:** Python 3.11+, an Anthropic API key, a running Claude Code
session.

```bash
git clone https://github.com/justinstimatze/lucida && cd lucida
uv venv && uv pip install -e .
cp .env.example .env
# fill in your ANTHROPIC_API_KEY in .env
```

Start the renderer — open this on your second monitor and leave it there:

```bash
python3 serve.py
# http://localhost:8766/
```

`serve.py` bundles the static server and the snap receiver (which
persists Mermaid SVG renders into `cells/` so heavy substrates don't
re-render every session). `python3 -m http.server 8766` works too but
skips the cache.

For the Tron/Hackers (1995) Gibson canyon look on first run, try:

```
http://localhost:8766/?theme=hackers&layout=mixed3d
```

Start watching your Claude Code session:

```bash
python watcher.py \
  --transcript ~/.claude/projects/.../transcript.jsonl \
  --watch 30 --write --generate
```

That's it. New cells appear as the conversation progresses.

The display starts blank — cells mint as new content appears in the
transcript. Start a conversation in Claude Code and within a few exchanges
you'll see the first cells land. You'll immediately feel cooler.

Prefer one command? `./scripts/start.sh` launches `serve.py` and `watcher.py`
side-by-side with labeled output. Edit the script to point at your own
transcript path.

---

## What it produces

Lucida reads each passage in your conversation and picks a reasonable visual
for it automatically:

- **Graphs and diagrams** — architecture, flows, entity relationships, state machines
- **Charts** — comparisons, cost breakdowns, quantitative series
- **Tables** — structured decisions, callouts, tradeoff matrices
- **Treemaps** — proportional categorical breakdowns
- **3D wireframes** — topology, spatial structure (Three.js, FUI-style)
- **Animated SVGs** — cycles, decay, state transitions
- **Sparklines** — single-variable trajectories
- **Timeline ribbons** — chronological events with horizontal flow
- **Gauges** — single scalars within a stated range (memory, latency, score)

Ambient FUI flair — transient cells, mint-time scrubbers, per-theme ambient
motion — appears automatically. No prompts required, no payload, no static
chrome. Implies "computer go beep boop."

Visuals arrive pre-themed to the active theme. No configuration needed — the
classifier chooses the substrate, the specialist generates the spec, and the
renderer paints it.

---

## Cost

About **$0.02–0.03 per cell** using Sonnet 4.6. A busy hour-long session
mints 30–80 cells — roughly $0.60–$2.00. Classifier calls are cached.

Turn off `--generate` to run the classifier only (free) and mint manually
when you want a visual.

---

## Watcher options

```bash
python watcher.py \
  --transcript <path>     # Claude Code .jsonl transcript
  --watch 30              # poll interval in seconds (omit for one-pass)
  --write                 # persist to cells.json
  --generate              # call specialists (costs API tokens)
  --session-id <name>     # tag cells with a session name
  --max-cells 200         # rolling cap (default); use 'all' to keep everything
```

**Cells are ephemeral by default.** `cells.json` keeps the last 200 (enough
for casual scrollback). Set `--max-cells all` (or `LUCIDA_MAX_CELLS=all`) if
you want the file to accumulate as a long-running work-summary archive.

Multiple sessions:

```bash
# Terminal 1
python watcher.py --transcript session-a.jsonl --session-id A --watch 30 --write --generate

# Terminal 2  
python watcher.py --transcript session-b.jsonl --session-id B --watch 30 --write --generate

# View both side-by-side
# http://localhost:8766/?session=A,B
```

---

## HUD + URL params

The HUD at the top of the page is a live status bar. Click it to expand.
The `SESSION` chip opens a dropdown listing every session in the corpus.

Full URL param reference:

```
?theme=<name>               theme (lab / vigil / ops / circuit / noir / terminus /
                            renegade / mainframe / conclave / minimal / gastown /
                            hackers / hailmary)
?layout=<name>              layout (pack / grid / treemap / scatter / tactical /
                            terminal / mixed3d)
?session=<id>               scope to one session
?session=<a>,<b>,<c>        N-column mission-control view
?nocache=1                  bypass the persistent SVG cache (force fresh mermaid
                            renders this load)
?perf=1                     dev: enable per-frame perf logging
?debug=1                    dev: enable mixed3d debug logging
```

In `?layout=mixed3d`, dev keys: `D` toggles the debug overlay (camera path
+ tower bounds), `Q` dumps a contact sheet of all rendered tier-1 cells
into `refs/gibson/live-shots/`.

---

## Related projects

- [agentic-city](https://github.com/mrf/agentic-city) by Mark Ferree —
  kindred local-only FUI dashboard for AI sessions, but framed from the
  opposite angle: it renders the codebase as an isometric SimCity with
  active Claude/Codex/Gemini agents flying overhead as UFOs. Where
  lucida centers the *transcript content* as visual cells, agentic-city
  centers the *codebase* as terrain. The companion library
  [agentwatch](https://github.com/mrf/agentwatch) is a Go transcript-
  watcher that normalizes Claude/Codex/Gemini session state into one
  feed — worth a look if you want multi-vendor session ingest.

---

## How it works (for the curious)

The pipeline behind each cell:

1. `watcher.py` polls the transcript for new prose
2. `segmenter.py` chops it into discrete snippets
3. `classifier.py` assigns a substrate type; low-value snippets are suppressed
4. `specialists.py` produces a snippet-grounded visual spec — a forcing-step
   audit checks that the specialist didn't invent data not in the source
5. Cell lands in `cells.json`; the renderer polls and paints it live
6. Every N mints, `reflect.py` synthesizes the stream into a summary cell

The `UserPromptSubmit` hook injects recent mints into your next Claude Code
prompt, so the conversation knows what just landed on the display.

To wire it up, add this to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/lucida/hooks/recent_mints.sh"
          }
        ]
      }
    ]
  }
}
```

The hook is silent when nothing has minted recently — it only speaks when
there are new cells. Set `LUCIDA_MINT_WINDOW_MIN=30` (default: 60) to
tune the lookback window.

---

## Adapters

Flatten any AI session log into the format the watcher expects:

```bash
python -m adapters.cli --source claude-code <transcript.jsonl> --out /tmp/transcript.txt
python -m adapters.cli --source aider <chat.md> --out /tmp/transcript.txt
```

---

## Files

```
lucida/
├── index.html             renderer
├── notebook.css           all 11 themes
├── themes/                per-theme token JSON
├── orchestrator.py        one-shot entry point
├── watcher.py             continuous listener
├── specialists.py         visual spec generators
├── classifier.py          substrate classifier
├── reflect.py             synthesis cells
├── adapters/              transcript adapters
└── hooks/recent_mints.sh  Claude Code prompt injection hook
```

Not committed: `cells.json`, `mint_log.jsonl`

---

## Development

```bash
uv venv && uv pip install -e .[dev]
pre-commit install
```

**Lint:**
```bash
uv run ruff check .
uv run ruff format .
```

**Tests:**
```bash
uv run pytest tests/
# integration tests (needs ANTHROPIC_API_KEY):
uv run pytest tests/integration/
```

CI runs lint + tests + a bandit security scan on every push.
