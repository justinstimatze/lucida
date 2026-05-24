# Renegade references — Mass Effect Normandy (ME2 + ME3)

Sources:
- **ME3** Normandy CIC tour: <https://www.youtube.com/watch?v=zOKjm_avvGs> (2:37) — Alliance-era SR-2, post-Cerberus
- **ME2** Normandy CIC Collector-era tour: <https://www.youtube.com/watch?v=BMarDewElOY> (3:35) — Cerberus-era SR-2

Both extracted 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame. User 2026-05-24: "mass effect is tricky but here's the ME3 normandy CIC, you can probably extract from the terminals visible within the game" + "and here's the me2 normandy tour".

## Why two eras together

Current `renegade.tokens.json` description: "omnitool orange + nav cyan on warm-black." That maps to ME2 Cerberus-era (orange-dominant). The ME3 era added the N7-red + Alliance-navy palette over the orange base. Both are canonical "Mass Effect" — they sit on the same omnitool/holographic substrate but with different overlay accent strategies. Keeping both ref sets in one folder so future retune can decide whether to:

- pick one era as primary (likely ME3 since it's the most-cited final form), OR
- split into `renegade` (ME2 Cerberus) + `paragon` (ME3 Alliance) as sibling themes.

## Frames

### ME3 era (Alliance / N7)

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_14_galaxy_map_private_terminal_overlay.png` | 0:14 | Galaxy map at the Private Terminal — blue-purple galaxy spiral background + "Private Terminal / ⊗ Use" text overlay with ring crosshair. Holographic chrome aesthetic. |
| `00_00_42_war_room_red_hologram_chrome.png` | 0:42 | War room with red holographic projections — chrome environment, red glow as primary lighting source. |
| `00_00_56_bridge_terminals_panel_array.png` | 0:56 | Bridge corridor view — dense terminal arrays both sides, cool blue ambient interior lighting. |
| `00_01_10_bridge_overhead_panel_dense.png` | 1:10 | Bridge overhead view of panel arrays — translucent display panels with red+orange data + blue ambient. |
| `00_01_26_war_room_full_dome_view.png` | 1:26 | War room full dome — Shepard looking down at the red-projected holotable + officer stations around. |
| `00_01_54_conference_room_table_arc.png` | 1:54 | Conference room with arc-shaped table, three terminal screens on the back wall, brown leather + cool grey palette. |
| `00_02_22_war_assets_ui_menu_canonical.png` | 2:22 | **THE canonical ME3 game UI screen.** War Assets menu: two-pane layout (list left + detail right), N7-red selected-row outline + bracket-corner L indicator, dark navy bg with subtle radial gradient, numeric readouts (766/1194/508/740/200/690), green progress bars at bottom ("Total Military Strength 5376 / Readiness Rating 50% / Effective Military Strength 2688"), PlayStation button hints at bottom-right. **Pull most token decisions from this single frame.** |

### ME2 era (Cerberus)

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_00_me2_codex_green_scan_caption.png` | 0:00 | Cerberus codex screen — green holographic vehicle scan + caption text "Biotic barriers are vulnerable..." + "Loading" indicator. Green-scan-on-black + brown frame chrome. |
| `00_00_45_me2_cic_overhead_galaxy_dome.png` | 0:45 | CIC overhead with "INFORMATION CENTER" arc label + central galaxy hologram + cool-blue interior + yellow accent lights. Wide cockpit-as-dashboard reference. |
| `00_01_34_me2_dialogue_edi_subtitle_overlay.png` | 1:34 | Dialogue UI with "EDI: Operative Lawson makes a valid point, Shepard..." subtitle convention. Black bar at bottom with white sans-serif. |
| `00_02_45_me2_galaxy_map_orange_callout_canonical.png` | 2:45 | **THE canonical ME2 Cerberus UI overlay.** Galaxy Map text-overlay with orange diamond icon + bracket-corner orange chrome + "Galaxy Map / Use the galaxy map to pick new destinations for the Normandy." Brown-to-black gradient bg. Distinctive ME2-era orange-on-black callout pattern. |
| `00_03_08_me2_elevator_cerberus_logo_orange_callout.png` | 3:08 | Elevator door with "COMBAT INFORMATION CENTER" arc label + Cerberus hexagon logo (upturned U) on side panels + orange callout text "Elevator / Use the elevator to access the Normandy's other decks." Door-mode UI in context. |

## Design vocabulary

**ME2 (Cerberus) palette:**
- Bg: deep brown-black `#1a1208` (warm dark, not pure black)
- Primary: omnitool orange `#ff8830` (the iconic Cerberus orange)
- Accent: yellow-amber `#ffcc44` for highlight indicators
- Chrome: brushed-brown `#3a2818` panel borders
- Text fg: cream-white `#f4e8d0` on dark
- Hologram: green `#33ff66` (codex scans)

**ME3 (Alliance / N7) palette:**
- Bg: deep navy `#0a1828` with subtle radial gradient (lighter at center)
- Primary highlight: **N7-red** `#ff2828` (saturated, used on selected items + critical chips)
- Chrome: cool slate-blue `#5078a0` for dividers, panel borders, list rows
- OK / progress: green `#33aa33` (progress bars, ready states)
- Text fg: pure white `#ffffff` on dark, slightly dimmer for body
- Holograms: red+orange in war room, blue-purple in galaxy map

**Both eras share:**
- Holographic projections instead of opaque screens
- Bracket-corner accent indicators (L-bracket selection, arc-corner panel frames)
- Clean sans-serif typography — ALL CAPS section headers + mixed-case content
- Two-pane menu layouts (list + detail)
- Bottom-edge context-action hints
- Numeric readouts with right-alignment
- Subtle radial gradient backgrounds (not flat)

**Iconic primitives:**
1. **War Assets two-pane menu** (ME3 frame 2:22) — list + detail with bracket-corner row highlight. Maps to lucida's existing two-pane substrate vocabulary if we build one.
2. **Orange callout text overlay** (ME2 frames 2:45 + 3:08) — bordered text panel with diamond icon + title + descriptor. Cerberus-era prompt pattern.
3. **Holographic galaxy map** (both eras) — galaxy spiral + endpoint pin + cursor crosshair. Could become a `scene3d` substrate variant for "this cell represents a navigation/relationship to somewhere."
4. **Cerberus hexagon logo** (ME2 frame 3:08) — upturned-U logo on side panels. Could become a per-theme cell-decoration motif when N7/Cerberus side is invoked.
5. **EDI subtitle overlay** (ME2 frame 1:34) — `Speaker: text` convention for AI-assistant dialogue. Maps to **how lucida might surface assistant-quotes in transient cells** ("Claude:" style attribution).

## Retune plan for `themes/renegade.tokens.json` (next session pickup)

Two paths:

### Path A — single-theme `renegade` covering both eras (lighter scope)

1. Keep ME2-orange as primary (matches existing description "omnitool orange + nav cyan on warm-black")
2. Add `accent.alliance-red` = `#ff2828` as ME3-era complement (rare highlight only)
3. Add `accent.cerberus-amber` = `#ffcc44` for state indicators
4. Bg shift: pure-black → warm-black `#1a1208` (matches ME2)
5. New chrome: bracket-corner highlight for `cell-conf-high` cells

### Path B — split into `renegade` (ME2/Cerberus) + `paragon` (ME3/Alliance) sibling themes

1. `renegade` keeps warm-orange-on-black ME2 aesthetic
2. New `paragon` theme: N7-red on navy, sharper geometric chrome, ME3 War Assets layout vocabulary
3. Both share the holographic substrate primitives

Estimated scope:
- Path A: similar to hailmary retune (~1 hour tokens + ~2 hours bracket-corner chrome)
- Path B: ~3-4 hours total (more, but unlocks the moral-binary metaphor in the theme system itself — could be its own demoable affordance)

## Composability

- The two-pane War Assets menu (ME3 frame 2:22) maps cleanly to a future **table substrate variant** with selection state.
- Orange-callout-text overlay maps to lucida's existing **tooltip / annotation overlay** task (task #77 pending).
- Holographic-galaxy-map could be a `scene3d` primitive: extended scene types beyond cube/sphere/torus per task #86 (already completed but could extend with named-shape "spiral_galaxy").
