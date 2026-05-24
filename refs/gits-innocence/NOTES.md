# Ghost in the Shell 2: Innocence (2004) — hacking scene

Source: <https://www.youtube.com/watch?v=VyEMcWH82aI> — "Ghost in the Shell 2: Innocence Hacking Scene [English]" (2:47). Director: Mamoru Oshii. Production I.G / Bandai Visual.

Extracted: 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame.

## Why a separate ref folder from gits-1995

User 2026-05-24: "GITS2 (which might need to be a separate entry)" — **confirmed**. GITS 1995 and GITS Innocence are visually distinct enough they should not share a theme key.

- **GITS 1995 (`refs/gits-1995/`)**: practical-cybernetic, concrete mechanism, green-on-pipes compositing.
- **GITS Innocence (this folder)**: psychedelic-spiritual — concentric orange rings, kanji-tile walls with life/death Zen phrases, no literal UI elements. Abstract dream-state cyberspace.

**No current lucida theme captures this aesthetic.** Could become a new theme key (`innocence`?) or absorb into a future "trance" / "synaptic" theme alongside other dream-state references.

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_00_concentric_orange_rings_glass_dome.png` | 0:00 | Opening hacking-vision shot — concentric orange light arcs descending through a glass dome with white-light grid floor. Spectral rather than mechanical. |
| `00_00_18_yellow_chrome_warning_panel.png` | 0:18 | Yellow chrome warning indicators wrapping around a central spherical chamber. Heads-up-display-as-architecture. |
| `00_00_54_spiral_hologram_dial_close.png` | 0:54 | Close-up of a spiral hologram with concentric rings of orange light + glass-textured rings + small light glints — the "interface element" is a ritual-object, not a button. |
| `00_01_12_punch_cards_orange_spiral.png` | 1:12 | **Punch cards** (vintage ASCII binary on white paper) layered with orange spiral light + "PRODUCTION" text label. Past-tech-meets-future-spectacle. |
| `00_01_50_kanji_wall_birth_death_iconic.png` | 1:50 | **THE canonical Innocence shot.** Wall of glowing kanji tiles: 生死去来 ("birth-death-going-coming"), 棚頭傀儡 ("puppet-on-shelf"), 一線断 ("one-line-cut"), 落落石 ("falling stones"). Zen-aphorism architecture. **The single most distinctive Innocence FUI image.** |
| `00_02_26_multiring_rainbow_time_machine.png` | 2:26 | Multi-ring rainbow time-machine / data-spool — cylindrical glass tower with red/orange/white concentric rings, central play-icon arrow. The "data structure" rendered as Tibetan prayer wheel. |

## Design vocabulary

**Palette:**
- Bg: deep velvet black (`#08050a`)
- Primary: warm amber-orange (`#ee9933`) — spiritual / spectral
- Secondary: red-pink accents (`#cc4466`) on data spirals
- White: pure ritual-light (`#fff8e8`)
- Earth wood: warm parquet (`#a06030`) — floor of the temple-space

**Typography:**
- Display: **traditional Chinese/Japanese kanji** as primary text content, vertical layout, glowing tile backgrounds
- Western text: minimal, monospace technical (labels only, never primary content)

**Iconography:**
- **Concentric rings + spiral cylinders** as "data structures" (instead of grids/lists)
- **Glowing kanji tiles** as wall-architecture
- **Punch cards + ribbon paper** as past-data-substrate
- **Spectral arcs + light particles** as ambient (not actors)
- No buttons, no menus, no readouts — pure metaphor

## Composability with lucida themes

This aesthetic has **no analog in current lucida themes**. The closest is `conclave` (NERV) which shares saturated bilingual feel, but conclave is emergency-red while Innocence is spiritual-amber.

Three options for landing this:

1. **New `innocence` theme key** — minimal scope, only needs:
   - tokens.json with amber-on-velvet-black palette
   - Kanji-tile chrome variant for `cell-conf-high` cells (display title in Japanese as well as English; could pull from a Zen aphorism map)
   - Concentric-rings scene3d primitive variant

2. **Augment `terminus` matrix-green variant** — terminus already has the green-phosphor and could absorb Innocence's "data as ritual object" register as a quieter alternate mode

3. **Defer entirely** — Innocence is so specific that without a clear lucida use-case, it's better cataloged than implemented. Save until a snippet/topic clearly evokes "spiritual data" (e.g. memory-summarization, dream-mode, or contemplative-content cells).

Recommendation: option 3 (catalog now, implement later when a specific need arises). The aesthetic is too narrative-specific to serve general dashboard content without a strong content fit.

## Particular ideas worth keeping for later

- **Punch-card-as-data-substrate** chrome (frame 1:12) — could be a substrate variant for "this cell represents legacy / archived data" — display content with white-card-paper background + ASCII binary visible at edges
- **Kanji-tile wall** chrome (frame 1:50) — display cell title in BOTH English AND Japanese kanji, with the kanji rendered as glowing tile-block (could share `_NERV_JA_GLOSSARY` map proposed in `refs/conclave-nerv/NOTES.md`)
- **Concentric-rings scene3d primitive** — extend `scene3d` substrate's primitive vocabulary to include a "ring-stack" variant for spiral / hierarchical data

## Retune scope

If implementing option 1 (new theme), similar to hailmary (~1 hour tokens + ~2 hours for kanji-tile chrome + ~1 hour concentric-rings scene3d primitive).

If option 3 (defer), zero implementation scope — refs stay cataloged for future inspiration.
