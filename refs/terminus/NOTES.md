# Terminus references — Alien (1979) MU-TH-UR 6000

Source: <https://www.youtube.com/watch?v=oxdCEBppRM8> — "Alien (1979) — Dallas Accesses MU-TH-UR 6000 (MOTHER AI) | 4K AI Remastered Movie Clip" (3:18, 4K AI-upscaled). Director: Ridley Scott. Distributor: 20th Century Fox.

Extracted: 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame.

## Why this matters

Current `terminus.tokens.json` description: "phosphor on black — end of the line." The MOTHER scene from Alien 1979 is **the canonical FUI reference for this aesthetic**. The "INTERFACE 2037 READY FOR INQUIRY / WHAT'S THE STORY MOTHER?" screen at 1:27 is one of the most-cited FUI moments in film history — pure green phosphor monospace on black with a blinking yellow cursor. Existing terminus tokens should already be aligned, but this gives us the authoritative reference to verify against and tune from.

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_42_mother_room_yellow_tile_grid.png` | 0:42 | First view of the MOTHER room — Dallas at the entrance, surrounded by walls of yellow-amber pinhole lights in a tile grid. Reads as the "interior of a circuit." |
| `00_01_05_mother_dome_yellow_lights_full.png` | 1:05 | Full dome view of the MOTHER room — Dallas at the central terminal, walls and ceiling completely covered in pinhole light grids. **The chamber aesthetic.** |
| `00_01_27_mother_interface_2037_green_text.png` | 1:27 | **THE iconic MOTHER terminal screen.** "INTERFACE 2037 READY FOR INQUIRY / WHAT'S THE STORY MOTHER?" in green phosphor monospace on pure black, yellow block cursor at end of input line. **Canonical reference for terminus theme.** |
| `00_02_10_nostromo_exterior_dark_blue_dark.png` | 2:10 | Nostromo exterior — industrial dark blue ship hulls against deep black starfield. Wide context reference. |
| `00_02_32_navigation_chart_cyan_console.png` | 2:32 | Blue-cyan navigation chart on a console — circuit-board-style lines with numeric labels (11.345, 11.296, 11.295, 11.293...), trajectory traces. Secondary terminal aesthetic, **not green-phosphor but blue-circuit-trace**. |
| `00_03_15_engine_room_analog_hardware.png` | 3:15 | Ripley + cat against the engine room — physical analog hardware, brass-gauge dials, ribbed industrial pipes. Practical hardware reference (not screen UI, but contextual). |

## Design vocabulary

**Primary palette (green-phosphor terminal):**
- Bg: pure `#000000` true black
- Text fg: pure green phosphor `#33ff33` (lime, not teal)
- Cursor: amber-yellow `#ffcc22` solid block
- Underline emphasis: same green, full opacity
- NO secondary chrome — the terminal is just text + cursor on void

**Secondary palette (blue-trace navigation):**
- Bg: dark navy `#0a1828`
- Trace primary: bright cyan `#00ccee`
- Numeric labels: bright cyan smaller
- Console frame: brushed-grey `#3a3a40`

**Tertiary palette (yellow-tile room — physical):**
- Tile grid: pale-grey ceramic `#c8c4b8`
- Pinhole lights: warm amber `#ffaa22` (the LED-grid backlight)
- Negative space: deep shadow `#0a0a0a`

**Typography:**
- Terminal: monospace, slab-square, **definitely IBM-3270 or similar pre-modern terminal font** (NOT a clean Courier — has the chunky uneven serif of CRT-stencil)
- All caps for system messages
- Mixed case for user-typed queries ("What's the story Mother?")

**Iconic primitives:**
1. **Green phosphor monospace text on void** — the canonical terminus look. Solid yellow block cursor.
2. **Blue-trace navigation chart** — circuit-board-style lines with numeric annotations. Secondary substrate for trajectory/timeline content in terminus.
3. **Yellow-tile pinhole-light wall** — could become a per-cell background texture (rare highlight or chamber-mode flag).
4. **CRT scanline overlay** — implicit (1979 film) but should be on every terminus cell as an `::after` pseudo-element with scanline gradient.

## Composability with existing terminus theme

If `themes/terminus.tokens.json` is already green-on-black per its description, the tuning is incremental:
- Confirm green is `#33ff33` lime (not a teal-shifted variant)
- Cursor token: solid amber-yellow block `#ffcc22`
- Add the blue-trace secondary palette for nav/trajectory cells
- CRT scanline `::after` overlay if not already present
- Font: ensure it's a chunky CRT-style mono, not a clean Courier

The yellow-tile room is **chamber aesthetic** — could inform a future "terminus active session" mode where the dashboard chrome (the page-level frame around the cells, not the cells themselves) takes on yellow-pinhole texture.

Estimated scope: smaller than the others (~30 min tokens + ~30 min CSS for scanline + ~30 min font swap-in). May already be correct; verify-against-frame.

## Adjacent reference

- **`noir`** theme could pull from frame 0:42 / 1:05 (the yellow-tile MOTHER room) — that's noir-adjacent atmospheric. Worth a cross-reference when noir gets its retune.
- **Cinematic scanline** as a universal flair option — terminus is the canonical use, but other themes (vigil, hackers) could opt-in for "VHS rip" cell-fresh states.
