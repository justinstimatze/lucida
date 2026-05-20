# Session handoff — 2026-05-19

Working surface: **hackers / mixed3d visual polish round** toward public-release quality.
Branch: `main`. Last commit: `911db3e` (pushed). Working tree clean except for 4 untracked backup/note files (safe to ignore).

## Quick start to resume

```bash
# server (probably not running)
python3 -m http.server 8766
```

Open <http://localhost:8766/?theme=hackers&layout=mixed3d>. Eurostile font loads via @font-face in notebook.css. Camera path is closed-loop swoopy-tour.

## What just landed this session (most recent first)

1. `911db3e` — terminal-scroll polish (temp canvas + line variety + faster scroll). User: "really good actually"
2. `5695224` — replaced UV-scroll with real canvas line-jump animation
3. `98aae72` — top/bottom face padding + scrolling/blinking animation
4. `4fc7f93` — fixed dead `inst` reference after 16-texture refactor
5. `46303d1` — 16 decorative textures + `cellW` spacing + half-thick edges + top-rim color matches body
6. `07a9b04` — DoubleSide + edge buffer + less hex
7. `80c0015` — **E/W face normal direction bug** fix in NESW + camera speed temp slow
8. `f5bf216` — transparent glyphs (alphaTest) + line-shape variety in decoratives
9. `5c24558` — hide decoratives behind real cells + fog bump + FrontSide (later reverted)
10. `f844003` — `tools/gen_ambient.py` — 63 real-data ambient panels
11. `c1046fa` — recency-bias on tier-1 retier sweep
12. `d0b0f03` — initial decorative-tier InstancedMesh
13. `148eb25` — tier-2 per-instance color tint
14. `258c111` — tower edge brightness boost (#133)
15. `7640b2d` — **T-not-defined regression fix** (had been silently breaking retier sweep since 5de82e6)
16. cells.json cull (not git-tracked) — dropped 11,835 perf-fill clones + 749 text cells. Backup at `cells.json.before-cull-*`.

## Pending tasks for next session

- **#138** — Tier-2 cells crispness pass. User: "tier 2 cells are too blurry and hard to see. lines should be chunkier, text bolder, closer to the decorative cells". Strategy options in the task description.
- **#139** — Restore camera speed 1.0 → 4.0 in index.html ~line 3924 when polish wraps.
- **#134** floor lane-lights (in_progress, paused mid-task many turns ago)
- **#135** pink-ratio audit + scene contrast
- **#128** debug logging cleanup (gate `[mixed3d]` per-frame logs behind `?debug=1`)
- **#132** tech-debt sweep (cells.json atomic write, security audit, mount-lifecycle test, README docs)
- **#136** dependabot moderate vulnerability triage
- See `TaskList` for the rest.

## Locked-in visual decisions

These were tested and accepted; don't re-litigate without strong reason.

- **DoubleSide** on decorative material — user explicitly accepted mirrored back-face text as the trade-off for "all 4 faces visible always"
- **Tower glass opacity 0.025** — see-through canyon depth is desired
- **Edge tubes 0.06 thick** (half of original 0.12)
- **Top rim color = edge color** (no white lerp)
- **`slotW=0.78` for positioning, `cellW=0.62` for cell mesh width** — separates pitch from cell size, gives both edge buffer and inter-column gap
- **Top/bottom face padding 0.5u** (baseY=0.5, topPad=0.5 in `_mixed3dPlanColumn`)
- **alphaTest on decoratives, not transparent:true blend** — hard glyph silhouette, no painter's-algorithm overlap artifacts
- **16 decorative textures** with per-slot hash-picked mesh — variety without per-instance shader work
- **Real-canvas line-jump scrolling** (NOT UV.y offset) — uses scratch temp canvas to avoid drawImage canvas-to-self overlap smear
- **Decorative animation: scroll period 0.8-1.6s, pulse ±0.08, blink to 0.25 for 80ms every ~4s**
- **Tier-1 and tier-2 cells DO NOT animate** — only decoratives do
- **cells.json: 2,594 cells** (2,531 real session content + 63 ambient panels). No perf-fill, no text. Don't run `perf_fill.py` against this file again.
- **Recency-bias in retier sweep** — `_retierKeys` sorted by `data-timestamp` desc on each cycle rebuild

## Critical bug history (gotchas)

1. **NESW E/W rotY were reversed** — for weeks, real cells on east/west tower faces rendered with MIRRORED textures. Fixed 2026-05-19 in `80c0015`. The probe `tower.faces[i].rotY` should give plane normal direction matching `dx/dz` sign for all 4 faces. Always run that probe if face orientation feels off.
2. **`drawImage` canvas-to-self with overlapping rectangles is undefined** — produced smearing when I tried to shift canvas content for scrolling. Fix: use a scratch canvas intermediary (S._decoScrollTempCan), two non-overlapping calls.
3. **`T is not defined`** silently broke tier promotion for weeks after `5de82e6` — `_mixed3dRetierSweep` used `new T.Matrix4()` without `const T = window.THREE;` at function top. The thrown exception aborted retier mid-loop. Console drowning in 1000+ exceptions was the smoking gun.

## Files to know

- `index.html` — single-file renderer + mixed3d code. `applyMixed3DLayout` around line 2583. `_mixed3dBuildDecorativeLayer` around line 5500. `_mixed3dStepDecoratives` is the per-frame animation hook.
- `notebook.css` — themes. `theme-hackers` block + Eurostile @font-face at top.
- `tools/gen_ambient.py` — generates 63 real-data ambient panels from `mint_log.jsonl` + `cells.json`. Run with `--merge` to append into cells.json.
- `tools/gen_floor.py` — bakes `assets/floor_baked.png` (the magenta PCB floor).
- `themes/hackers.tokens.json` — theme color/font tokens.
- `refs/gibson/` — reference screenshots from the movie. `canyon_flythrough.png` is the gold standard for canyon look.

## Probes that proved useful

```js
// Face normal check (any tower)
(()=>{const S=window._mixed3dState;const T=window.THREE;const t0=S.towerMeshes[0];return t0.faces.map((f,i)=>{const q=new T.Quaternion().setFromEuler(new T.Euler(0,f.rotY,0,'XYZ'));const n=new T.Vector3(0,0,1).applyQuaternion(q);return{face:i,out:f.dx>0?'+X':f.dx<0?'-X':f.dz>0?'+Z':'-Z',normal:[n.x.toFixed(1),n.z.toFixed(1)]};});})()

// Decorative + tier counts
(()=>{const S=window._mixed3dState;return{decorativeMeshes:S?._decorativeMeshes?.length||0,realCells:S?.cellObjects?.size||0,tier1:S?.tier1Count||0,mountQueue:S?.mountQueue?.length||0};})()

// FPS sample over 60 frames
(()=>{let last=performance.now(),frames=0;const samples=[];return new Promise(r=>{const loop=()=>{const now=performance.now();samples.push(now-last);last=now;frames++;if(frames<60)requestAnimationFrame(loop);else{samples.sort((a,b)=>a-b);r({p50:+samples[30].toFixed(1),p95:+samples[57].toFixed(1),fps:+(1000/samples[30]).toFixed(1)});}};requestAnimationFrame(loop);});})()
```

## User-stated visual targets (carry into next session)

- Tier 2 cells should be "as visually crisp as the decorative cells are now" — #138
- "Tower city always looks full at all times" — landed via decorative tier
- Real cells the camera is approaching should be "as usefully relevant and recent as possible" — landed via recency-bias retier
- "Bright text on basically transparent glass (behind which is a dark background)" — landed via alphaTest on decoratives
- "Old-school terminal with characters appearing and lines dropping by a newline" — landed via canvas line-jump animation

## What I should NOT redo without checking with user

- Don't switch decoratives back to FrontSide — user accepted mirrored back as feature
- Don't switch back to UV-scroll animation — partial rows looked sloppy
- Don't re-run perf_fill.py against cells.json — already culled
- Don't bump tower glass opacity above 0.025 — kills canyon depth
- Don't change rotY on N/S/E/W faces — recently fixed, verified correct via probe
- Don't add transparent:true to tier-1/2 cell substrates without thinking — the alphaTest+depthWrite path on decoratives is what gave crisp text
