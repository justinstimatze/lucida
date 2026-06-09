# Belter references — The Expanse, OPA / Belter / Free Navy FUI

Theme id: `belter`. Faction: Outer Planets Alliance / Belters / Free Navy. The brand IS
eclecticism — salvaged, repurposed, multi-faction gear. "Waste not, want not."

## Incoming frame (re-assigned from refs/rocinante, user curation 2026-06-09)

`roci_threat_response_orbital.png` — actually a Free Navy screen (clip
`pPutN_QzbeE`, the same clip all `bel_pPutN_*` frames came from); had been
mis-filed as roci "calm-ops" and was nearly used to justify mars-blue changes.
Filename kept for provenance. Grammar: violet orbital plot + starfield speckle +
top-hanging yellow ▼ stalk pips + left bar-gauge column + ship-self wireframe.

## Sources

- `mlN8azjGuTc` — "The Expanse — 5x01 Tycho Station Opening Scene" (4:31). Belter corridors,
  the OPA split-circle logo, the translucent hand terminal. Real show footage.
  **NO 2D screen interfaces** (user 2026-05-28) — environment + the hand-terminal device only.
  The existing frames below already captured all of it; do **not** re-sample this clip for screen UI.
- `pPutN_QzbeE` — "Rocinante vs The Free Navy 5x10" (5:22). The Belter Free Navy tactical
  display with **Lang Belta (creole) labels**. (User-supplied.)
- `m7WtNgesVbQ` — "Sci-Fi UI Episode 1: The Expanse" (12:08). The Ceres "ART IS LIFE" red comms screen.

Extracted 2026-05-26 via yt-dlp (≤720p) + claude-video-vision + ffmpeg.
NOTE: `C6sBoWvZFVI` ("OPAS Behemoth Breakdown") was rejected as a Belter UI source — it's a
third-party Spacedock analysis; its amber-title + cyan-stat infographic is the *YouTuber's*
chrome, not show UI. Kept only as exterior-ship/station reference.

## Why this matters

Yorke: Belters use **Atari-era oranges and browns**, retro-influenced, reflecting their
improvised/independent character. Timothy Peel (Junction Box): deliberately **messy, eclectic,
salvaged-OS** look — the Canterbury got intentional fritz/static/noise "because it's junk." So
the Belter theme should read as *inconsistent and repurposed*, NOT a clean coherent system —
the eclecticism is the signal (user: "variety?" — yes). Iconography: the **OPA split-circle**
(divided ring) logo, red/white. The translucent amber-edge-lit hand terminal is canonical.

## Frames

Re-extracted 2026-06-07 from user-pinned timestamps only (the pre-discipline
Claude-picked frames now live under `_archive/`). Naming: `bel_<videoid>_<sec>.png`.

### Canonical role assignments (user-picked 2026-06-07)

User-validated picks from the 18-frame contact sheet, mapped to critique-loop roles:

| Role | File | Why |
|---|---|---|
| ⭐ **Palette ground** (cool-dominant UI mass) | `bel_pPutN_020.png` | Cleanest head-on Free Navy tactical — cyan/teal dominates, yellow ▼ stalk-markers + amber as feature. THE reference for "what drift cells should look like en masse." Audit script DEFAULT_REF. |
| **Orbital plot grammar** (2.5D elliptical tilt) | `bel_pPutN_076.png` | Cleanest orbital tactical for the elliptical-plot vocabulary — the Roci↔Belter differentiator. `_077` is a near-identical motion frame, useful as cross-check. |
| **Cell-chrome anchor** (UI around media/content) | `bel_6BgX_196.png` | Cyan top-tab bar + side rails + bottom transport bar framing a person on a video. Best single shot for how Belter chrome wraps a content cell. |
| **Composition / multi-panel** (eclectic salvage) | `bel_pPutN_028.png` | Three displays at different sizes in a dim room — the eclecticism brand made literal. Layout ref. |
| **OPA glyph** (chrome glyph slot) | `bel_6BgX_160.png` | Canonical OPA split-circle, clean and big. |
| **Hand-detail / inline-readout** | `bel_6BgX_115.png` | Translucent device close-up — informs sparkline/inline detail treatment. |
| **Environment context** (not UI) | `bel_6BgX_063.png` | Dim Belter control room with peripheral amber console glow. Faction setting context. |

### Other user-pinned frames (motion variants, additional context)

`bel_pPutN_011/014/017/021`: sequential motion variants of the Free Navy tactical
(useful for animation cadence + cyan-track flicker reference).
`bel_6BgX_018/032`: Tycho command bridge w/ central cyan holo-table — environment.
`bel_6BgX_125/220`: Behemoth bridge — wide warship-tactical ref (cross-check).
`bel_6BgX_191/207`: Belter dialogue / group bridge — character context.

## Design vocabulary (palette)

**Dual accent (the brand): cyan + amber/orange**
- amber/orange `~#e8902a` / `~#ff8c1a` (hand-terminal edge glow, wireframe schematics, corridor strips)
- teal/cyan `~#1aa6b0` (tactical radar, readouts) — sampled muted `#074A6F`/`#053C61` (dark scenes)
- warm brown/rust base `~#59473A` (Atari-era browns per Yorke)

**State indicators** (corridor + console): green `~#3ad14e`, amber `~#ffc233`, red `~#e23b2e`.

**OPA red/white** split-circle iconography — a candidate accent / logo-glyph for chrome.

**Translucent edge-lit** hand terminal: orange border + blue layered content + transparency.

**Grunge variant** (art-is-life): red-pink `~#d83a52` dominant, busy/dense.

→ Token direction: near-black bg, **amber/orange + cyan dual primary** (deliberately two
accents, unlike Mars's disciplined single-accent), warm-brown surface tint to separate it from
the cool MCRN/UNN themes. Embrace slight inconsistency/noise as flair (scanline grit, mismatched
panel registers) — the "salvaged OS" signal. Lang-Belta-style label fragments as decorative text.

## GUI grammar

Source: extracted show frames (above) + Yorke/Peel interviews. NOTE the provenance asymmetry —
unlike Rocinante, there is **no clean designer-artwork source** for Belter UI; Yorke's portfolio is
Roci-only. So this grammar is reconstructed from on-screen frames + the designers' stated intent
(Peel: deliberately messy/salvaged "because it's junk"). Lower confidence than the Roci grammar;
lean on the *principle* (eclecticism) more than pixel-exact widgets.

**Panel / frame geometry**
- **No unified grid** — the defining trait. Mismatched panel registers, varying border weights,
  panels that don't align to a common baseline. The inconsistency IS the brand.
- Translucent **edge-lit** panels: a glowing orange/amber border around a semi-transparent layered
  screen (the canonical hand terminal). Content (blue icons, profile pics) floats over transparency.

**Stroke / line treatment**
- **Amber wireframe** linework (ship schematics) + cyan hairlines (radar/readouts), mixed freely.
- Embrace **grit**: scanline noise, static, fritz, slight flicker — Peel added these on purpose.
  This is the texture that separates Belter from the clean Mars/Earth themes.

**Component vocabulary**
- **Wireframe ship schematic** — amber/yellow outline of a vessel (tactical display, L side).
- **Perspective elliptical orbital plot** — concentric ellipses drawn **in 2.5D perspective tilt**
  (the plane recedes), cyan tracks + **yellow ▼ stalk-markers** (labels on vertical stalks rising off
  the plane), gold center/ship glyph. This is the clearest **Roci↔Belter differentiator**: Mars draws
  a *flat radial sonar-fan*; the Belt draws a *tilted elliptical orbital plane*. Red "HAMMER LOCK"
  banner + diamond markers appear as the threat/lock overlay (same red-as-escalation role as Roci).
- **Button-grid panel** — dense matrix of labeled buttons between schematic and radar.
- **Translucent hand terminal** — orange edge-glow + blue layered content + profile imagery.
- **Dense comms/list screen** — the Ceres "ART IS LIFE" variant: red-pink dominant, busy, scrolling.

**Iconography / glyphs:** the **OPA split-circle** (a ring divided by a slash, red/white) — the
faction logo, candidate chrome glyph. Mixed-provenance icons (salvaged from multiple systems).

**Label / text conventions:** **Lang Belta creole fragments** as decorative/functional text —
"DEFOTUNG", "LOK", "KOMMA LEK". Mixed languages/registers within one screen = the eclecticism
signal. Use Belta-style label fragments as texture (don't translate to clean English).

**Motion:** flicker, static bursts, signal noise — the "junk hardware" tell. Not smooth/polished.

**Layout structure (→ improvised/salvage layout):** asymmetric, panels bolted at different
registers and angles, no master grid. The **least uniform** of the three — the layout engine
should look retrofitted, not planned (mismatched cell sizes, slight rotations, exposed seams).

## mixed3d implications (later)

Belter-mixed3d = **repurposed/retrofit interior** — cells as mismatched salvaged panels bolted
onto someone else's hull (the Behemoth = a Mormon generation ship turned warship). Cabling,
exposed structure, amber work-lights. Tycho Station's gantry/spoke geometry is the spatial
vocabulary. Visually the *least uniform* of the three — grid should look improvised, not planned.


## User-supplied timestamps (durable)

| video ID | URL | timestamps | notes |
|---|---|---|---|
| `pPutN_QzbeE` | https://www.youtube.com/watch?v=pPutN_QzbeE | `0:11-0:17 (belter wide displays), 0:20-0:21 (belter tactical), 0:28 (belter 3 displays), 1:16-1:17 (belter tactical)` | Belter content from Rocinante vs Free Navy. Roci content cross-listed in refs/rocinante |
| `6BgX8a3W1S0` | https://www.youtube.com/watch?v=6BgX8a3W1S0 | `0:18 (tycho I think), 0:32 (tycho), 1:03 (belter wide), 1:55 (belter), 2:05 (behemoth I think), 2:40 (belter), 3:11 (table display), 3:16, 3:27, 3:40 (behemoth)` | Belter + tycho + behemoth grammar |
