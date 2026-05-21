# Session handoff — 2026-05-20 (evening update)

Working surface: **hackers / mixed3d tier-1 rich-substrate rendering (#142)** — tier-1 cells now render real content (mermaid graphs, gauges, sparklines, etc.) with persistent titles and parallel snap generation.

Branch: `main`. Last commit: `c22a36c`. Working tree clean.

## ⚠️ Memory note up front

Today the host OOM'd while testing the parallel snap driver. Root cause was a `_snapTexCache` leak (fixed) plus too-aggressive concurrency caps (lowered). Stay alert if you make snap-driver changes — `_MIXED3D_SNAP_MAX_INFLIGHT` is now 3, do not raise without checking heap.

## Quick start to resume

```bash
# Server (probably running; check with: curl -sI http://localhost:8766/ | head -1)
python3 -m http.server 8766
```

Open `http://localhost:8766/?theme=hackers&layout=mixed3d&notier2=1&_=N` (unique `_=N` cache-bust each time).

Useful URL params:
- `?notier2=1` — hides tier-2 cells, so you can A/B compare tier-1 + decoratives only. Runtime toggle via console: `toggleMixed3dTier2(true)` / `toggleMixed3dTier2(false)`.

## What landed today (most recent first)

1. `c22a36c` — Teardown clears `_mixed3dSnapInterval` + `_mixed3dSnapInflight`; stale-state guard in composite (correctness, not memory).
2. `6bf3414` — Fix `_snapTexCache` leak on DOM eviction + silent-placeholder bug after retier-promote. **Cache now scoped to live cells; ceiling ~177MB instead of unbounded over session.**
3. `75ba261` — Tighter OOM-safer caps: snap concurrency 8→3, batch 4→2, hidden-tab mount cap 60→12. (60 caused the OOM.)
4. `86aaa16` — Title-at-top composite in driver + parallel snap dispatch. **4-min boot fill → ~10-15s on visible tab.** Renderers paint into 192×504 body region; driver composites with 72px title block + cyan rule. Mermaid renderer anchors top-aligned width-fill with caption filling space below.
5. `215d036` — `_mixed3dScheduleDrain` helper falls back to `setTimeout(16)` when `document.hidden` (rAF is 0Hz on hidden tabs). **This is the real root cause of what the morning handoff called "MCP browser tab state degradation"** — visibility-throttled rAF, not stale tab state.
6. `f06c2b4` — (this morning) Original handoff doc.
7. `bd13a68` — Revert of `4b10bce`. Note: 86aaa16 effectively re-lands 4b10bce now that 215d036 fixes the underlying rAF stall that made 4b10bce look broken.

## #142 — what's done vs open

**Done today:**
- ✅ #145 Title persists across snapshot generations (driver composites)
- ✅ #146 Mermaid graph anchors top, caption fills below
- ✅ Parallel snap driver (was single-in-flight)
- ✅ Hidden-tab boot fallback

**Open (in priority order):**
- Other substrate renderers may want caption-fills-empty-space treatment too (mermaid was the obvious one; gauges/sparklines might benefit similarly).
- #80 Real-bezel chrome generalization
- #122 Tower-top violet accent rim
- #123 Cone glow brightness tune
- #134 Floor lane-light brightness/contrast (in_progress paused)
- #135 Pink-ratio audit
- #139 Restore camera speed 1.0 → 4.0 when polish wraps
- #147 IndexedDB persistence for `_snapTexCache` — **deferred** (user 2026-05-20: "right now things are changing too fast"). Wiring sketch in task #147.

## Snap pipeline architecture (current)

```
Driver: setInterval(120ms)
  ├─ Skip if mountDraining
  ├─ Take up to BATCH=2 fresh tier-1 targets (cap MAX_INFLIGHT=3)
  ├─ Dispatch renderer(arg, 192, 504, {caption, title}) in parallel
  └─ On each promise:
      _mixed3dCompositeAndCacheSnap(S, id, bodyCanvas, cellData):
        - bail if S !== _mixed3dState (stale)
        - paint title block (72px, purple bold, 18-char wrap) onto fresh 192×576
        - drawImage(bodyCanvas, 0, 72)
        - cache, swap material.map.image, needsUpdate
```

- 9 renderers in `_MIXED3D_RENDERERS` dispatch (mermaid, gauge, sparkline, treemap, timeline_ribbon, vega, force_graph, animated_svg, html)
- `_mixed3dSnapInflight` is a Set (was a boolean)
- `_mixed3dCompositeAndCacheSnap` hoisted helper — title composite + cache + GPU swap

## Tier-1 retier promote paths (just fixed)

Both `_mixed3dSwapCellTier` (newTier=1 path) and `_mixed3dPromoteInstanceToTier1` now re-apply the cached snap canvas onto the fresh placeholder texture if `_snapTexCache.has(id)`. Without this, demote→promote left cells stuck on the placeholder forever because the driver skips cached cells.

## Locked-in visual decisions (DON'T re-litigate)

- Tier-1 canvas **192×576** with **72px title block + 504px body**
- Tier-1 title color: **purple `#9966ff`** — pink reserved for danger signal
- Title rule: thin cyan `#00ddff` at alpha 0.4
- Mermaid: top-anchored width-fill, capped at 70% body height, caption fills below
- Mermaid palette: cyan nodes / purple edges / pink edge labels, 3-4px strokes
- Decoratives stay full-cyan `rgba(0, 221, 255, ...)` — user vetoed darkening
- Tower count stays **10×10 = 100** — user vetoed reducing
- Path-clustering: cells mount only on towers within `spacing * 1.2` (~14u) of camera bezier curve
- Camera slow-scan cadence: ~8-14s between scans
- `?notier2=1` is the A/B comparison knob

## Memory characterization (from today's audit)

| Source | Size | Bounded? |
|---|---|---|
| Tier-1 unique canvases (live) | ~177MB (400 × 442KB) | TIER1_CAP=400 |
| `_snapTexCache` | ~177MB | now bounded ↔ live cells (was unbounded) |
| Decorative tier textures | ~26MB JS+GPU (16 × 256×768) | once at boot |
| Tier-2 shared mats | ~26MB (~30 × 442KB) | once at boot |
| `state.rendering.cellsById` | ~15-30MB | server-cull bounded |

No other unbounded leaks found code-side.

## Critical bug history (gotchas)

1. **Hidden tab → rAF throttled to 0Hz** → mount drain stalls indefinitely. Fix landed: `_mixed3dScheduleDrain` falls back to `setTimeout`. The "fresh tab fixes it" workaround from morning handoff is **no longer needed**; it was diagnostic noise.
2. **`_snapTexCache` was unbounded leak.** Every DOM-evicted cell stuck its ~440KB canvas in the cache forever. Fixed.
3. **Silent-placeholder bug on retier 1→2→1.** Cache hit blocked re-snap, fresh material got placeholder. Fixed by re-applying cached canvas on promote.
4. **`PER_FRAME_CAP=60` mount burst OOM'd host.** Pulled back to 12 (still 4× over visible-tab default). Don't raise without a heap check.
5. **`_mixed3dSnapInterval` was module-level**, never cleared on teardown. Wasted ticks across theme/layout switches. Cleared now.
6. **`cells.json` HEAD returns 503** from Python http.server — pollAll falls through to GET. Noisy but non-fatal.

## Files to know

- `index.html` — single-file renderer. Key sections in mixed3d:
  - `applyMixed3DLayout` (~2622): scene setup
  - `teardownMixed3DLayout` (~6867): now clears snap interval + inflight
  - `_mixed3dDrainMountQueue` (~5946 area)
  - `_mixed3dScheduleDrain` — rAF/setTimeout chooser based on document.hidden
  - `_mixed3dCellTexture` (~5891): placeholder canvas (diagonal hatch PENDING)
  - `_mixed3dRender{Mermaid,Gauge,Sparkline,Treemap,TimelineRibbon,Vega,ForceGraph,AnimatedSvg,Html}ToCanvas` — substrate renderers (paint 192×504 body)
  - `_mixed3dCompositeAndCacheSnap` (~5710): composite + cache + GPU swap
  - `_mixed3dStartSnapshotDriver` (~5748): parallel setInterval driver
  - `_MIXED3D_RENDERERS` table (~5697): dispatch by `cell_type`
  - `_mixed3dSwapCellTier` (~4662), `_mixed3dPromoteInstanceToTier1` (~4709): both re-apply cached snap
- `cells.json` — 2594 cells (2531 real + 63 ambient). 1248 mount in mixed3d after awaiting-filter.

## Probes that proved useful

```js
// Snap driver state + tier-1 mix + snap coverage
(()=>{const S=window._mixed3dState;const byType={};const snapByType={};let t1=0,sn=0;for(const [id,obj] of S.cellObjects){if(obj.isInstanceHandle)continue;if(obj.userData?.tier!==1)continue;t1++;const ct=obj.userData?.cellEl?.dataset?.cellType||'?';byType[ct]=(byType[ct]||0)+1;if(S._snapTexCache?.has(id)){sn++;snapByType[ct]=(snapByType[ct]||0)+1;}}return{realCells:S?.cellObjects?.size,snapCache:S?._snapTexCache?.size||0,mountQueueLen:S?.mountQueue?.length||0,mountDraining:S?.mountDraining,hidden:document.hidden,tier1Total:t1,snappedTotal:sn,pct:t1?(sn/t1*100).toFixed(0)+'%':'n/a',byType,snapByType};})()

// Camera path radius (verifies path-clustering still works)
(()=>{const S=window._mixed3dState;const sw=S.swoopCam;const pts=[];for(let i=0;i<10;i++){const p=sw.curve.getPointAt(i/10);pts.push(+Math.hypot(p.x,p.z).toFixed(1));}return {pathRadii:pts};})()
```

## What I should NOT redo without checking with user

- Don't darken decoratives (user vetoed)
- Don't reduce tower count (user vetoed)
- Don't rotate tier-1 titles vertically (user vetoed)
- Don't bring back html2canvas for snapshot pipeline (mermaid SVG path works fine)
- Don't change `#notebook` from `display:none` in mixed3d mode (eats boot perf)
- Don't redo path-clustering math — `c7562c0` verified
- Don't raise `_MIXED3D_SNAP_MAX_INFLIGHT` above 3 without heap-check (OOM history)
- Don't raise hidden-tab `PER_FRAME_CAP` above 12 (OOM history)
- Don't land IndexedDB cache (#147) yet — substrate/renderer surface still in flux
