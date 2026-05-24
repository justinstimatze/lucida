# Mainframe references — ReBoot (1994) S1E1 "The Tearing"

Source: <https://www.youtube.com/watch?v=9Tqe6wwITr4> — "ReBoot (1994) S1E1 - 'The Tearing' 4K Upscale" (23:41). Mainframe Entertainment / ABC. Note: episode sampled in three windows (60-180s, 420-540s, 1080-1200s) since user noted "I'm not sure how to isolate the interfaces in reboot because there doesn't seem to be a compilation but maybe checking the first episode will provide enough."

Extracted: 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame.

## Why mainframe

Current `mainframe.tokens.json` description: "neon aqua city grid, Game Cube purple accent." ReBoot's Mainframe (the in-show city) confirms the direction: it's a **CGI-pre-rendered 1994 aesthetic** where digital entities and physical space share the same visual register. Bright primary colors, plastic-shaded geometry, "Vid Window" floating UI panels, and the iconic green grid pattern across surfaces.

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_14_mainframe_grid_city_rooftops.png` | 0:14 | Looking down at Mainframe city rooftops — green crosshatch grid pattern on every surface, blue trim, Sky-cloud backdrop. Canonical "the city is a grid" texture. |
| `00_00_26_megabyte_tower_orange_grid_skyline.png` | 0:26 | City skyline with orange industrial smokestacks + grey buildings + sand floor + a vehicle in foreground. Wider context shot. Megabyte's territory has darker palette. |
| `00_00_40_guardian_sprites_red_blue_helmets.png` | 0:40 | Two spherical guardian "binome" sprites — chrome-painted red and blue dome helmets with white face plates and beady red eyes. Iconic ReBoot character primitive. |
| `00_00_52_vid_window_communication_panel.png` | 0:52 | **Vid Window UI panel** — floating rectangular frame with "Vid Window" title bar, character portrait inside, arrow control. **The iconic ReBoot UI primitive** — a windowed inline overlay for communication. |
| `00_01_18_spherical_sprite_head.png` | 1:18 | Spherical character head close-up — solid colors, plastic-shaded geometry, simple eye-mouth features. Type-character primitive. |
| `00_01_58_fifties_diner_game_interior.png` | 1:58 | 1950s-diner-themed game interior — checkerboard floor pattern, teal+pink color scheme, plastic-shaded everything. Shows that ReBoot's "games" each have their own aesthetic riff inside the broader Mainframe register. |

## Design vocabulary

**Palette (Mainframe baseline):**
- Bg: cloud-sky (`#a8c8e0`) or pure black for transitions
- Primary: aqua-cyan `#00d8d8` (the "Mainframe blue")
- Grid: bright neon green `#33ee44` (the iconic city grid)
- Building base: cool grey `#c8c8d0` plastic-shaded
- Sprite primary: red `#ee2222` or blue `#3344ee` (Guardian helmet colors)
- Accent: Megabyte purple `#9933cc` (rare highlight, villain-coded)
- Skin: pale blue `#9eaecc` (Mainframe sprites are blue-skinned)
- Industrial accent: orange-rust `#cc6622` (Megabyte territory)

**Typography:**
- Display: chunky rounded sans-serif (think Bauhaus or rounded Futura)
- Body: clean sans (any 90s CGI workstation type — "Bahnschrift" works)
- Panel titles: white-on-blue inset bar with rounded corners

**Iconic primitives:**
1. **Vid Window panel** — bordered rectangular floating panel with title bar at top, content (character portrait or data) inside, optional arrow controls. Different from a tooltip — feels like a Skype call inside a video game.
2. **Sphere-character sprite** — perfectly spherical head with simple painted features. Could become a `scene3d` primitive variant.
3. **Plastic-shaded geometry** — flat-shaded with hard Phong highlights (no PBR realism). Whole-scene aesthetic.
4. **Green grid surface** — crosshatch line pattern on flat colored surfaces. Could overlay cells with `terminus`-adjacent flair but in mainframe's specific neon-green.
5. **Per-game aesthetic shifts** — when entering a "Game Cube" the local area transforms aesthetic (50s diner, sci-fi battle, etc). Maps to **transient cell variants** that briefly adopt non-canonical chrome.

## Composability with existing mainframe theme

`themes/mainframe.tokens.json` likely needs:
- Confirm aqua-cyan `#00d8d8` primary stays
- Add neon-green grid token (`fx.surface-grid: #33ee44` for crosshatch overlay)
- Add Megabyte purple as RARE highlight (existing description mentions "Game Cube purple")
- Add orange-rust as warning state (Megabyte territory color)
- New chrome: "vid-window" cell variant with rounded title bar + arrow controls (could replace generic cell chrome in this theme)
- Type stack: rounded display sans + clean body

**Per-game-aesthetic** is a unique mainframe affordance — could land later as a "transient cell briefly cosplays a different theme" flair for the "GAME" event class.

Estimated scope: smaller than hailmary (~45 min tokens + vid-window chrome variant ~1 hour). Per-game flair = its own future task.

## Caveats

- This is one episode of one show. The Mainframe vocabulary varies across the series' 4 seasons (became more complex / darker by S4). For an authoritative pass, sample S2-S4 too.
- The user noted "there doesn't seem to be a compilation" — first episode is the easiest legit reference but if a fan-cut compilation surfaces later, retrune from that.
