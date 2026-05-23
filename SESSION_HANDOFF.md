# Session handoff — 2026-05-22 (evening)

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
