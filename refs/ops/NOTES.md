# Ops theme references — LCARS (Star Trek TNG)

Sources (System47 / meWho — see design-references.md):
- `gXnuG9dcpDo` — "Enterprise-D LCARS Asset Prep timelapse" (3:11). Best for design-vocabulary extraction — shows pill chips, bracket frames, and grid composition being built in Figma.
- `9XtYJmSu5oY` — "Titan.DS: Spacedock 1-Hour Loop in 4K". Finished aesthetic in motion.

Extracted: 2026-05-23 via claude-video-vision plugin + ffmpeg.

## Frames

| File | Source | What it captures |
|---|---|---|
| `00_00_26_lcars_pill_chip_anatomy.png` | prep | Pill chips up close — anatomy of LCARS button (rounded-end fill + numeric label). |
| `00_00_30_spacedock_live_render.png` | spacedock | Live Titan.DS rendering — see chrome in motion. |
| `00_00_54_operations_management_full_frame.png` | prep | Full Operations Management frame — section headers, mixed-state pill rows. |
| `00_01_20_lcars_mode_select_panel.png` | prep | LCARS MODE SELECT + circular control widget. |
| `00_01_48_warp_drive_systems_chrome.png` | prep | Warp Drive Systems section — bracket-edged title bar. |
| `00_02_14_flight_control_navigational.png` | prep | Flight Control / Navigational Reference — block composition. |
| `00_02_42_nav_ref_course_select.png` | prep | NAV REF / COURSE SELECT detail — pill density. |
| `00_03_08_enterprise_d_finished_asset.png` | prep | Final composite — full Enterprise-D dashboard. **Best single reference for color palette + composition.** |

## Design vocabulary (LCARS canon, confirmed by refs)

- **Pure black bg** `#000000` — never navy/blue-tinted (pre-2026-05-23 ops.tokens.json had `#000044`, was incorrect)
- **Orange primary** `#ff9900` — iconic LCARS bracket color
- **Cream** `#ddb888` `#e8c89c` — dominant pill fill
- **Yellow-gold** `#ffcc66` — secondary pill state
- **Lavender** `#cc99ff` — alt pill chip (NOT magenta-leaning `#cc5599`, which was incorrect)
- **Salmon/peach** `#ff9966` — tertiary highlight
- **Red** `#cc4444` — alert state (rare)
- **L-shaped / J-shaped chrome frames** at edges
- **Rounded pill buttons** with bold numeric labels
- **Block-letter section headers** in caps
- **Microgramma / Eurostile / Antonio** condensed-bold sans-serif

## Polishes derived from these refs (2026-05-23 commit)

1. `themes/ops.tokens.json`:
   - cell bg `#000044` → `#000000` (true LCARS)
   - cat[2] `#cc5599` dark magenta → `#cc99ff` canonical TNG lavender
   - accent.secondary `#ffcc99` → `#ddb888` (cream over peach)
   - accent.warning `#ffcc33` → `#ffcc66` (softer LCARS yellow)
   - text.fg `#ffcc99` → `#e8c89c` (matches cream pill text)
   - palette.stroke* updated to match new data.cat ordering

2. Unlike vigil/hackers/hailmary's cyan-dominant ladder rule, ops keeps bold color diversity at cat[0..3] — LCARS is intentionally polychromatic.

## Future enhancements informed by these refs

- Animated cell-fresh state: pill-rounded-rectangle morph (cells "bloom" with the LCARS pill bracket as a chrome flair).
- Section-header bracket frame (J-shape) as a per-cell chrome variant.
- Real-bezel chrome generalization (task #80) — LCARS is the canonical case here.
