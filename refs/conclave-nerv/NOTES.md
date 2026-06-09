# NERV / Evangelion references

Source: <https://www.youtube.com/watch?v=zI2Fme6k-Iw> — "Interfaces of Neon Genesis Evangelion (upscaled)" by Jonathan Kim. 2:56, 1080p, upscale of ygbarelli's original compilation. Anime series: Neon Genesis Evangelion (1995-1996), Gainax / Hideaki Anno.

Extracted: 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame.

Decision 2026-05-24: "ultra dense, we'll need to check several frames per second, but is probably the best nerv/evangelion reference I've seen."

## Why this matters

The current `conclave` theme tokens were described as "amber + green three-machine consensus" (the MAGI being the three-machine reference). That's directionally right but **understates the NERV vocabulary by a wide margin**. This reference set reveals:

- Red is **dominant** for emergency/danger states, not just an accent
- Orange + yellow + green form a full warning ladder
- **Bilingual labels** (English + Japanese 漢字) are signature — not optional
- **Diagonal-chevron MAGI-pattern blocks** are the iconic chrome primitive — distinct from any other FUI cataloged so far
- LED-style "POSITION" chips, brutalist-condensed sans-serif, monospace tabular system output coexist as deliberate type-pairing

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_00_eva01_wireframe_position_chip.png` | 0:00 | Rainbow-gradient EVA-01 schematic with green "POSITION" LED chip in corner. Chip pattern + wireframe combo. |
| `00_00_05_emergency_bilingual_red_chevron.png` | 0:05 | Red+black emergency chevron banner with bilingual "EMERGENCY" + 非常事態. **Bilingual signature.** |
| `00_00_10_brain_cortex_bars_yellow_green.png` | 0:10 | Yellow→green gradient bars labeled AMYGDALA/HIPPOCAMPUS/PARIETAL LOBE/MOTOR CORTEX/SENSORY CORTEX with red threshold line at zero. Cortex-bar substrate candidate. |
| `00_00_20_neurology_eva_body_spec_diagram.png` | 0:20 | EVA anatomical diagram with synapse-L/synapse-R columns + dense anatomical labels (R-EYE/IRIS/INNER EAR CANALS/...). Dense-label spec layout. |
| `00_00_25_dna_codon_chevron_grid.png` | 0:25 | Red diagonal-chevron blocks with DNA codon labels (A0131-A0138) + binary indices. **Iconic MAGI chevron grid.** |
| `00_00_30_borderline_absolute_warning_block.png` | 0:30 | Mixed green+red+yellow chevrons with "ABSOLUTE-L BORDER-LINE" diagonal warning callout. Warning-callout overlay pattern. |
| `00_00_46_green_chevron_activation_panel.png` | 0:46 | Full green chevron activation panel — A0131-A0138 lit. Active-state variant of chevron grid. |
| `00_00_50_at_field_reactor_torus.png` | 0:50 | A.T. Field reactor display with "5th ANGEL: A.T.Field; extended" red callout, torus with orange tick measurements. Reactor/gauge substrate. |
| `00_00_56_eeg_waveform_brain_regions.png` | 0:56 | EEG waveform overlay on the cortex-bar layout. Waveform-over-bars composite. |
| `00_01_00_emergency_bilingual_red_banner.png` | 1:00 | Pure red+black emergency stripe banner. Full-viewport warning state. |
| `00_01_06_magi_system_terminal_config.png` | 1:06 | MAGI system config terminal: monospace red text with "Copyright(C) 2014,2015 日本重化学工業共同体", CO-CPU/I/O VECTORS/CONSOLE DRIVERS/ROOTING TABLES checks, SYSTEM CONFIGURATION memory map. **Terminal substrate canon.** |

## Design vocabulary

**Palette (re-derived — replaces the prior "amber+green" oversimplification):**

| Role | Color | Use |
|---|---|---|
| Bg | `#000000` true black | Always |
| Primary alarm | `#cc1f1f` saturated red | Emergency state — DOMINANT in NERV |
| Active/safe | `#3fbf3f` saturated green | Active chips, lit chevrons |
| Warning | `#ff9933` orange | Mid-warning, calibration marks |
| Caution | `#ffcc33` yellow | Pre-warning, gradient top |
| Cyan | `#5fbfff` | RARE — used in one specific "memory grid" frame (0:40) |
| Text fg | `#ff3030` for alarm, `#3fff3f` for terminal, `#ffaa44` for chips | State-driven |

**Typography stack:**
- LED-style display: chunky brutalist sans-serif (Bahnschrift Condensed + bracket corners), ALL CAPS
- Anatomical/spec labels: small condensed mono-leaning sans
- Terminal output: monospace (Courier-family), tabular
- **Always bilingual** where space allows: English ↔ Japanese 漢字

**Iconic primitives (each could become a substrate variant or chrome flourish):**
1. **Diagonal-chevron block grid** — the MAGI pattern. Red+green+yellow chevrons aligned in columns with codon-style labels (`A0131 / 010001`).
2. **Bilingual warning banner** — chevron-edge stripe with `EMERGENCY` + `非常事態` (or context-appropriate Japanese).
3. **Cortex-bar substrate** — vertical gradient bars (yellow→green) with red threshold line, labeled with anatomy.
4. **EVA anatomical spec layout** — silhouette body in center, dense anatomical labels in columns left/right.
5. **MAGI terminal block** — monospace red-on-black system config with Japanese org-name copyright header.
6. **A.T. Field reactor display** — concentric torus with measurement crosshairs + event-callout pill.

## Retune plan for `conclave` theme (next session pickup)

1. **Tokens (`themes/conclave.tokens.json`):**
   - Saturated red `#cc1f1f` becomes primary (replaces amber as dominant)
   - Add "alarm" / "warning" / "caution" as full ladder, not single accent
   - Add cyan as RARE-highlight only
   - Type stack: add Bahnschrift/DIN Condensed + monospace pairing
   - Add `fx.chevron-warning` token for diagonal-stripe pattern

2. **Chrome additions** (per-substrate, theme-only):
   - Bilingual cell-title overlay (English + Japanese — pull from a static `_NERV_JA_GLOSSARY` map keyed on cell-type)
   - Diagonal-chevron border decoration for `cell-conf-high` cells in conclave (replaces generic rare-highlight)
   - Red "EMERGENCY"-banner full-viewport overlay for danger-mode (when activated)

3. **New substrate / decorative variants:**
   - `cortex-bar` substrate variant — vertical labeled bars with threshold line
   - `magi-terminal` variant of `code` substrate — red-on-black system-config aesthetic

4. **Estimated scope**: similar to hailmary retune (~1 hour for tokens + 2-3 hours for chrome variants). Bigger if `cortex-bar` is built as a new substrate.

## Composability

- New vocabulary that could **also serve** the `vigil` warning-state work (red alarm banner pattern) and the broader "rare highlight rule" (NERV bilingual chip = a strong "rare" signal candidate).
- Aligns with the broader theme-canon push (hailmary, ops, eDEX-UI, Tron 82/Legacy refs) — each canonical source has distinct vocabulary requiring distinct tokens + chrome rather than one universal layout.
