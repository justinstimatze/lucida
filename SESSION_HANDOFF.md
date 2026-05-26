# Session handoff — 2026-05-25 → 2026-05-26

8 commits stacked + pushed to `origin/main`. Focus: camera smoothness diagnostics, viewing-point bias rewrites, substrate-mix rebalance, wide-cell text consistency, helix-Y camera path.

## What landed (pushed to `origin/main`)

| Commit | Subject |
|---|---|
| `1722d68` | Tier-1 cell visibility + camera resume + scan smoothness + access-LRU |
| `ba0be74` | Scan bias targets viewing-point, FOV-aware park, smoother re-entry |
| `0d64007` | Animated_svg renderer centers content in body region |
| `3481f65` | Drop scan-fade-tail — it introduced the jolt it was meant to fix |
| `ab1f05f` | reset_camera_timer uses closest-u resume (same as unpark) |
| `9342356` | Substrate rebalance: cull tool + live quota guard |
| `631c2e8` | Vary swoopy curve Y across waypoints (helix-ish 3D path) |
| `38d0fe7` | Wide tier-2 cells skip InstancedMesh, get colspan-sized texture |

Bundled by theme:

- **Tier-1 visibility**: DoubleSide materials at all three tier-1 mount/swap sites — back-facing cells were invisible through opposite tower faces.
- **Camera continuity**: `_mixed3dUnpark` and `_mixed3dResetCameraTimer` find closest-u on the curve to the current camera position and resume there, seeding `posActual` / `lookAtActual` from the current pose. Eliminates t=0 teleport jolts.
- **Scan smoothness**: Scan-target bias now points at `cell.position + faceNormal * fitDist` (head-on viewing point), not the cell position itself (oblique glance / tower-clip). Removed the scan-fade-tail (it was creating the very jolt it was meant to fix). New `_mixed3dClampOutsideTowers` helper applied to both `desiredPos` (pre-lerp) and `posActual` (post-lerp) so the smoothed path never crosses a tower interior.
- **Helix Y path**: Curve waypoints now span Y 4.5 → 14 instead of all at 4.5. Tier-1 LOD is distance-based, so the camera passing through every Y band evens out tier-1 distribution across the tower face. Removed the `desiredPos.y = 4.5 + sin(...)` override that was flattening the helix.
- **Wide-cell text sizing**: `cs>=2` tier-2 cells skip the InstancedMesh stretch path and use `_mixed3dCellTextureMini` with canvas W scaled by colspan. cell-5027 etc. no longer have giant labels.
- **Snap cache LRU**: New `_mixed3dSnapCacheGet` bumps insertion order on read — fixes mermaid cells drifting to eviction edge while still displayed.
- **Substrate rebalance**: `tools/rebalance_cull.py` dropped cells.json 2981 → 2110 (backup at `cells.json.bak-pre-rebalance-cull`). Live quota guard in `classifier.py` + `orchestrator.py` appends an "OVER/UNDER target" block to the classifier user message so new mints converge toward parity instead of re-skewing.

## Memories written

- `demo_video_encoding_pipeline.md` — never minterpolate screencasts (ghosts UI text), never CFR-cram VFR source (amplifies stutter). Default `-fps_mode passthrough`; RIFE if real interpolation needed; OBS/wf-recorder for new captures.

## Live state

- `cells.json`: 2110 cells. Backup at `cells.json.bak-pre-rebalance-cull`.
- Substrate distribution: mermaid 24%, html 20%, timeline_ribbon 14%, animated_svg 9%, treemap 7%, vega 6.3%, gauge 5.9%, scene3d 5.3%, force_graph 4.2%, sparkline/text/trajectory under 3%.
- `STYLE_V` unchanged.
- Demo videos in `~/Videos/`: `lucida-demo-v2.mp4` (60fps minterpolated — REJECTED), `lucida-demo-v2-30fps.mp4` (30fps CFR), `lucida-demo-v2-vfr.mp4` (VFR passthrough — best current).

## Next-session priorities, user-ordered: 4 → 5 → 3 → 2

### 4. Empty animated_svg investigation

Some recent cells (cell-6320 etc) minted with empty bodies. Likely the animated_svg renderer at `index.html:7558` returning null on certain spec shapes (xlink: handling, malformed SVG root, etc). The null-return path caches a stub forever per the redundant-retry guard at `index.html:8270+`. Need to:

- Instrument the renderer to log which specs return null and why.
- Either fix the specs (specialist regen) or fix the renderer to handle the case.
- Consider distinguishing stub-cache from real-cache so failed specs can re-attempt with backoff.

### 5. Tier-1 demote → InstancedMesh batch (task #195)

Tier-1 cells currently stay as per-cell meshes even after LOD demotes them — they should fold back into the InstancedMesh path. Perf win when the camera moves past large clusters of tier-1 cells.

### 3. Push the next session's work

Just keep stacking + pushing as you go.

### 2. Re-record the demo video

Tonight's polish (helix Y, viewing-point bias, consistent text sizes, substrate balance) materially changes how the dashboard reads. Use OBS or wf-recorder (CFR-native) — GNOME's built-in screencast is VFR and the encoding pipeline can't compensate cleanly (see memory `demo_video_encoding_pipeline`).

## Other open follow-ups

- `cell-6339` flagged unconditional 1.5MB canvas allocation in snap driver — possible memory accumulation; probe next session.
- `tier1_slot_hide_investigation` memory still open — tier-1 cells may not fully replace tier-2 decoratives at their slot.
- Task #138 tier-2 blur fix — referenced earlier; deferred.

## Hot reload checklist

- `?theme=hackers&layout=mixed3d&nocache=1` for full pipeline with snap driver.
- `?theme=hackers&layout=mixed3d&nocache=1&nowarmup=1` for fast iteration (skips ~1 min pre-render but disables snap driver — no real content on tier-1).
- Ctrl+Shift+R via Chrome MCP works (verified, memory `feedback_chrome_mcp_hard_reload`).
