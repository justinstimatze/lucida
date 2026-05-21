# Session handoff — 2026-05-20

Working surface: **hackers / mixed3d tier-1 rich-substrate rendering (#142)** — making tier-1 cells render actual content (mermaid graphs, gauges, sparklines, etc.) instead of abstract sketches.

Branch: `main`. Last commit: `bd13a68` (revert of 4b10bce). Working tree clean.

## Critical issue going into next session

**Mount drain is intermittently broken.** After ~3 reloads in the same Chrome tab during today's session, `_mixed3dDrainMountQueue` stalls at 0 cells / 1248 queued. Same exact code that worked in a freshly-created tab fails after several reloads. **Almost certainly an MCP browser-tab state issue, not code.** Today's pattern: kill the tab + create a fresh one → mount works.

If next session opens and `realCells: 0` after 30s wait, **close the tab + open a new one**, don't waste time debugging code first.

## Quick start to resume

```bash
# Server (probably running; check with: curl -sI http://localhost:8766/ | head -1)
python3 -m http.server 8766
```

Open `http://localhost:8766/?theme=hackers&layout=mixed3d&notier2=1&_=N` (use a unique `_=N` cache-bust each time).

Useful URL params:
- `?notier2=1` — hides tier-2 cells, so you can A/B compare tier-1 + decoratives only. Runtime toggle via console: `toggleMixed3dTier2(true)` / `toggleMixed3dTier2(false)`.

## What landed today (most recent first)

1. `bd13a68` — Revert of `4b10bce` (title-composite broke mount; functionally equivalent to `7d0ca9a` now).
2. `4b10bce` — REVERTED. Tried to compose title-at-top + body in driver; broke mount.
3. `7d0ca9a` — Added 5 substrate renderers: timeline_ribbon, vega, force_graph, animated_svg, html. ~60% of tier-1 PENDING-forever cells get real renders.
4. `585377e` — PENDING placeholder (diagonal hatch + purple stamp) instead of abstract sketch. Persistent tier-2 hide via setInterval re-apply. Added gauge/sparkline/treemap renderers.
5. `1951326` — Bold mermaid palette: hackers-colored CSS injected into rendered SVG. Tier-2 suppress toggle.
6. `fbc5539` — Tier-1 mermaid snapshot pipeline (setInterval driver, single in-flight, ~1.5s cadence). Mermaid renders via `mermaid.render(spec)` → SVG → Image → canvas.
7. `c7562c0` — Cluster cells along camera path (was inner-radius). 48 path-adjacent towers densify; 52 off-path stay decorative-backdrop.
8. `0317d54` — Initial (wrong) attempt at clustering — radius from origin, but path is at radius 37-50 from origin not <30. Replaced by `c7562c0`.
9. `44ba20e` — Filter awaiting-mint cells (50% of cells.json was placeholder PROPOSALs). Fixed Muuri layout-wipe bug in 2D pack.
10. Earlier today: `c7b56b0` purple tier-1 title color; `5742d4d` tier-1 canvas res bump to 192×576.

## Open #142 state

Current state (commit `bd13a68`, identical to `7d0ca9a`):

- 9 substrate renderers in `_MIXED3D_RENDERERS` table dispatch:
  - `mermaid` (async, ~500ms each)
  - `gauge`, `sparkline`, `treemap`, `timeline_ribbon`, `vega`, `force_graph` (synchronous, fast)
  - `animated_svg` (async, fast)
  - `html` (synchronous, draws title chip + caption text — no real HTML render)
- Setinterval(800ms) driver, single in-flight via `_mixed3dSnapInflight` flag.
- Driver bails on `S.mountDraining === true`.
- Renderer output replaces `material.map.image` + `needsUpdate = true`.
- Cache in `S._snapTexCache: Map<cellId, canvas>`.
- Re-applies tier-2 suppression each tick (handles tier-1↔tier-2 demote churn).

**Mount drain reaches 1248 cells, drain finishes, then driver starts snapping. ~80 snapshots per minute peak (mermaid is bottleneck).**

## Open #142 follow-ups (didn't land today)

1. **Title persists across snapshot generations.** Renderers replace the WHOLE canvas; the placeholder's title (drawn by `_mixed3dCellTexture`) is wiped. Fix is: driver composites title-at-top + body-canvas (renderers paint into body region only). I tried this in `4b10bce` and it broke mount; needs careful investigation.

2. **Mermaid graph too small** in 192×576 portrait canvas. User: "title, vertical space, tiny mermaid, more vertical space". Fix is part of #1 — anchor graph at top of body, fill empty space below with caption text. Mermaid renderer is set up to accept `extras: { caption, title }` already.

3. **Vega cells have complex specs** my naive bar-chart renderer might miss edge cases — verify after fresh tab works.

## Locked-in visual decisions

These are tested and validated; don't re-litigate.

- Tier-1 canvas 192×576 (matches tier-2 shared)
- Tier-1 title color: **purple `#9966ff`** — pink reserved for danger signal
- Mermaid palette: cyan nodes / purple edges / pink edge labels, 3-4px strokes
- Decoratives stay full-cyan `rgba(0, 221, 255, ...)` — user vetoed darkening
- Tower count stays **10×10 = 100** — user vetoed reducing
- Path-clustering: cells mount only on towers within `spacing * 1.2` (~14u) of camera bezier curve
- Camera slow-scan cadence: ~8-14s between scans (was 30-50s)
- `?notier2=1` is the A/B comparison knob

## Critical bug history (gotchas)

1. **MCP browser tab state degrades after multiple reloads** — mount drain stalls. Fresh tab fixes it. Today this happened 3-4 times.
2. **Adding html2canvas via `<script defer>` broke mount** in 3 swings before I tried a fresh tab — the script tag alone seems to interact poorly with mount drain in stale tabs. Use cache-bust URL param.
3. **Title-composite (4b10bce) broke mount** — code review showed nothing obviously wrong. May be tab-state related; revert was the right call.
4. **`cells.json` HEAD returns 503** from Python http.server — pollAll falls through to GET. Noisy but non-fatal.

## Files to know

- `index.html` — single-file renderer. Key sections in mixed3d (~lines 2576-6500):
  - `applyMixed3DLayout` (~2583): scene setup
  - `_mixed3dDrainMountQueue` (~5419): mounts cells from queue
  - `_mixed3dCellTexture` (~5106): builds the placeholder canvas + diagonal hatch PENDING
  - `_mixed3dRenderMermaidToCanvas` (~5120): mermaid pipeline
  - `_mixed3dRender{Gauge,Sparkline,Treemap,TimelineRibbon,Vega,ForceGraph,AnimatedSvg,Html}ToCanvas` — substrate renderers
  - `_mixed3dStartSnapshotDriver` (~5520): setInterval driver
  - `_MIXED3D_RENDERERS` table (~5510): dispatch by `cell_type`
  - `_mixed3dApplyTier2Visibility` (~5180): tier-2 hide
  - Tier-1 promotion logic: `_mixed3dRetierSweep` (~4742), `_mixed3dPromoteInstanceToTier1` (~4692)
- `notebook.css` — `body.layout-mixed3d #notebook { display: none }` (currently — DO NOT change to position:absolute, will eat boot perf)
- `cells.json` — 2594 cells (2531 real + 63 ambient). 1248 mount in mixed3d after awaiting-filter.

## User-stated visual targets carry into next session

- Tier-1 cells "almost as legible as 2D dashboard" during flyby
- "Diagrams pretty thin and uninspiring" → addressed by bold mermaid palette (1951326)
- "Abstract sketch should be obvious placeholder" → addressed by PENDING (585377e)
- "Suppress tier 2 for comparison" → `?notier2=1` flag
- Mermaid sizing inside narrow cells — outstanding (#142 followup 1+2)

## Pending tasks (priority order for next session)

- **#142** open — title-persistence + mermaid-sizing follow-ups (see above)
- **#139** Restore camera speed 1.0 → 4.0 when polish wraps
- **#134** Floor lane-light brightness (in_progress, paused)
- **#135** Pink-ratio audit
- **#129** audit-404 cleanup
- **#132** Tech-debt sweep

## Probes that proved useful

```js
// Snapshot driver state
(()=>{const S=window._mixed3dState;return{realCells:S?.cellObjects?.size,snapCache:S?._snapTexCache?.size||0,mountQueueLen:S?.mountQueue?.length||0,booted:S?._booted,mountDraining:S?.mountDraining};})()

// Tier-1 cells by substrate type + snapshot status
(()=>{const S=window._mixed3dState;const byType={};const snapByType={};for(const [id,obj] of S.cellObjects){if(obj.isInstanceHandle)continue;if(obj.userData?.tier!==1)continue;const ct=obj.userData?.cellEl?.dataset?.cellType||'?';byType[ct]=(byType[ct]||0)+1;if(S._snapTexCache?.has(id))snapByType[ct]=(snapByType[ct]||0)+1;}return {tier1ByType:byType,snappedByType:snapByType};})()

// Camera path radius check (verifies path-clustering still works)
(()=>{const S=window._mixed3dState;const sw=S.swoopCam;const pts=[];for(let i=0;i<10;i++){const p=sw.curve.getPointAt(i/10);pts.push(+Math.hypot(p.x,p.z).toFixed(1));}return {pathRadii:pts};})()
```

## What I should NOT redo without checking with user

- Don't darken decoratives (user vetoed)
- Don't reduce tower count (user vetoed)
- Don't rotate tier-1 titles vertically (user vetoed)
- Don't bring back html2canvas for snapshot pipeline (mermaid SVG path works fine)
- Don't change `#notebook` from `display:none` in mixed3d mode (eats boot perf)
- Don't redo path-clustering math — `c7562c0` is verified correct (path radius 37-50, threshold 14u from curve)
