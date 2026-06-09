# Rocinante references — The Expanse, MCRN / Martian military FUI

Theme id: `rocinante` (locked). Faction: Mars Congressional Republic Navy (the
Rocinante is the ex-MCRN *Tachi*, so it carries the MCRN screen-graphics lineage).

## ⭐ CANONICAL REF SET (curation 2026-06-09)

Primary: **`roci_warship_tactical_screen.png`**, then
`roci_combat_missilelock_dense.png` + `roci_nav_named_bodies.png`.
Secondary (alt-layout sources): `roci_railgun_firecontrol.png`,
`roci_console_target_render.png`, `roci_cockpit_wide_console.png` (wide
multi-display view).

Corrections applied 2026-06-09:
- MOVED to refs/tachi (actually mars-red era): `roci_confirm_modal_chevron.png`,
  `roci_keyboard_input.png`, `roci_registry_terminal_named.png`.
- MOVED to refs/belter (actually a Free Navy screen — clip `pPutN_QzbeE` is the
  same clip all `bel_pPutN_*` frames came from): `roci_threat_response_orbital.png`.
  Any grammar note below citing that frame as roci is suspect — re-check against
  the canonical three before acting on it.
- DELETED: `00_01_03_roci_red_commandline_registration.png` (wide shot, no use).

Provenance rule: the clip ID in each frame's row is the faction key — verify it
(and eyeball the frame) before using a frame as design justification.

## Sources

- `pPutN_QzbeE` — "Rocinante vs The Free Navy | The Expanse 5x10" (5:22). Roci cockpit
  button panels + cyan/blue tactical screens. (timestamp-pinned source.)
- `XIKQVow3Mmo` — "The Expanse — Naming The Rocinante" (2:38). THE red command-line
  registration display + the green-phosphor registry terminal. (timestamp-pinned source.)
- `Eil4xNXWsj4` — "Rocinante Set Tour (Season 3)" (13:18). Physical-set environment only
  (blue-lit industrial corridors) — no screen FUI. Useful for the eventual mixed3d scene.
- `m7WtNgesVbQ` — "Sci-Fi UI Episode 1: The Expanse" (12:08). String-light holographic nav.

Extracted 2026-05-26 via yt-dlp (≤720p) + claude-video-vision frame pick + ffmpeg seek.
NOTE: `Z33PnnT4ZdI` (Donnager vs Agatha King) was rejected — it's a fan-made *game render*
("Development Build" watermark), not show FUI. Good only for exterior hull livery.

## Why this matters

Designer Rhys Yorke (Pushing Pixels interview): MCRN screens use **harsh red** as primary,
constrained to *system colors only* — red / green / yellow. red = no/danger, green = go/ok,
yellow = mild alert. "Practical for a ship used for battle — fast decisions." The aesthetic is
**command-line, under-the-hood, not polished** — sits between front-end and back-end. Yorke
flagged the risk that red reads as *villain* in Western visual grammar, so it must be handled
so it doesn't look evil. Curved screens; monospace/technical type carries the personality.

## Frames

**SCRUBBED 2026-05-27** of non-UI frames (verified via raw view — `#raw` sentinel; see
`bmg_raw_visual_for_design` memory). The original coarse 1-frame/~10s sampling mislabeled several
grabs and missed short FUI scenes — 7 frames removed (exterior space shots that were labelled
"button panel"/"amber screens", faces/crowds, two corridors, and a non-show "NARRATIVE 0.4"
analysis-video graphic). **To get more/better UI frames, re-sample the source clips densely** (in
`/tmp/expanse-refs/`, while present) — short bridge-screen moments are easily skipped at coarse
sampling. Labels below are from the original pass; trust the ⭐ verified frame most.

| File | Src | What it captures |
|---|---|---|
| `roci_warship_tactical_screen.png` | clip `0i0vjIs-Oz8` @2:10 | ⭐ CANONICAL MCRN tactical screen (verified raw): navy bg + muted-cyan radial sonar-fan plot peppered with fine **RED contact/threat markers**; **top segmented-readout strip** + **bottom row-of-circular-dials**. The reference for the theme palette + composition. |
| `roci_nav_trajectory_screen.png` | clip `0i0vjIs-Oz8` @0:24 | ⭐ Nav/approach screen: navy bg, central white **ship-hull silhouette** tracked inside a **yellow reticle ring**, long dashed **trajectory line** across mid; **left/right label rails** (cyan); **bottom full-width band of RED bar-gauge histograms** (spectrum-analyzer bars); top thin red rail + segmented strip. |
| `roci_combat_missilelock_dense.png` | clip `0i0vjIs-Oz8` @3:00 | ⭐ Combat escalation: same tactical screen DENSE with **red concentric-bullseye threat reticles** (crosshair-in-nested-circles = the lock glyph), cyan connecting lines between contacts, "THREAT / MISSILE LOCK" active. Shows red dominating during engagement. |
| `roci_registry_terminal_named.png` | clip `XIKQVow3Mmo` @2:14 | ⭐ Registry terminal, named state: dark green-teal **phosphor monospace**, white "ROCINANTE" centered, registry code top-right, dense status-column readouts. The "under-the-hood" terminal surface. |
| `roci_confirm_modal_chevron.png` | clip `XIKQVow3Mmo` @1:55 | ⭐ **Chevron-framed confirm modal** — "Transponder Override" title flanked by **yellow ▼ chevrons**, Cancel/Save buttons. The canonical ALERT/dialog grammar element (45°-pointed framing, not a plain box). |
| `roci_hand_terminal_glass.png` | clip `XIKQVow3Mmo` @0:45 | Translucent **glass hand terminal** — transparent slab, green-cyan circuit/schematic graphics, amber edge-glow; red backlit physical button matrix behind. |
| `roci_keyboard_input.png` | clip `XIKQVow3Mmo` @1:53 | On-screen **touch keyboard** input surface — dark bg, cyan/white key grid, monospace prompt, name being typed. The interactive command surface. |
| `roci_threat_response_orbital.png` | clip `pPutN_QzbeE` @1:12 | ⭐ CALM-OPS tactical screen (the cleanest yet): "THREAT RESPONSE" header + segmented strip; central **purple/violet orbital plot** (concentric ellipses) with cyan target icon; **left vertical bar-gauge column**; **right white wireframe ship-self schematic** (top-down Roci w/ thruster pods); yellow ▼ target pips; "ROCI" wordmark tabs top+bottom-right; bottom "MUNITION" segmented strip. **Cyan + green + purple, NO red** — see calm/combat note below. |
| `roci_cockpit_wide_console.png` | clip `pPutN_QzbeE` @4:50 | Wide 3-screen cockpit console (layout reference): left data-panel screen · center white ship-self wireframe + small purple plot + red pips · right screen. Drives the cockpit-layout tiling. |
| `roci_railgun_firecontrol.png` | clip `8ldyfTa3WrA` @0:07 | ⭐ Best single console panel (sharp, head-on): "RAILGUN" fire-control — "THRUSTER OVERVIEW" **ship-self wireframe** (L edge); big "0.00 M/S" numeric readout + tall blue **battery/capacitor bar-gauges**; **concentric reticle dials** ("CAPACITOR PRECHARGE / MAIN DRIVE CONNECTION" status); "VISUAL TARGETING" **starfield panel** w/ crosshair; top purple radial plot + cyan button-block rows; bottom segmented strips. Cyan/blue/green/purple, **red confined to one "FIRE CONTROL" label**. Component-vocabulary goldmine. |
| `roci_console_target_render.png` | clip `XuqEX1PnG9I` @2:12 | Secondary fire-control console (angled, 2-screen stack). Adds two elements not seen elsewhere: **magenta/pink button-block accents** (alongside the usual cyan/green) and a **grey 3D-rendered target ship** (a rotated solid model, vs the white *wireframe* ship-self schematic). Dial clusters + dense button-blocks + segmented gauges otherwise echo the railgun panel. |
| `roci_nav_named_bodies.png` | clip `PX9_1I2oykQ` @1:26 | ⭐ Strategic nav plot (clean, head-on): starfield with **named bodies labeled** — "EROS STATION" (large cyan sphere), "ROCINANTE" + "MARASMUS" markers joined by a dashed **trajectory line**; top segmented cyan strip + thin red rail; **bottom band = row of circular reticle-dials flanked by RED bar-gauge histograms**. The clearest single example of the canonical composition (top strip · central plot · bottom dial+histogram band) and of how the plot renders named entities + paths. |
| `roci_target_wireframe_schematic.png` | clip `_c9W-icdTmg` @2:34 | (angled/contextual) **Multi-view white wireframe schematic** of a target structure — large 3D module render + two smaller top-down ring-section diagrams. The technical-engineering-drawing display style (distinct from the ship-self wireframe, which is the Roci itself). |
| `roci_video_feed_panel.png` | clip `_c9W-icdTmg` @2:10 | (angled/dim/contextual) **Live video/camera feed embedded in a UI frame** with red edge-brackets — a real-image feed panel inside the FUI. Documents the motif; too dim to be a clean asset. |
| `00_01_03_roci_red_commandline_registration.png` | 1:03 / naming | Red command-line registration display (partial: crowd in frame, red screen at right). The signature red "under-the-hood" surface — kept as the only clean-ish red command-line frame. |

**CALM vs COMBAT palette (important refinement, 2026-05-28):** Roci screens are NOT uniformly
red-heavy. In **calm ops** (`roci_threat_response_orbital`) the palette is **cyan + green + a
purple/violet plot, with yellow target pips — essentially no red**. Red floods in only during
**active combat** (`roci_combat_missilelock_dense`: every contact gets a red bullseye lock). So red
is the *escalation* layer, not the baseline. → For lucida (calm/ambient default, see
`feedback_calm_ambient_default`): the rocinante baseline should read cyan/green/purple-plot with
yellow accents; red reserved for danger/alert state. New signature element to consider:
the **right-side white wireframe "ship-self" schematic**.

## Design vocabulary (palette)

**System-color triad (the brand)** — backlit indicator buttons, status meaning ONLY:
- danger/no: red `~#e23b2e`
- ok/go: green `~#3ad14e`
- warning: amber/yellow `~#ffc233`
(Exact hex to refine from a cleaner button-panel crop; sampled frame was small.)

**Cyan tactical screens** (sampled, sharp):
- bright cyan `#13F7F7`, mid `#1199A4` / `#10B0C8`, glow `#1BD8DD`
- dark teal bg `#0C2A2B` → near-black `#06141a`

**Deep-blue gauges** (sampled): `#075CE1`, `#052DAB`, `#021989` — Roci screens range cyan→royal-blue.

**Red command-line** (the signature "under-the-hood" surface): red `~#d6311f` / `~#c41e0a`
spectrum bars + angular chevrons + monospace text on near-black.

**Registry/terminal text:** green-teal phosphor monospace on dark.

→ Token direction: near-black bg, **cyan primary** for live readouts, **red reserved as
danger/command-line accent** (NOT sprayed — Yorke's villain-risk warning = our accent-discipline
rule, see `feedback` memos), green/yellow as state-meaning. Monospace `type.mono` dominant.

## CORRECTED grammar — from the battle-clip frames (2026-05-28, raw-verified)

The three new ⭐ frames from `0i0vjIs-Oz8` (timestamp-pinned) sharpen the model — and
correct one thing I had wrong: **red is NOT just "rare fine markers."** The real division of labor:
- **Cyan = the STRUCTURE color** — persistent grid, sonar-fan arcs, contact dots, label rails,
  segmented readouts. The calm baseline that's always there.
- **Red = the ENERGY/ACTIVITY color** — and it's everywhere structural: the **top accent rail**, the
  **entire bottom bar-gauge histogram band** (always red, on BOTH nav + tactical screens), and the
  **threat/lock reticles**. During combat red density explodes (every contact gets a bullseye lock).
  So red carries roughly equal *visual weight* to cyan via those bands — but it's confined to
  activity/energy/threat semantics, never sprayed on inert structure. That's the discipline.
- **Navy negative space** is huge — the plot floats in dark, bands hug the edges.

**Composition skeleton (consistent across all 3 screens):**
`top full-width segmented-readout strip` · `central plot (nav trajectory OR radial sonar-fan +
contact constellation)` · `left + right marginal label rails (cyan)` · `bottom band = row of
circular dials + RED bar-gauge histograms (spectrum-analyzer bars)`. The monitor is physically
**curved** (edges bow). 

**Signature elements lucida is currently missing** (→ furniture/chrome tuning targets):
- **bottom red bar-gauge histogram band** (the single most recognizable MCRN tell, on every screen)
- **top segmented cyan readout strip**
- **red concentric-bullseye threat reticle** (crosshair in nested circles) as a glyph motif
- radial sonar-fan arcs anchored bottom-center of the hero plot

## GUI grammar (from Rhys Yorke's clean designer renders)

Source: rhysyorke.com Rocinante UI (`q9Am1L`) + Comm UI (`3dozBE`) + Razorback HUD (`q9VKgD`),
captured 2026-05-26 via browser. These are the designer's own full-res artwork — far cleaner
than the YouTube frames — so the Roci grammar below is high-confidence. (Belter/UNN grammar in
their NOTES is derived from show frames + interviews; Yorke's portfolio is Roci-only.) Yorke's
process note validates ours: he began by establishing "a common colour palette and design
language" from what was previously built. Observe→reimplement only; never copy his assets.

**Panel / frame geometry**
- Rectangular panels bounded by **single hairlines** (~1px), floating on near-black with generous
  negative space. Outline-driven, almost no solid fills.
- Each panel wears a **small protruding header tab** top-left carrying its ALL-CAPS title
  ("NAVIGATION PANEL", "SYSTEM CONTROL INTERFACE", "REAR SENSOR GRID").
- Emphasis callouts use **angular chevron framing** — the ALERT banner is wrapped in a
  hexagonal/pointed-end outline, not a plain box. 45°-clipped corners on key tokens.

**Stroke / line treatment**
- Hairline-dominant: cyan or red 1px strokes. The polar nav plot is concentric thin circles +
  radial spokes, all hairline red.
- Data-flow shown as chained chevrons `>>> >>>` (direction indicators).
- Thin baseline rules separate header from body.

**Component vocabulary** (these become lucida cell archetypes / chrome motifs):
- **Sidebar nav list** — stacked rows, each = label + solid **red highlight bar** for active
  state; paired two-column label layout (left list / right list).
- **Status column** — label-left / state-right, right-aligned state tokens (`OK` / `NA` /
  `Enabled`). e.g. "Drive Link OK / Thruster Control OK / Fire Control NA".
- **Registry block** — ship name + alphanumeric code (`RAZORBACK  CTV:P14L2N8225K54P01`).
- **ALERT banner** — chevron-framed, header + body paragraph + an action button ("STANDBY MODE").
- **Link-connection dial** — a circular node/ring + ID label (`COMM2101-A`) + chevron flow arrows.
- **Telemetry log stream** — green monospace, `>`-prefixed lines, `function()` call syntax,
  scrolling. This is the "under-the-hood" surface Yorke describes; the signature Roci texture.
- **Polar nav plot** — concentric-circle radial grid + curved red trajectory arc + center target
  reticle (circle+cross, marked "HAMMURABI") + orbital bodies on dashed ellipses (Jupiter/Europa
  /Callisto). THE canonical Roci centerpiece.
- **Radar sweep** — semicircular "REAR SENSOR GRID" arc widget.
- **Vertical bar-gauge stacks** — cyan tactical gauges.
- **Backlit button matrix** — rows of red/green/amber buttons (the system-color triad, physical).

**Iconography / glyphs:** crosshair target reticle (circle+cross); ▶ play-triangle markers
prefixing numeric readouts; small orbital/planet glyphs.

**Label / text conventions:** ALL-CAPS technical headers; monospace body; functional/literal
names ("NAVIGATION PANEL", "LINK ACTIVE", "INITIATING COMMUNICATION HANDSHAKE"); compass bearings
("77 118 W"); function-call log syntax; registry codes. No decorative prose.

**Motion:** scrolling telemetry logs; sweeping radar arc; trajectory arc extends/animates; chevron
flow arrows pulse in flow direction.

**Layout skeleton (→ drives the bespoke cockpit layout):** a dominant **central plot** (the polar
nav grid) flanked by **dense marginal readout rails** (left + right columns of numeric telemetry);
nav/status lists dock to one side; alert + link-connection widgets cluster center-right; the
**bottom edge** carries a log-stream band + global status ("LINK ACTIVE", "Shield/Hull"). So:
center hero plot · L/R telemetry rails · bottom log band · corner status tabs.

## mixed3d implications (later)

Roci-mixed3d = **cockpit/ops interior**: blue-lit industrial corridor walls (settour frames),
cells docked as the curved cockpit screens around a central nav-holo. The natural centerpiece is
the **string-light 3D projection** — a literal 3D web of trajectory lines — now captured as
`roci_nav_hologram_web.png` (clip `m7WtNgesVbQ` @11:12): a figure at a console enveloped in a
volumetric web of glowing **blue + red trajectory string-lights** curving through the ops space,
red conduit structure on the walls. THE reference for cells-docked-in-a-volumetric-web.
Distinct from hackers' tower canyon and the planned hailmary cockpit-cutaway.

**Razorback "Spherical Display" — its own special thing, NOT the Roci grammar** (decision 2026-05-26):
the Razorback is Julie Mao's civilian *racing pinnace*, not an MCRN ship, so its design language is
distinct from the Rocinante's military command-line look — don't fold it into this theme. Captured
here only because it sits adjacent to the Roci work on Yorke's portfolio (`q9VKgD`). What it is: the
pilot sits inside a **gimbal/gyroscope ring**; UI screens float in 3D space *around the seat* and
**slide along the ring** as it rotates (Yorke designed it all in 3D because elements "slid across
the interface"); cyan/white ring lighting. Held as a **candidate standalone theme** (`razorback`)
for later — flagged as "not opposed to its own theme." It's the strongest Expanse precedent for lucida's
wanted holographic depth (see `feedback_holographic_depth_yes`): cells docked on the inner face of a
rotating ring, reticle/seat at the hub. Park it; the 3-theme arc (rocinante/belter/unn) comes first.


## Pinned source timestamps (durable)

Verbatim per-video timestamp ranges from the user — pinned here so future sessions don't need to dig through transcripts. See memory `feedback-pin-timestamps-to-notes` for the discipline. Frame extraction should target these ranges. The video ID is the durable key.

| video ID | URL | timestamps | notes |
|---|---|---|---|
| `0i0vjIs-Oz8` | https://www.youtube.com/watch?v=0i0vjIs-Oz8 | `0:23-0:25, 2:10-2:11, 2:58-3:01` | source of `roci_warship_tactical_screen.png` (@2:10), `roci_nav_trajectory_screen.png` (@0:24), `roci_combat_missilelock_dense.png` (@3:00) |
| `XIKQVow3Mmo` | https://www.youtube.com/watch?v=XIKQVow3Mmo | `0:38-0:39, 0:44-0:45 (handheld — skip), 1:47-1:55, 2:12-2:14` | Naming the Rocinante (Tachi → Roci). Tachi-era UI being renamed. Existing frames: red-commandline @1:03, keyboard @1:53, chevron-confirm @1:55, registry-terminal @2:14. Cross-listed in refs/tachi |
| `m7WtNgesVbQ` | https://www.youtube.com/watch?v=m7WtNgesVbQ | `1:10-1:11 (ceres docks), 1:17-1:27 (variety of UIs in sequence), 1:30-1:31 (knight shuttle), 1:54-2:14 (variety starting with UNN 3d tactical hologram), 2:28-2:32 (handhelds)` | Sci-Fi UI Episode 1 — multi-faction. UNN content cross-listed in refs/unn |
| `pPutN_QzbeE` | https://www.youtube.com/watch?v=pPutN_QzbeE | `0:11-0:17 (belter wide displays), 0:20-0:21 (belter tactical), 0:28 (belter 3 displays), 0:37-0:40 (roci tactical), 1:11-1:12 (roci tactical), 1:16-1:17 (belter tactical), 1:49-1:50 (roci)` | Rocinante vs Free Navy. Belter timestamps cross-listed in refs/belter |
| `8ldyfTa3WrA` | https://www.youtube.com/watch?v=8ldyfTa3WrA | `0:06-0:07` | source of `roci_railgun_firecontrol.png` (@0:07). confirmed sufficient |
| `XuqEX1PnG9I` | https://www.youtube.com/watch?v=XuqEX1PnG9I | `0:05-0:06, 0:09, 0:23-0:24, 1:07, 1:36, 1:57-1:58, 2:06, 2:10-2:12, 2:18-2:20, 2:23, 2:30` | source of `roci_console_target_render.png` (@2:12). Dense list — multiple frames available |
| `PX9_1I2oykQ` | https://www.youtube.com/watch?v=PX9_1I2oykQ | `0:10-0:14, 0:17-0:19, 0:27-0:30, 0:36-0:38, 1:26-1:27` | source of `roci_nav_named_bodies.png` (@1:26) |
| `_c9W-icdTmg` | https://www.youtube.com/watch?v=_c9W-icdTmg | `0:52-0:56, 1:07, 2:08-2:13 (video feed inside a ui frame), 2:30, 2:34, 2:37` | source of `roci_target_wireframe_schematic.png` (@2:34), `roci_video_feed_panel.png` (@2:10) |

### Dropped (curation)

- `mlN8azjGuTc` — no 2d interfaces
- `yfShyOFN9Gs` — "couldn't see what you were referring to"
