# Session handoff — 2026-05-23 (foundation + hackers share-ready)

Long day. Closed the foundation-firming pass on top of yesterday's blank-cell win, then iterated hard on hackers/mixed3d aesthetic, then a token-burn audit and small cleanup. Page is share-ready for friends on `?theme=hackers&layout=mixed3d`. Twenty-five+ commits.

## Headline state

- Foundation hardened: `cells.json` atomic write + fcntl flock, snap_receiver path-derived, 23 new tests on orchestrator/reflect/evaluator, `.env.example` documents all 15 env vars, README points at `serve.py` (was `http.server`), `scripts/start.sh` one-command bring-up, agentic-city polite-nod under Related projects.
- Camera in mixed3d: HEADING_WIN 1.5s → 0.3s + scan ramp 2.5s → 5s + lookAt lerp dt*5 → dt*2.5. Sustained-fast-yaw events collapsed 200 → 7 over 35s of cruise. Click-to-park now lerps lookAt smoothly (no snap on entry). Camera bounds in free-flight (y ∈ [1.5, 28], x/z within field+spacing).
- R key + Escape → `_mixed3dResetSwoopy` (clears `_userTookCamera` + ff state + park + swoopy timer). Closes the "entered free-flying, can't exit" trap.
- Mouselook on left-drag (10px threshold so trackpad clicks still fire park). Released → auto-resume swoopy. Install-once guard so layout switches don't leak listeners.
- Hackers theme: tier-1 text font-weight 900 + saturated cyan + double cyan glow + 14px titles + 32px callout `.big`. Gauge → horizontal bar (both tier-1 SVG and tier-2 procedural). Timeline_ribbon markers → squares for hackers (other themes keep circles). Hackers `--vis-tripped: #ff3a8c` so failed states are pink not coral. mermaid `flowchart.curve: "step"` (PCB-trace orthogonal edges).
- Tier-2 procedural drawer locked: archetype dispatch with explicit "themed-ambient, NOT faithful preview" contract. Most substrates → decorative-text painter (Eurostile-bold cyan tokens, matches the canyon's decorative layer). Bars (vega/treemap) + bar-meter (gauge) kept. Closes the architectural drift that caused the gauge dial leak.
- Cell-archetype-bg canvas behind every cell content (renderCell at the end). Per-cell backing canvas paints the substrate archetype at alpha 0.18 behind content. Empty cell regions reveal the pattern. ResizeObserver disconnects via a `#notebook` MutationObserver on cell-removal (closes audit-flagged RO leak).
- Inter-tower data streaks (5 elongated additive-cyan box meshes sliding at ~2.5 u/s along corridors) match the canyon_flythrough ref's horizontal light streak.
- Tier-1 animation: `animated_svg` cells re-snap every 1.5s. Snap driver overrides the cache-skip for animated_svg in tier-1, capping at the existing snap budget. Closes "wish there was more tier 1 cell animation."
- Token-burn audit landed: evaluator vision 1024→512px, reflect 1024→384px (Pillow), start.sh -print0/xargs -0. Specialist shared-boilerplate refactor *deferred*: overlap is ~150 tokens not 700, regression risk on 10 prompts dwarfs ~$0.0003/cell savings.
- Console hygiene: frame-stall + state-change diagnostics gated behind `?debug=1`/`?perf=1`. Default DevTools view ~8 info logs, no 404s, no warnings.

## Tomorrow's #1

User said the theme-vision pass through bemygeminis (`bmg_describe` on every theme + tower face captures) is the next thing. Specifically: each theme has !important sprawl in `notebook.css` (40+ rules in hackers alone) — a focused theme-token + specificity-cleanup pass is the natural next move, paired with bmg-driven aesthetic comparison against the Gibson refs. Also: theme-token the cell-archetype-bg colors (currently hardcoded cyan/pink) so non-hackers themes render their own archetype-bg palette.

## Today's commit summary (top-of-stack first)

```
7d56249 mixed3d: gate frame-stall + state-change diagnostics behind ?debug=1
a326c10 mermaid: flowchart.curve "basis" → "step" (orthogonal elbow lines)
014fd6b mixed3d: RO-leak cleanup + animated_svg tier-1 re-snap
6dfdbf1 token-burn: vision image resize + start.sh whitespace-safe find
17a75a7 mixed3d: tier-2 → decorative-text + hackers vis tokens + listener install-once
f43afa9 mermaid: padding 8 → 16 for node-internal text breathing room
210a974 renderCell: archetype-pattern backdrop canvas per cell (path B)
8b59df3 hackers: decorative glyph fill behind cell content (post-render space-fill)
d1e39b6 mixed3d: timeline_ribbon squares (hackers) + html stretches to fill cell
8d6f5c6 mixed3d: mouselook drive fix + camera bounds + hackers content brighter/squarer
efd80a7 mixed3d: tier-2 procedural — archetype dispatch + explicit contract
e8378bf hackers: tier-2 procedural gauge → bar; circles → rects; CSS cache-bust
4731911 hackers: tier-1 text really committed — black weight, saturated cyan, layered glow
1fb24e3 mixed3d: inter-tower data streaks (canyon_flythrough fidelity match)
c963687 mixed3d: click-to-park lerps lookAt too — no snap on entry
f4e94ed mixed3d: yaw smoothing + R-to-reset + mouselook drag + gauge-bar + tier-1 brighter
92b42a3 mixed3d: gate boot-perf log behind ?debug=1 / ?perf=1
ad0279e tests: 23 new tests on orchestrator + reflect + evaluator data layer
6a8d004 hardening: atomic cells.json write + cross-process flock + snap_receiver path
5351c22 scripts: one-command start.sh (serve + watcher in one terminal)
6d5bd1b docs: serve.py + hackers/mixed3d marquee URL + .env knobs + agentic-city nod
```



Marathon session. Twenty-three commits. Headline win: nailed the "blank cells on tower face" plague — root cause was a Three.js `CanvasTexture` GPU-dimension-binding gotcha that masqueraded as transparency / contrast / sparse-content issues for hours.

Prior handoff (overnight 2026-05-21) preserved at the bottom.

## Today's commit summary

In rough order:

- `3fd02c0` — boot-ready hybrid (camera-priority-quota dismissal) + vertical timeline_ribbon + debug-toggle off + mermaid two-pass aspect-flip
- `99e9a8e` — html-table Gibson terminal-grid + console-readout + severity bars
- `0b10e93` — sparse vertical timeline stepY cap (rows pack top, axis-as-scaffold)
- `81aeaf6` — treemap outlines-only + table fill-canvas + mermaid retroactive aspect-flip
- `629f667` — html-table palette tone-down toward decorative bed (later reverted)
- `0e6dcd7` — wait for full warmup before boot, hard cap 30→90s, kill duplicate html title
- `5542bd4` — drop "PENDING" placeholder text; bands instead
- `d52bb06` / `8911cea` — dark body fill A/B'd (tested → reverted; user "stop pointing at transparency")
- `2b9a428` — cache-gate tier-1 promotion + in-range tier-2 pre-render
- `f0046a2` — WASD free-flight, click-park always works, treemap small-n rows
- `af98c06` — mermaid aspect init-block + mindmap node-bkg + flight-sim Y invert
- `11fde5e` — STYLE_V v3→v4, `?nocache=1` dev flag
- `c6dc272` — drop the faded decorative placeholder
- `0e6dcd7` — duplicate-title nuke (composite already paints it)
- `d9ab80b` — **entity-safe tspan uppercase** (`&amp;lt;` → `&AMP;LT;` was bricking 17 SVGs) + rasterize-fail instrumentation
- `839b177` — WASD free-flight, `?` legend, remap D→backtick / Q→P / X=danger
- `e317751` + `71ff9ac` — promote builds CanvasTexture from cached canvas directly (skip placeholder)
- `5822be7` — html-table body text back to bright `#e8f8ff`
- `9dac3e2` — **composite recreates CanvasTexture instead of mutating .map.image** ← the actual fix for blank cells
- (uncommitted at write time) — transparent body backdrop restored, dark fill removed

## The blank-cell rabbit hole — what actually fixed it

**Symptom:** tier-1 cells on the tower face show title block at the top + the body region renders as faint/blank, despite the cached canvas containing real substrate content. Affected a large fraction of cells (user estimate ~25%).

**False leads chased:**
- Transparency vs dark backdrop (tested both — neither fully resolved)
- Sparse substrate content (real but not the root)
- Dim text contrast (real, but only for html-table mode; reverted)
- Per-frame opacity loop dimming cells via `occFactor` (real, but cell-3291 showed `opacity: 0.998` — not the issue here)
- Side culling (verified front-facing toward camera)
- `renderOrder` setting (no change)

**Actual root cause:** `_mixed3dCompositeAndCacheSnap` mutated `material.map.image = fullCanvas` instead of recreating the texture. For cells that promoted via the older code path (placeholder-canvas-then-reassign-image), the `__webglTexture` was allocated at PLACEHOLDER dimensions on first upload. Subsequent `gl.texImage2D` re-uploads inside that binding kept the original allocation, so larger cached canvases got clipped — only the upper region (within the placeholder's bounds) reached the GPU. Title block lived in that region; body content lived below the clip boundary → invisible.

**Diagnostic that broke it open:** force `material.transparent = false; material.opacity = 1.0` on a "blank" cell. If the cell becomes visible as a dark panel with mostly-empty body, the issue is downstream of transparency. Then sample the cached canvas via system viewer to compare with on-screen render — if cache has content but on-screen doesn't, it's a texture-upload problem.

**The 3 commits that landed the fix:**
1. `e317751` — `_mixed3dSwapCellTier` builds CanvasTexture from cached canvas directly.
2. `71ff9ac` — Same fix in `_mixed3dPromoteInstanceToTier1` and the mount-time tier-1 branch in `_mixed3dSyncCells`.
3. `9dac3e2` — `_mixed3dCompositeAndCacheSnap` recreates the texture too (catches the snap-driver path that mutates after promote).

See [memory/three_canvastexture_dim_binding_gotcha.md](../.claude/projects/-home-gas6amus-Documents-lucida/memory/three_canvastexture_dim_binding_gotcha.md), [memory/blank_cell_debugging_methodology.md](../.claude/projects/-home-gas6amus-Documents-lucida/memory/blank_cell_debugging_methodology.md), and [memory/entity_safe_tspan_uppercase.md](../.claude/projects/-home-gas6amus-Documents-lucida/memory/entity_safe_tspan_uppercase.md) for the cross-session learnings.

## Camera / control changes (verified working)

- **WASD** translate, **Q/Z** up/down, **arrow keys** yaw/pitch (Up = nose down, flight-sim), **Shift** = 3× boost.
- **Click cell** → park with lerp + ID auto-copied to clipboard. **Esc** = unpark.
- **`** (backtick) — debug overlay (was D).
- **P** — contact sheet dump (was Q).
- **X** — danger toggle (was D).
- **?** — toggle hotkey legend overlay (top-right, dismiss with `?` again).

## Boot flow (current)

1. Mount drain ~37s (1248 cells)
2. Stable-frame wait → snap-driver starts → warmup starts (~t=63s on cold cache; ~t=10s warm)
3. `BOOT_READY_QUOTA = total` — splash holds until full warmup completes (user 2026-05-22: prefer longer wait over visible pending stubs)
4. `HARD_CAP_MS = 90000` — warmup gets up to 90s (cold-cache ~30 cells/sec)
5. `bootReadyP.finally` dismisses splash; camera unlocks via `warmupP.finally`
6. Tier-2 → tier-1 promotion gated on cache presence (don't promote without rendered content)
7. Snap-driver pre-renders cells within 1.4× tier-1 distance even if still tier-2

## Cache discipline going forward

- Cached SVG version: **v4** (post-2026-05-22). Bump again when CSS injection or rasterize pipeline changes.
- Dev flag: `?nocache=1` bypasses on-disk manifest lookup; every cell renders fresh.
- Cleared all v3 SVGs out-of-band (`rm cells/*.v3.svg`).

## Open items / next session

- **Substrate-density vs scene-scale readability**: html-table body text revert (bright `#e8f8ff`) was needed for readability at scene scale. Same lesson likely applies to other substrates if user starts flagging them again.
- **Sparse substrate output**: treemap small-n (≤3 items) now falls back to rows-style. animated_svg with wide natural aspect in tall cells (cell-3235 / 4346) still has visible empty regions — substrate-aware sizing is the structural fix, not yet started.
- **Tier-2 cell visual cohesion**: the `_mixed3dDrawCellPreview` decorative-bed paint still uses the old vocabulary; some cells visually flagged by user as "looking like the decorative cells" may be tier-2 with shared materials, not tier-1.
- **#159 phase 2** — true skyline pack with per-substrate rowspan (deferred).
- **#154** mermaid Web Worker offload (deferred).
- **#139** restore camera speed 1.0→4.0 when polish wraps.
- **Mermaid init-block aspect-fit** committed at `af98c06` — won't apply to cells in the on-disk cache until those cells re-render. Most cells will be cache-busted by the v3→v4 bump.

## QA tools (unchanged from yesterday)

- `python3 tools/qa_mermaid_overflow.py` — scan cached SVGs for text overflow.
- `` ` `` (backtick) — debug overlay bakes id/colspan/type onto every cached canvas.
- `P` — dump 16-cell contact sheet PNG to `refs/gibson/live-shots/qa-contact-sheet-<ts>.png`.
- `window._mixed3dState` → runtime (cellObjects, _snapTexCache, _warmupCount, _rasterizeFails).
- `window._mixed3dParkAt(id)` → programmatic park.
- HUD RENDER chip surfaces `pending/total · N✕` when any cell has rasterize-failed.

---

# 2026-05-21 (overnight) handoff — for context

(Previous handoff preserved below for history. Most items resolved or rolled into today's work.)

## Today's load-bearing fixes (in commit order)

- `00891ac` — warmup `_MIXED3D_SKIP_SUBSTRATES` ReferenceError. **The reason "nothing was prerendered" all day.**
- `7395292` — exposed `state` as `window._debugState` so the closure-bound cellsById was inspectable.
- `909b26c` — D + Q debug keys. D bakes id/colspan/type badges onto every cached canvas. Q dumps a 16-cell contact sheet to `refs/gibson/live-shots/qa-contact-sheet-<ts>.png`.
- `5482980` — **warmup enumerates `state.rendering.cellsById` instead of `S.cellObjects`**. cellObjects fills gradually from mount drain, so iterating it at boot-time gave ~20 cells. cellsById is populated synchronously when cells.json loads (2594 entries). Also added cellData→colspan heuristic so warmup can render cells before they mount, and tier-1 first-mount now checks `S._snapTexCache` and applies warmup-cached canvas as initial texture image.
- `fdd47d6` — **CSS comments in the injected `<style>` block broke Chrome's SVG-as-Image parsing**. Stripped every comment from `_mixed3dStyleMermaidSVG`'s CSS string. (Today this turned out to be the FIRST of two SVG-as-Image gotchas; the second was `&AMP;LT;` entity corruption — see `d9ab80b` in today's section.)

## QA tools available

- `python3 tools/qa_mermaid_overflow.py` — scans cached SVGs for text-vs-rect overflow.
- `D`/`` ` `` key in app — bake id/colspan/type badges onto every cached cell canvas.
- `Q`/`P` key in app — dump 16-cell contact sheet PNG.
- `window._debugState` → closure-bound `state`. `_debugState.rendering.cellsById` is cell-data source of truth.
- `window._mixed3dState` → runtime (cellObjects, _snapTexCache, _warmupCount).
- `window._mixed3dStyleMermaidSVG(svg)` → debug the mermaid CSS pipeline directly.
