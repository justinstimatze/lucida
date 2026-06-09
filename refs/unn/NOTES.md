# UNN references — The Expanse, Earth / UN FUI

Theme id: `unn` (UN Navy). Faction: Earth / United Nations. The establishment power —
institutional, formal, polished but practical.

## ⭐ CANONICAL REF SET (user curation 2026-06-09 — "basically only use those")

1. **`unn_tactical_perspective_grid.png`** — THE primary display ref ("the best").
2. **`agatha-king/ak_2.png`** — second display ref.
3. **`agatha-king/ak_234.png`** — environmental VIBES only (wide shot that happens to
   include displays) — use for room/atmosphere judgment, NOT as a display example.

All other frames in this dir are deprecated for design reference. DROPPED outright
2026-06-09: `00_03_22_un_warroom_blue_holo_table_wide.png` (junk frame, possibly not
even The Expanse) and `00_09_26_avasarala_office_green_holo_flags.png` (a frame from
the **SteamVR setup process** — wrong video entirely). Both deleted from disk; their
rows below are struck for the record.

## Sources

- `m7WtNgesVbQ` — "Sci-Fi UI Episode 1: The Expanse" (12:08). The UN situation/war room +
  Avasarala's diplomatic holo-screens. The dedicated FUI-analysis video (ignore its own
  reviewer chrome: the "CONTROL / ERGO / FINAL SCORE" frames are the YouTuber's graphics).
- `F9tbootnWLI` — Agatha-King combat clip (user-supplied 2026-05-28). ⭐ The 2D UNN tactical
  screens: flat/perspective blue **grid-plane plot** with blue (friendly) + red (threat) range-rings
  + "UNN Agatha King" labels, and the chunky **angular-bezel bridge consoles**. Real show footage.
  (Companion clip `Vg5m6LGesAc` yielded nothing — character close-ups w/ defocused console bokeh.)

Extracted 2026-05-26 via yt-dlp (≤720p) + claude-video-vision + ffmpeg.
GAP NOTE: First-pass clips failed for UNN — `yfShyOFN9Gs` (Agatha King mutiny 1/4) was
dialogue-only (teal uniforms + small cyan wall indicators, no bridge screens), and
`Z33PnnT4ZdI` was a fan game render. The Sci-Fi-UI analysis video filled the gap. If we want
the WWII-naval *bridge console* look specifically (short-wide screens, angular panels — the
Agatha King), the later mutiny parts (2/4–4/4) likely have it; not yet captured.
**CONFIRMED 2026-05-28** by a full 6s-interval scan of all 172s of `yfShyOFN9Gs`: it is entirely a
wardroom dialogue scene (officers around a table), ZERO 2D screen UI. Dropped as a screen source.
**GAP FILLED 2026-05-28** by `F9tbootnWLI` (user-sourced) — an Agatha-King clip with clean 2D UNN
tactical screens (`unn_tactical_grid_rangerings`, `unn_tactical_perspective_grid`) + bridge console
hardware (`unn_bridge_console_angular`). UNN now has real 2D-screen reference, not just holograms.

## Why this matters

Yorke: Earth/UN uses **blue** primary (the sci-fi default) but a *deliberately different blue
from Mars's* to keep factions separable, plus **orange + green** accents. WWII naval-battleship
influence (Agatha King = short-wide main screen, small angular panels). Institutional but
practical — the showrunner banned "giant flashing text boxes." Earth = polished establishment vs
Belter improvised vs Mars militant. The **UN globe-laurel seal** is the key iconography.

**DESIGN INTENT (user 2026-05-28): "the UNN interfaces are pretty clunky and boring, fitting for
the UNN."** This is a *feature, not a flaw to design around.* The unn theme should deliberately read
as institutional/bureaucratic/utilitarian — plain blue panels, dense unglamorous readouts, minimal
flair — the dull weight of the establishment. Do NOT try to make it slick, dynamic, or exciting the
way rocinante (militant/sharp) or belter (eclectic/scrappy) are. Clunky + boring = on-character.
Contrast is the point: across the 3 themes, UNN is the "boring competent bureaucracy" register.

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `unn_tactical_grid_rangerings.png` | `F9tbootnWLI` @0:04 | ⭐ THE 2D UNN tactical (head-on): dark navy **flat grid plane** with overlapping **blue (friendly) + red (threat) range-rings**, white dashed trajectory ellipses, "UNN Agatha King" label, dense right-side data rows + "SECTION / GRID" readouts. Utilitarian, text-dense — the clunky-establishment look. |
| `unn_tactical_perspective_grid.png` | `F9tbootnWLI` @2:51 | ⭐ Same tactical in **perspective** (grid plane tilts away, 2.5D): blue gridded plane + concentric range-rings + "UNN Agatha King" contact cluster + scattered cyan/white contacts; right-side "TRACKING" panel + button blocks. |
| `unn_bridge_console_angular.png` | `F9tbootnWLI` @3:54 | ⭐ UNN **bridge console hardware**: bank of small blue screens in **chunky angular grey bezels** (Yorke's WWII-naval "small angular panels"), button rows + a circular dial. The institutional/utilitarian console look. |
| `00_04_02_un_warroom_seal_table_orbital_lines.png` | 4:02 | ⭐ UN war room — circular holo-table with the **UN globe-laurel seal** inlaid, red + blue orbital trajectory arcs floating above, left-wall readout screens. The Earth-power centerpiece. |
| ~~`00_03_22_un_warroom_blue_holo_table_wide.png`~~ | 3:22 | DELETED 2026-06-09 — junk frame (green CRT terminal, possibly not The Expanse at all). The 00_* extraction timestamps are unreliable. |
| `00_06_04_un_warroom_wall_readout_screens.png` | 6:04 | (deprecated for design use) Actually shows the round seal TABLE with blue holo arcs — filename wrong. |
| `00_08_05_avasarala_holoscreen_globe_red_arc.png` | 8:05 | (deprecated for design use) Avasarala holo-screen. |
| ~~`00_09_26_avasarala_office_green_holo_flags.png`~~ | 9:26 | DELETED 2026-06-09 — a **SteamVR setup-process frame**, not The Expanse. Extraction pipeline grabbed the wrong source. |

## Design vocabulary (palette)

**Royal blue primary** (sampled, sharp — note the saturation vs Roci's cyan):
- `#1261CF` bright, `#10358A` mid, `#204D9C`, deep `#0F1A4B` / `#0F296E`
- This is the *deliberately-different-from-Mars* blue: deeper, more royal/navy than Roci cyan.

**Accents:**
- red orbital/trajectory arcs `~#d33` (threat/incoming)
- green holo lines `~#3ad17e` (Avasarala office projection)
- cyan-teal globe/readout `#206891` / `#305469` (sampled)

**Surface:** institutional — cool concrete grey + warm wood undertone + near-black screen voids.
Unlike the all-black Mars/Belter ship interiors, UNN rooms have *architectural* surfaces (the
establishment has real estate, gravity, polish).

**Iconography:** UN globe-laurel seal (table inlay) — candidate centerpiece glyph.

→ Token direction: **royal/navy blue primary** (saturated, NOT cyan — that's Roci's), red as
incoming-threat accent, green as secondary/diplomatic, a slightly *lighter/architectural*
surface than the two ship themes to read as "Earth has buildings." Cleaner, more formal type
than Mars's command-line or Belter's grunge — closer to a polished corporate/gov register, but
without flashing-text-box excess (showrunner's rule).

## GUI grammar

Source: extracted show frames (above) + Yorke interview. Same provenance caveat as Belter — **no
clean designer-artwork source** for UNN; Yorke's portfolio is Roci-only. Reconstructed from war-room
/ Avasarala frames + stated intent (WWII-naval influence; showrunner's "no flashing text boxes"
rule). Lower pixel-confidence than Roci; the *principles* (institutional, horizontal, formal) are
the load-bearing part.

**Panel / frame geometry**
- **Horizontal emphasis** — WWII-naval influence: short-wide main screens, low-and-broad rather
  than tall (the Agatha King bridge). Angular panels, architectural framing.
- The **circular holo-table** is the centerpiece geometry: a horizontal disc with the UN
  globe-laurel seal inlaid and volumetric content rising vertically off it.
- Cleaner, heavier frames than the ship themes — the establishment has polish and real estate.

**Stroke / line treatment**
- **Royal/navy-blue hairlines** (`#1261CF` family) — deliberately deeper/more saturated than
  Roci's cyan, for faction separation. Red threat/trajectory arcs over blue.
- Formal, even line weights — no Belter grit, less command-line density than Mars.

**Component vocabulary**
- **Circular holo-table** — round table, UN globe-laurel seal inlay, blue volumetric projection,
  red + blue orbital trajectory arcs floating above.
- **Globe + trajectory holo-screen** — Avasarala's diplomatic FUI: cyan/blue Earth globe + red
  incoming-trajectory arc + green accent lines.
- **Wall readout screens** — left-wall panels, red-tinted + blue, supporting the table.
- **Green diplomatic laser-lines** — the office projection (green holographic wireframe + flags).

**Iconography / glyphs:** the **UN globe-laurel seal** (table inlay) — the key Earth-power glyph,
candidate centerpiece. Member-state flags as institutional dressing.

**Label / text conventions:** formal/institutional register, polished but **no flashing-text-box
excess** (showrunner's explicit rule — this is the discipline constraint for UNN chrome). Cleaner,
more "gov/corporate" than Mars's command-line or Belter's creole grit.

**Motion:** slow, dignified, weighty — orbital arcs rise from the table; no frantic flicker.

**Layout structure (→ situation-room-ring layout):** cells arranged in a **ring around a central
horizontal holo-disc** (the war-room table is the literal model). The most **grounded/horizontal**
composition of the three (vs Roci cockpit-forward, Belter improvised-vertical). Architectural
surrounds (pillars, flags) rather than ship-hull. (Distinct from the Razorback's intimate
cockpit-ring: this is a large, formal, multi-observer war-room ring.)

## mixed3d implications (later)

UNN-mixed3d = **situation room** — cells arranged in a ring around a central volumetric holo
(the war-room table projection is the literal model: a horizontal disc with orbital arcs rising).
Architectural surfaces (concrete pillars, flags, wood) rather than ship-hull. The most
*grounded/horizontal* composition of the three (vs Roci cockpit-forward, Belter improvised-vertical).


## User-supplied timestamps (durable)

| video ID | URL | timestamps | notes |
|---|---|---|---|
| `F9tbootnWLI` | https://www.youtube.com/watch?v=F9tbootnWLI | `0:02-0:05, 1:45, 2:51-2:52, 3:12, 3:29, 3:39, 3:50, 3:54` | UNN — user comment: "the unn interfaces are pretty clunky and boring, fitting for the unn" |
| `Vg5m6LGesAc` | https://www.youtube.com/watch?v=Vg5m6LGesAc | `2:50-2:53, 2:56-2:59 (several transitions)` | UNN transitions |
| `m7WtNgesVbQ` | https://www.youtube.com/watch?v=m7WtNgesVbQ | `1:54-2:14 (variety starting with UNN 3d tactical hologram)` | UNN 3d tactical from Sci-Fi UI Ep 1. Cross-listed in refs/rocinante |
