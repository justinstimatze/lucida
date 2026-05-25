# Contributing to lucida

Thanks for poking around. This is a small project; here's what you need
to know.

## Dev setup

```bash
git clone https://github.com/justinstimatze/lucida
cd lucida
uv venv && uv pip install -e .[dev]
npm install          # mermaid lint + server-side mermaid pre-render via puppeteer
pre-commit install   # ruff format + lint on commit

cp .env.example .env
# put your ANTHROPIC_API_KEY in .env

./scripts/start.sh   # serve + watcher together
# or run them separately:
#   python serve.py
#   python watcher.py --transcript /path/to/your/transcript.jsonl --watch 30 --write --generate
```

The `npm install` step pulls `mermaid` (for spec lint), `jsdom` (DOM
shim for the linter), and `puppeteer` (server-side mermaid render to
avoid blocking the browser main thread). Puppeteer's postinstall
downloads its own bundled Chromium to `~/.cache/puppeteer/` —
~170MB, one-time, no system Chrome required.

Open <http://localhost:8766/?theme=hackers&layout=mixed3d>.

## Where things live

```
lucida/
├── index.html            entire frontend (Vega, Three.js, mermaid, d3,
│                         Muuri loaded from CDN). ~13k lines. One file
│                         on purpose — easy to grep, no build step.
├── orchestrator.py       cell-mint glue. Calls classifier → specialist
│                         → reflect; writes cells.json atomically.
├── classifier.py         picks substrate (mermaid / vega / html / ...)
│                         + html_layout for a snippet.
├── specialists.py        per-substrate prompts → Claude → spec JSON.
├── reflect.py            synthesis-cell pass over recent mints.
├── watcher.py            tails a Claude Code transcript, hands new
│                         turns to the orchestrator. State persists
│                         per-transcript under .watcher_state_*.json.
├── nano_banana.py        Gemini image substrate (optional).
├── serve.py              static server + snap_receiver thread on 8767.
├── tools/                supporting modules
│   ├── atomic_state.py   write-tmp + .bak + recovery helpers used by
│   │                     watcher / nano_banana / snap_receiver.
│   ├── anthropic_retry.py
│   │                     exponential-backoff wrapper around Claude
│   │                     API calls — retries on 429 / 5xx / timeout.
│   ├── snap_receiver.py  HTTP POST receiver for mermaid SVG cache;
│   │                     GET /healthz for readiness probe.
│   └── validate_mermaid.mjs
│                         server-side mermaid lint via jsdom.
├── themes/               <name>.tokens.json — palette + layout for one
│                         theme. Loaded by index.html theme bootstrap.
├── adapters/             transcript adapters (Claude Code, Gemot…).
├── hooks/                Claude Code prompt-injection hooks.
├── scripts/              one-shot operational scripts.
└── tests/                pytest suite (117 tests, fast).
```

Not committed: `cells.json` (your session's cells), `mint_log.jsonl`,
`.watcher_state_*.json`, the `cells/*.svg` mermaid cache.

## Style

- **Python**: ruff format + ruff lint (configs in `pyproject.toml`).
  `uv run ruff format . && uv run ruff check .` before committing.
  Type hints encouraged; mypy is not strict-mode (intentional —
  prototype with untyped corners around LLM SDK boundaries).
- **JavaScript**: vanilla, no build step. Format by hand.
- **Comments**: explain *why*, not *what*. If a comment restates the
  code it sits next to, delete it. If the code has a non-obvious
  invariant or workaround, document it with `Why:` and `How to apply:`.
- **Commits**: imperative subject ("add", "fix", "drop"), one logical
  change per commit when reasonable. Long-form context in the body if
  the change isn't self-explanatory.

## Tests

```bash
uv run pytest tests/                              # unit tests (fast)
uv run pytest tests/integration/                  # needs ANTHROPIC_API_KEY
```

CI runs lint + tests + bandit security scan on every push. If you add a
new substrate type, add a tests/test_<substrate>.py that exercises the
classifier + specialist paths.

## Adding a substrate

1. Define the spec format in `specialists.py` (system prompt + tool
   schema).
2. Add a renderer in `index.html` under the cell-rendering dispatch.
   Match the LOD pattern: a tier-1 (close, content) renderer and a
   tier-2 (far, decorative-style stub) variant if the substrate will
   be visible in the mixed3d layout.
3. Wire it into the classifier's substrate list in `classifier.py`.
4. Add a test in `tests/test_<substrate>.py`.

## Reporting issues

Use GitHub issues. Include:
- Which theme + layout you were on (e.g. `?theme=hackers&layout=mixed3d`)
- The cell id if a specific cell is misbehaving (click the cell — the
  id + metadata get copied to your clipboard)
- A screenshot if the issue is visual

For security findings, email <justin@justinstimatze.com> instead.
