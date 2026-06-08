# Belter references — The Expanse, OPA / Belter / Free Navy FUI

Theme id: `belter`. Faction: Outer Planets Alliance / Belters / Free Navy. The brand IS
eclecticism — salvaged, repurposed, multi-faction gear. "Waste not, want not."

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

| File | Timestamp / src | What it captures |
|---|---|---|
| `00_03_01_freenavy_tactical_creole_display.png` | 3:01 / freenavy | ⭐ Belter Free Navy tactical display — amber/yellow wireframe ship schematic (L) + button grid panel + circular orbital radar (R, cyan rings, yellow pips). Labels in **Lang Belta**: "DEFOTUNG", "LOK", "KOMMA LEK". Cyan + amber on near-black. |
| `belter_orbital_tactical.png` | clip `pPutN_QzbeE` @1:17 | ⭐ Cleanest head-on Free Navy tactical (raw-verified): big **perspective-tilted elliptical orbital plot** (2.5D — concentric ellipses seen at an angle, NOT Roci's flat radial fan), cyan tracks + **yellow ▼ stalk-markers** with labels, gold center, top segmented strip + cyan tabs, right gold ship glyph, bottom data/log bar. Teal/cyan + amber/gold. |
| `belter_hammerlock_trails.png` | clip `pPutN_QzbeE` @3:34 | ⭐ Same plot in threat state: **red "HAMMER LOCK" banner** + red/blue diamond contact markers near center, cyan tracks, yellow corner stalk-markers. Confirms red = lock/threat overlay (same role as Roci), on the cyan/amber base. |
| `belter_tactical_columns.png` | clip `pPutN_QzbeE` @3:09 | Free Navy tactical with **left + right vertical data columns** flanking the elliptical plot; amber ship glyph, red bar accents bottom-left. Shows the marginal-readout-rail composition. |
| `belter_medina_bridge_wall.png` | clip `6BgX8a3W1S0` @3:40 | ⭐ **Behemoth / Medina Station bridge wraparound display** — a giant curved screen-wall: large grey rendered ship/station + "MEDINA STATION" label + cyan tactical graphics + yellow trajectory + green/amber side data panels. The Belter "big bridge screen" composition (vs the smaller console tactical). Cyan-dominant w/ warm accents. |
| `belter_bridge_holotable_room.png` | clip `6BgX8a3W1S0` @0:32 | Circular Belter command bridge (layout/environment ref): central glowing **cyan holo-table** ringed by curved console banks of blue tactical wall-screens. The command-center composition + holo-table — feeds the belter layout + mixed3d vocabulary. |
| `00_04_08_belter_hand_terminal_translucent.png` | 4:08 / tycho | Canonical translucent **hand terminal** — glowing orange edge-border, semi-transparent layered screen, blue icons + profile pic. |
| `00_03_23_belter_opa_split_circle_logo.png` | 3:23 / tycho | Corridor with the **OPA split-circle logo** (red/white) on doors; amber + blue signage. |
| `00_01_07_belter_corridor_teal_amber_red.png` | 1:07 / tycho | Corridor palette: dark teal/cyan strip lighting + green/amber wall indicators + red accent strips. |
| `00_01_53_belter_obsdeck_console.png` | 1:53 / tycho | Observation-deck console — small blue/cyan readout device on rail, amber accents. |
| `00_01_20_belter_art_is_life_red_comms.png` | 1:20 / scifi-ui | Ceres "ART IS LIFE" comms/dating screen — **red-pink dominant** UI, dense layout. A grungier Belter UI variant. |

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
