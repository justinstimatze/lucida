# Hailmary theme references — Project Hail Mary (System47/meWho rendition)

Source: https://www.youtube.com/watch?v=9yoMXYTC9pA — "▵Project: Project Hail Mary • 1-Hour Loop in 2K" by System47 / meWho (Rob), 1hr at 2560x1440. Interactive site: https://mewho.com/pphm
Extracted: 2026-05-23 via claude-video-vision plugin (video_watch) + ffmpeg seek-to-frame.

The book/movie (Andy Weir 2021, Lord-Miller adaptation 2026) doesn't have an established UI canon yet. System47/Rob's interactive site is the most thoroughly-designed imagining of what the Hail Mary ship's interface would look like. We're using it as the seed for the theme; if the actual film lands with a different aesthetic later, we can re-extract.

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_01_ship_wireframe_wide_chrome.png` | 0:01 | Wide first view — full chrome layout: top-left logo, left-sidebar numeric readouts (THRUST/SPIN/P0..P3), right-sidebar STATUS + HULL INDICATOR pills + DISP MODE, bottom view-control bar. |
| `00_00_10_centrifuge_spin_view.png` | 0:10 | Centrifuge mid-extension. Yellow ALERT pill active. |
| `00_00_20_ship_below_red_warning_lines.png` | 0:20 | Red dashed warning lines visible top + bottom — the canonical PHM "out of range" indicator. |
| `00_00_30_centrifuge_cluster_close.png` | 0:30 | Close on centrifuge cluster — wireframe density reference. |
| `00_00_40_ship_tilted_yellow_active.png` | 0:40 | Tilted side view with REGULATOR active (yellow chip). |
| `00_00_58_vertical_view_full_chrome.png` | 0:58 | Best vertical reference of chrome density. |
| `00_01_08_centrifuge_active_hand_grip.png` | 1:08 | Hand-grip module + CENTRIFUGE MODE: ACTIVE (orange pill). |
| `00_01_18_lateral_view_engaged.png` | 1:18 | Lateral. ACTIVE state. |

## Design vocabulary

- **Wireframe cyan-white** `#a8e8f0` family (lighter, more blue than vigil's `#00d8e8` teal). Reads "technical drafting", not "Jarvis combat glow."
- **Background**: near-black navy `#040a14` — barely-blue tint.
- **Yellow pill chips** `#ffd640` for warning/alert states.
- **Green pill chips** `#88ee88` for active/nominal.
- **Orange pill chips** `#ff9933` for "extending" / transitioning state.
- **Red dashed warning lines** `#ff4040` at viewport top/bottom edges when out-of-range.
- **Heavy numeric readouts** — left sidebar shows multiple decimal-aligned readouts (THRUST 1.485, P0 91.9, etc.) Tabular monospace.
- **Multi-grid axis with measurement labels** — dashed grid + X/Y/Z numeric coords overlaid.
- **Typography**: semi-condensed sans-serif (Bahnschrift / DIN Condensed equivalents), all-caps short labels.

## Distinct from vigil (Iron Man Jarvis)

| | Vigil | Hailmary |
|---|---|---|
| Primary cyan | `#00d8e8` saturated teal | `#a8e8f0` light wireframe-blue |
| Bg | true `#000000` black | `#040a14` near-black navy |
| Vibe | combat HUD / always-watching | technical drafting / engineering review |
| Pill chips | rare highlight | foundational chrome vocabulary |
| Numeric density | spotty | dominant left-sidebar |

## Polishes derived from these refs (2026-05-23 — theme-only, no layout yet)

1. `themes/hailmary.tokens.json` created from scratch.
2. `index.html` THEME_REGISTRY entry added.
3. Decided to defer a PHM-specific layout (centrifuge cylindrical / module-strip) until we observe how the theme reads on existing layouts.

## Attribution

System47 / meWho is the reference source for this theme. Their portfolio (Titan.DS, TURBOLIFT 1, Protostar.NX, APOD Stardate, ▵PHM) is some of the most thoroughly-researched FUI work available in 2026. See `design-references.md` § "Video reference channels" for the cite.
