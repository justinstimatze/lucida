# Session handoff — 2026-05-21 (overnight pause)

Earlier today's handoff is preserved at the bottom for context. This is the **evening** state.

## Today's load-bearing fixes (in commit order)

- `00891ac` — warmup `_MIXED3D_SKIP_SUBSTRATES` ReferenceError. **The reason "nothing was prerendered" all day.**
- `7395292` — exposed `state` as `window._debugState` so the closure-bound cellsById was inspectable.
- `909b26c` — D + Q debug keys. D bakes id/colspan/type badges onto every cached canvas. Q dumps a 16-cell contact sheet to `refs/gibson/live-shots/qa-contact-sheet-<ts>.png`.
- `5482980` — **warmup enumerates `state.rendering.cellsById` instead of `S.cellObjects`**. cellObjects fills gradually from mount drain, so iterating it at boot-time gave ~20 cells. cellsById is populated synchronously when cells.json loads (2594 entries). Also added cellData→colspan heuristic so warmup can render cells before they mount, and tier-1 first-mount now checks `S._snapTexCache` and applies warmup-cached canvas as initial texture image.
- `fdd47d6` — **CSS comments in the injected `<style>` block broke Chrome's SVG-as-Image parsing**. Stripped every comment from `_mixed3dStyleMermaidSVG`'s CSS string. Identified via bisect: raw mermaid SVG loaded fine, full-CSS-with-comments failed, no-comment-CSS loaded fine. The 94 `[mixed3d] mermaid snap fail: Event` warnings per session traced to this single bug.

## Verified state right after boot

Probe at `body.classList.contains("booted")`:

```
bootMs: 10004    (was 26 pre-fix; warmup actually ran)
warmupTotal: 1244 (was undefined; warmup target set populated)
warmupCount: 214  (rendered 214 cells before warmup resolved)
tier1Cached: 67 / 188
contentfulCells (multi-point alpha probe): 4 of 67
```

## Tomorrow's #1 issue: warmup resolves at ~214 / 1244

Boot dismisses with `warmupCount=214` of `warmupTotal=1244`. At ~10s elapsed, hard-cap (30s) shouldn't fire. Suspect:
- A render path resolves the warmup promise prematurely
- `finish()` fires from an unexpected branch
- Some inflight count desync

Add a `console.log` inside `_mixed3dRunPathWarmup`'s `finish()` printing the call-stack to see WHERE warmup is being declared done.

## Other open items

- Most cells visible post-boot still show **decorative-band stubs** rather than real substrate content. Snap driver catches them at ~17/s steady-state — full fill ~60s post-boot.
- `bootMs=10s` is long — consider letting boot dismiss after a SUBSET (e.g., 200 nearest cells) done; warmup continues in background. Goal-state: visible cells are real on boot, distant cells fill in as camera moves.
- Per-face Muuri pack (#159) phase 1 (variable cell heights matching canvas aspect) is landed; phase 2 (true skyline pack with per-substrate rowspan) deferred.

## QA tools available

- `python3 tools/qa_mermaid_overflow.py` — scans cached SVGs for text-vs-rect overflow.
- `D` key in app — bake id/colspan/type badges onto every cached cell canvas.
- `Q` key in app — dump 16-cell contact sheet PNG.
- `window._debugState` → closure-bound `state`. `_debugState.rendering.cellsById` is cell-data source of truth.
- `window._mixed3dState` → runtime (cellObjects, _snapTexCache, _warmupCount).
- `window._mixed3dStyleMermaidSVG(svg)` → debug the mermaid CSS pipeline directly.

## Earlier-in-day items still relevant

- #154 mermaid Web Worker offload (deferred)
- #159 per-face Muuri pack with variable cell heights (in progress)
- #134 floor lane-light brightness
- #139 restore camera speed 1.0→4.0 when polish wraps

---

# Earlier handoff (morning) — for context

Working surface: **hackers / mixed3d tier-1 rich-substrate rendering (#142)** plus a fresh **Gibson refs corpus** extracted from the Hackers (1995) hacking-scenes video. Tier-1 cells render real content; the color contract was tightened today (pink→purple) and validated against actual movie frames via bmg.

(See git log for `6c62106` and earlier for context.)
