# eDEX-UI references — Tron Legacy / DEX-UI inspired terminal

Source: <https://github.com/GitSquared/edex-ui> (archived 2021-10-18). Demo video: <https://www.youtube.com/watch?v=BGeY1rK19zA> (30s, 2021 OSS Awards trailer).

Extracted: 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame.

## CRITICAL LICENSE NOTE

**eDEX-UI is GPL-3.0. Lucida is MIT. We CANNOT lift code, CSS, assets,
or substantial UI patterns from the repo without forcing lucida to
relicense to GPL-3.0 (copyleft propagates to every downstream user).**

What we CAN do (per `design-references.md` § eDEX-UI):
- Use as **visual reference only** — observe vocabulary, reimplement
  independently. Ideas aren't copyrightable, only specific code.
- Treat exactly like film stills — sketch, reimplement; never copy
  CSS/JS/asset files from the repo.

If we ever need to read the eDEX-UI source for reference (to confirm
a visual behavior is achievable, etc.), the reading must NOT translate
into transcription — write our own implementation from scratch based
on the observed behavior.

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_10_default_full_dashboard_cyan.png` | 0:10 | **Canonical layout shot.** Default cyan theme, full chrome: top status bar, left-sidebar system metrics, center tabbed terminal (MAIN + 4 EMPTY tabs), right-sidebar network panels, bottom-left filesystem browser, bottom-right on-screen keyboard. Best single reference for the eDEX-UI layout vocabulary. |
| `00_00_13_touchscreen_yellow_tron_mode.png` | 0:13 | Yellow Tron-mode variant, touchscreen-friendly. Shows photo-of-actual-screen perspective. |
| `00_00_16_powershell_processes_yellow.png` | 0:16 | PowerShell process listing inside the terminal panel — long tabular content. |
| `00_00_19_settings_modal_overlay.png` | 0:19 | Settings modal as overlay on top of the dashboard — translucent panel pattern. |
| `00_00_23_htop_pink_accent_default_theme.png` | 0:23 | `htop` running in the terminal, default theme with pink accents in the htop output itself. Shows mixed-color cell content over monochrome chrome. |
| `00_00_26_cmatrix_green_matrix_theme.png` | 0:26 | **`cmatrix` running + matrix-green theme variant.** Same layout, all green-on-black phosphor palette. Closest to our `terminus` theme. |

## Layout vocabulary (consistent across all themes)

Named slots around a central hero — same pattern as the PHM cockpit
direction (task #190). Could be the canonical pattern for a future
"operator-terminal" layout mode in lucida.

| Slot | Content |
|---|---|
| Top status bar | Time HH:MM:SS, date, uptime, type, power, manufacturer, model, chassis |
| Top-left panel | Huge clock + system metadata block |
| Left sidebar | CPU usage (2 wave plots) + TEMP/SPD/MAX/TASKS + MEMORY bar + TOP PROCESSES |
| Center hero | Tabbed terminal (MAIN + N EMPTY tabs) |
| Right sidebar | NETWORK STATUS + WORLD VIEW with globe + GeoIP endpoint + NETWORK TRAFFIC graph |
| Bottom-left | FILESYSTEM file browser with type icons + mount usage bar |
| Bottom-right | Full on-screen keyboard (QWERTY) |

## Aesthetic primitives

- Frosted/translucent panel borders, rounded corners
- Cyan/yellow/green theme variants (palette swap, not layout change)
- Real-time wave plots for CPU/memory
- Animated rotating globe with endpoint pin (GeoIP visualization)
- Process list with PID/CPU%/MEM% inline
- File type icons (color-coded by extension)
- Bracket-cornered tab labels

## Composability with existing lucida arcs

- **`circuit` theme retune** — circuit is already Tron-derived; could
  pick up the slot vocabulary even without a new layout mode.
- **PHM "cockpit layout" (task #190)** — same named-slots-around-hero
  pattern. Both could share the layout primitive once built.
- **`terminus` matrix-green variant** — the cmatrix frame (00:00:26)
  is essentially terminus's aesthetic. Layout could give terminus a
  fixed-slots variant alongside the existing simple-stream.

## Use of this reference set

These frames inform:
- Slot layout decisions in any future "cockpit" / "operator-terminal" mode
- New substrate variants (system-monitor cells with wave plots, GeoIP globe widget, process-list cell)
- Chrome flourishes (frosted-translucent panel borders, bracket-cornered tab labels)

They do NOT inform: code structure, CSS class names, Electron config, or
any specific implementation detail. Those must come from independent
implementation against the visual observations.
