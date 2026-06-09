# Tron: Legacy (2010) references

Source: <https://www.youtube.com/watch?v=Qeh3E67brBs> — "Hacking Encom's new operating system" (4:28, 1080p). Director: Joseph Kosinski. Distributor: Walt Disney Studios.

Extracted: 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame.

## Why separate from `tron-82`

Decision 2026-05-24: "for tron 1982 which may need to be its own thing." Confirmed — the 2010 and 1982 aesthetics are fundamentally different. See `refs/tron-82/NOTES.md` for the 1982 vocabulary.

**Tron: Legacy 2010 = corporate-future glass + thin-line HUDs**
- Cool desaturated blue-grey + cyan accent slivers, mostly white text
- Black glass surfaces, brushed-steel frames, frosted overlays
- Thin OLED-style data displays, real-time financial dashboards as HUD
- Hardware aesthetic: corporate boardroom + sleek tablets

**Tron 1982 = neon-vector geometric era** (see other folder)
- Deep saturated blues with backlit edge glow
- Low-poly vector environments, geometric primitives
- Orange/red as rare highlight

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_26_encom_hallway_cool_white.png` | 0:26 | Server-room corridor with "02" door label. Cool-white floor strip lighting, dark blue-grey walls. Encom hardware-aesthetic baseline. |
| `00_01_26_presenter_dashboard_hud.png` | 1:26 | Dillinger presenting to board: rotating wireframe globe + GLOBAL STOCK chart + thin candle chart + COUNTDOWN TO L... 04:... + sparkline + corner pip readouts. THE canonical Legacy HUD shot. |
| `00_01_56_countdown_candle_graph.png` | 1:56 | Wider HUD with sparkline + candlestick + countdown "03:01:58" + WORLDVIEW endpoint. Mostly cool blue-grey with yellow + cyan accent dots. |
| `00_02_56_server_room_encom_cabinets.png` | 2:56 | Server room with ENCOM-branded server cabinets, LED status grid (red + green + amber), spotlight beam through fog. Server-rack aesthetic for future "datacenter" theming. |

## Design vocabulary

- **Palette**: cool desaturated blue-grey base (`#1a2530` range), cyan slivers (`#6db4d4`), white text, occasional yellow dots (`#ffcc44`) and amber/red status LEDs
- **Typography**: thin sans-serif, ALL CAPS short labels, monospace tabular readouts
- **Chrome**: thin bracketed corners, hairline panel borders, low-contrast section dividers
- **Density**: per-cell content is sparse — wide white-space, small numeric readouts, single large visualization per panel
- **Animation hints**: candlestick chart updates, rotating wireframe globe, countdown timer

## Composability

- Closest existing lucida theme: **`circuit`** (`teal-blue + orange binary on pure black`) — but `circuit` is more saturated than Tron Legacy. Could split: keep `circuit` for 1982 vibes + new theme for Legacy.
- Or absorb into a renamed `circuit-legacy` variant.
- Sparse-content + countdown-timer + rotating-globe vocabulary maps to PHM cockpit-layout arc (task #190).
