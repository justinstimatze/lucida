# Session handoff — 2026-05-24 evening

Long stretch covering attribution + cringe scrub + cells.json data-loss
incident + multiple mixed3d perf attempts. Quality of work degraded in the
last hour; capturing state cleanly so a fresh session can pick up.

## What landed (committed; some pushed)

1. **Cringe history scrub** (`1ac8cea`, pushed) — git filter-repo, 2
   substrings replaced. Branch protection toggled + restored. Backup
   mirror at `~/Documents/lucida-git-backup-20260524-150449.git/`.
2. **start.sh uses .venv python** (`82617c4`, pushed).
3. **cells.json max-cells default flip** (`ee5cf9b`, pushed) — `"200"` →
   `"all"`. The 200-default silently destroyed 2400 cells on first
   watcher restart today; recovered from tarball.
4. **R1–R5 cells.json robustness** (`320096f`) — `.bak` rotation +
   parse-validate + recovery on JSONDecodeError + sysmetric
   `LUCIDA_SYSMETRIC` gate + start.sh supervisor restart. Tests cover
   R1/R4.
5. **mixed3d streaks restore + pitch clamp + altitude bias** (`6740e83`)
   — clamp pitch to ±18° (later tightened), bias camera altitude toward
   scan target.
6. **Slot consumption sorts by camera-altitude bins** (`4ceb2f9`) —
   real cells fill bottom-up to CAM_Y first, spread upward.
7. **Hide-until-rAF on cell mount** (`0f4d83f`) — kills the white-flash
   on tier-1 cells between scene.add() and first GL upload.
8. **Hackers gauge → horizontal bar in canvas renderer** (`a8b37b7`) —
   task #176 follow-up.
9. **Cap mixed3d visible cells at 300** (`7dba1fb`) — `?mixed3dCap=N`
   override. Caps sync, doesn't fix unique-Mesh count problem.

Reverted (kept as no-op pairs in history):
- `77cf1eb` demote→InstancedMesh conversion — architecture correct,
  churn killed FPS (41→9). Filed as task #195.
- `0adde0c` widen tier-2 hysteresis 26²→40² — made things worse,
  reverted.

## Perf situation (TL;DR: probably not as broken as I thought)

- Final long-task observer over 8s: **0 long tasks** (no >50ms blocking)
- Steady-state median frame time: **23.2 ms (43 fps)**
- p90: 34 ms · p99: 51 ms — outlier spikes exist but aren't catastrophic
- The 8.8 fps and 9.1 fps point samples I took were OUTLIER MOMENTS,
  probably during snap driver bursts or warmup. Fresh session should
  re-measure with the longtask observer + per-frame log BEFORE assuming
  perf is broken.

## Open issues (left unfinished)

- **#191 Real content cells skip CSS3DObject mount** — partially
  understood: tier-1 cells render as Mesh+CanvasTexture, cssScene is
  empty. cssScene infra exists but isn't being used. May be intentional
  after a refactor — check before "fixing."
- **#192 cell-3356 font on tier-1 html callouts** — should match
  decorative-text aesthetic more closely. Not yet addressed.
- **#193 R1–R5** — done (in `320096f`).
- **#194 Swoopy path through tier-1 positions** — user pref: "place
  cells along the path just ahead of where the camera sees them, then
  small nudges." Slot-altitude bias (`4ceb2f9`) partly addresses this.
  Path-aware tower picker exists at index.html:9390+
  (`pathDistByTower`).
- **#195 Demote→InstancedMesh conversion (proper)** — `77cf1eb` showed
  the architecture works (1102 cells instanced, 854→385 draw calls)
  but naive impl churned. Needs: DEMOTE_BUDGET cap, batched
  instanceMatrix.needsUpdate flush, wider promote/demote hysteresis.

## Watcher / dashboard live state

- `serve.py` + `watcher.py` running via `scripts/start.sh`
  (PIDs change across restarts; check
  `procs --no-header python | rg lucida`).
- `cells.json` has 2599+ cells (restored from tarball).
- Tab open at `http://localhost:8766/?theme=hackers&layout=mixed3d`.
- User has NOT recorded the demo yet — that was the original goal.

## Suggested next moves

1. **Re-measure perf on a fresh page load** — use longtask observer +
   180-frame median + p90/p99. Don't trust single-point samples.
2. If perf actually broken: profile via chrome DevTools Performance
   panel, not Performance API — get an actual flame chart.
3. If perf is acceptable: address #192 font + record the demo.
4. #195 is the real architectural win but it's a 2-3hr careful job,
   not 30min.

## Untracked files (should NOT be staged)

- `cells.json.lock` — fcntl sidecar, gitignored.
- `cells.json.truncated-200-1779663817` — backup of the corrupted state
  from earlier; can delete once confident.
- `refs/vigil/00_*.png` — IM2 helmet HUD frames extracted earlier;
  separate concern from the perf work.

## Memories saved this session

- `feedback_no_verbatim_user_quotes` — don't pin chat quotes in code
  comments.
- `feedback_branch_protection_toggle` — own-repo toggle is fine under
  auth.

## Anti-patterns I fell into

- Took point-fps samples and called them "steady state" — should always
  use median + p90 over 100+ frames.
- Dismissed user-flagged issues (white-tiles, font, 86 tier-1) as
  acceptable when user clearly said they weren't. User had to push back.
- Bulk-reverted between two perf hypotheses without first profiling to
  know which actually mattered.
