# Session handoff — 2026-05-21 (evening)

Working surface: **hackers / mixed3d tier-1 rich-substrate rendering (#142)** plus a fresh **Gibson refs corpus** extracted from the Hackers (1995) hacking-scenes video. Tier-1 cells render real content; the color contract was tightened today (pink→purple) and validated against actual movie frames via bmg.

Branch: `main`. Last commit: `65487ba`. Working tree clean except untracked dev artifacts (`tools/snap_receiver.py`, `refs/gibson/hackers-video/`, `refs/gibson/live-shots/`).

## ⚠️ Open issue: pending cells (#152 — top priority)

User-visible problem: looking at the live scene, **many cells stay in the diagonal-hatch PENDING placeholder** indefinitely. Steady state has 297+ tier-1 cells unsnapped at any given time.

**Diagnosed today via window._mixed3dSnapDebug():**
- Driver IS running (`intervalActive: true`, `inflightSize: 0` — no stuck slots)
- Cache IS persisted across tier-1↔tier-2 demote (commit 6bf3414 from prev day)
- **Real throughput: ~1.3 cells/sec** vs theoretical ~15/sec
- Bottleneck is single-threaded JS — 3 inflight promises don't actually parallelize because mermaid.parse / canvas paint / SVG image decode all block the main thread
- Camera promotes new tier-1 cells faster than snap can fill → steady-state pending stays high

**Fix candidates (pick when next opening this):**
1. **Camera-distance priority dispatch** (recommended first move) — sort tier-1 unsnapped by distance to camera, process closest-first. Doesn't increase throughput but ensures pending cells are off-screen. Surgical edit in `_mixed3dStartSnapshotDriver` (index.html ~5799).
2. **Web Worker offload** for mermaid SVG + raster. Days of work.
3. **Server-side pre-render** PNG. Architectural shift; conflicts with reflect-and-persist direction.

Probe to verify state at any time:
```js
const S=window._mixed3dState;let t1=0,t1Cached=0,t2=0,t2Cached=0;for(const [id,obj] of (S?.cellObjects||[])){if(obj.isInstanceHandle)continue;const inCache=S._snapTexCache?.has(id);if(obj.userData?.tier===1){t1++;if(inCache)t1Cached++;}else if(obj.userData?.tier===2){t2++;if(inCache)t2Cached++;}}({cacheSize:S._snapTexCache?.size,t1,t1Cached,t1Unsnapped:t1-t1Cached,t2,t2Cached,dbg:window._mixed3dSnapDebug?.()})
```

## ⚠️ Memory note still relevant

The 2026-05-20 OOM cause hasn't changed. Don't raise `_MIXED3D_SNAP_MAX_INFLIGHT` above 3 or hidden-tab `PER_FRAME_CAP` above 12 without a heap check. Bumping concurrency won't help anyway (single-threaded — see #152).

## Quick start to resume

```bash
# Static server (probably running):
python3 -m http.server 8766
# Optional dev tool for headless screenshot validation:
python3 tools/snap_receiver.py  # listens on 8767, writes to refs/gibson/live-shots/
```

URL: `http://localhost:8766/?theme=hackers&layout=mixed3d&notier2=1&_=N`

Useful console one-liners after page boot:
- `window._mixed3dSnapDebug()` — interval + inflight state
- `window._mixed3dStartSnapshotDriver()` — restart the driver if needed
- `window.toggleMixed3dTier2(true/false)` — tier-2 visibility toggle

## What landed today (most recent first)

1. `65487ba` — Snap render 10s timeout via Promise.race + `window._mixed3dSnapDebug()` dev hooks. **Was diagnosing a separate "stuck at 28%" issue that turned out to be probe-error** (module-scoped vars unreachable from window). Timeout still useful as defense-in-depth; debug hooks are essential for ongoing snap diagnostics.
2. `0a34147` — Decorative tier 4% pink row injection → purple (both at initial-paint AND scrolling-update). Source of bmg-flagged FAIL/SHIPPING_FORECASTS-as-pink visible in normal scenes.
3. `d5d3ba5` — Boot gate drops `_stableFrames >= 30` requirement when `document.hidden`. Snap driver could never start on a hidden tab because rAF=1Hz with dt=1000ms never satisfied dt<33.
4. `d4763a4` — **Reverted violet tower-top rim (#122)** and flipped mermaid edge labels + animated_svg `$pink` substitution from pink to purple. User clarified: tower is monochromatic-cyan-OR-purple, not a chromatic mix.
5. `9083809` — Tower-top violet rim (#122) + brighter cone glow (#123, .18→.27 inner alpha). **Note: #122 reverted by next commit (#d4763a4).** Cone glow kept.
6. `e4bcf8a` — Body-fill parity for 5 substrate renderers (gauge / sparkline / timeline_ribbon / force_graph / animated_svg). Extracted shared `_mixed3dPaintCaption` helper. Also dropped pink end-dot from sparkline and pink palette entries from treemap.
7. `9fc01c3` — (morning) Handoff doc update.
8. — Pre-morning state at `c22a36c`.

**Untracked dev artifacts (intentional, not committed):**
- `tools/snap_receiver.py` — POST receiver on :8767 for browser screenshot uploads → `refs/gibson/live-shots/`. Used today for headless validation.
- `refs/gibson/hackers-video/` — 11 frames extracted via ffmpeg + bmg analysis + NOTES.md per-frame breakdown.
- `refs/gibson/live-shots/` — multiple `.png` shots of the live scene (top-rim, eye-level, low-angle, post-fix, etc.) from today's validation.

## Gibson refs corpus (new today)

Source: HACKERS \| Just the Hacking Scenes (MGM, 9:39, https://www.youtube.com/watch?v=IESEcsjDcmM). Extracted 11 frames at hand-picked timestamps spanning the different hack-mode color phases. Each has a bmg vision report. Full per-frame breakdown in `refs/gibson/hackers-video/NOTES.md`.

Highlights:
- **`t07m15s.jpg`** — the Gibson cityscape proper. Cyan + purple tower grid, "GARBAGE" labels repeated across columns, data-grid floor. **Direct visual match to mixed3d.**
- **`t03m00s.jpg`** — labeled vertical list: GARBAGE / COMP. SERVICING / COMPANY BUDGETS / SCIENTIFIC BUDGETS / COMPANY POLICIES / ANNUAL RETURNS / MINE RESEARCH / CENTRAL LIBRARY / QUANTATIVE SPSS / PAYMENT LEVELS / CENTRAL SERVER / KNMTS. EVENT. / LICENSING / DELEGATIONS. **The canonical tower-label vocabulary — wire as synthetic demo content (#149).**
- **`t06m20s.jpg`** — layered semi-transparent data windows over a hex glyph grid; pac-man icon. Future "active-hack overlay" archetype (#150, long-roadmap).
- **`t03m35s` / `t06m50s` / `t08m35s`** — pink/red under-attack states. Long-roadmap (#151), gated on danger-cell-ratio classifier (`danger_cell_ratio` memory).

## Locked-in visual decisions (DON'T re-litigate)

**Updated 2026-05-21:**
- **Tower chrome is monochromatic per tower** — body edges + top rim share one color. Don't ship cyan-body-with-violet-top mixes (#122 was reverted).
- **Normal scenes: cyan + purple only, no pink.** Pink is reserved for the future whole-tower under-attack state. Mermaid edge labels, animated_svg `$pink`, decorative 4% pink injection all flipped to purple.
- **Lucida is calm/ambient by default.** Danger-state archetypes are long-roadmap, not near-term substrate gaps. See `feedback_calm_ambient_default` memory.

Unchanged from prior:
- Tier-1 canvas **192×576** with **72px title block + 504px body**
- Tier-1 title color: **purple `#9966ff`**
- Title rule: thin cyan `#00ddff` at alpha 0.4
- Mermaid: top-anchored width-fill, capped at 70% body height, caption fills below
- Decoratives stay full-cyan
- Tower count stays **10×10 = 100**
- Path-clustering: cells mount only on towers within `spacing * 1.2` (~14u) of camera bezier curve
- Camera slow-scan cadence: ~8-14s between scans
- `?notier2=1` is the A/B comparison knob
- Cone glow inner stops: .27/.13/.03 (was .18/.08/.02)

## Snap pipeline architecture (current)

```
Driver: setInterval(120ms)
  ├─ Skip if mountDraining
  ├─ Take up to BATCH=2 fresh tier-1 targets (cap MAX_INFLIGHT=3)
  ├─ Promise.race against 10s timeout (added today — defense in depth)
  └─ On each promise:
      _mixed3dCompositeAndCacheSnap(S, id, bodyCanvas, cellData):
        - bail if S !== _mixed3dState (stale)
        - paint title block (72px, purple bold, 18-char wrap) onto fresh 192×576
        - drawImage(bodyCanvas, 0, 72)
        - cache UNCONDITIONALLY (line 5789) — preserves entries across tier 1↔2 demote
        - swap material.map.image ONLY if cell is currently tier-1 (line 5791)
```

- 9 renderers in `_MIXED3D_RENDERERS` dispatch
- `_mixed3dSnapInflight` is a Set
- All substrate renderers now receive `(spec, w, h, extras)` with `extras.caption` for body-fill
- Cache invariant: entries deleted only when cell DOM is `!el.isConnected` (RAM cap, session clear) — NOT on tier transition

## Critical bug history (gotchas)

1. **Hidden tab → rAF throttled to 0Hz** → mount drain stalls. Fix: `_mixed3dScheduleDrain` falls back to `setTimeout`. The "fresh tab fixes it" workaround is **no longer needed**.
2. **`_snapTexCache` was unbounded leak** — fixed by deleting on DOM eviction only (NOT tier transition).
3. **Silent-placeholder bug on retier 1→2→1** — fixed by re-applying cached canvas on promote paths.
4. **`PER_FRAME_CAP=60` mount burst OOM'd host.** Pulled back to 12. Don't raise without heap check.
5. **`_mixed3dSnapInterval` module-level, never cleared on teardown** — fixed.
6. **Hidden-tab boot gate stuck** — `_stableFrames >= 30` requires dt<33; hidden-tab rAF has dt=1000. Fixed today (d5d3ba5) — gate drops when document.hidden.
7. **Module-scoped state unreachable from window** — diagnostic probes against `window._mixed3dSnapInterval` always returned undefined. Fixed today (65487ba) — `window._mixed3dSnapDebug()` exposes inflight/interval state.
8. **Pink leakage across mermaid edge labels + animated_svg `$pink` + decorative 4% row injection.** All three flipped to purple today.

## Files to know

- `index.html` — single-file renderer. Key sections in mixed3d:
  - `applyMixed3DLayout` (~2622): scene setup
  - `teardownMixed3DLayout` (~6904): clears snap interval + inflight
  - `_mixed3dDrainMountQueue` (~5980)
  - `_mixed3dScheduleDrain` — rAF/setTimeout chooser based on document.hidden
  - `_mixed3dCellTexture` (~5853): placeholder canvas (diagonal hatch PENDING)
  - `_mixed3dPaintCaption` (~5145): shared body-caption painter
  - `_mixed3dRender{Mermaid,Gauge,Sparkline,Treemap,TimelineRibbon,Vega,ForceGraph,AnimatedSvg,Html}ToCanvas` — substrate renderers
  - `_mixed3dCompositeAndCacheSnap` (~5747): composite + cache + GPU swap
  - `_mixed3dStartSnapshotDriver` (~5799): parallel setInterval driver with 10s render timeout
  - `_MIXED3D_RENDERERS` table (~5734): dispatch by `cell_type`
  - `_mixed3dSwapCellTier`, `_mixed3dPromoteInstanceToTier1`: both re-apply cached snap on promote
- `tools/snap_receiver.py` — POST receiver for headless screenshot validation (NOT yet committed)
- `refs/gibson/hackers-video/NOTES.md` — Gibson frame analysis
- `cells.json` — 2594 cells (2531 real + 63 ambient). 1248 mount in mixed3d after awaiting-filter.

## What I should NOT redo without checking with user

- Don't darken decoratives
- Don't reduce tower count
- Don't rotate tier-1 titles vertically
- Don't bring back html2canvas for snapshot pipeline
- Don't change `#notebook` from `display:none` in mixed3d mode
- Don't redo path-clustering math
- Don't raise `_MIXED3D_SNAP_MAX_INFLIGHT` above 3 without heap check
- Don't raise hidden-tab `PER_FRAME_CAP` above 12
- Don't land IndexedDB cache (#147) yet
- **Don't re-introduce pink to cell-level chrome** (tower-level only, under-attack state)
- **Don't ship cyan-body-with-violet-top mixes** — tower is monochromatic
- **Don't propose danger archetypes as near-term substrate gaps** (calm-ambient default)

## Open priority queue

Pending tasks ranked roughly by likely-next-up:
- **#152** Snap throughput / pending-cells (TOP — user-visible issue)
- #149 Synthetic Gibson tower-label demo content (calm-mode, cheap, uses today's refs)
- #134 Floor lane-light brightness/contrast (paused in_progress)
- #80 Real-bezel chrome generalization
- #109 Pink-column part is now obsolete; scanline-framing part still valid — needs reframe
- #150 Layered data-window overlay (long-roadmap)
- #112 Inter-tower data pulses
- #139 Restore camera speed 1.0 → 4.0
- #151 Danger archetypes (long-roadmap, gated)
- #147 IndexedDB persistence (deferred per user)
