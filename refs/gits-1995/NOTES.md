# Ghost in the Shell (1995) — "Ghost fingers" typing scene

Source: <https://www.youtube.com/watch?v=x-zUAb_ndDk> — "Ghost fingers" (19s clip). Director: Mamoru Oshii. Production I.G / Bandai Visual.

Extracted: 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame.

## Why a separate ref folder from gits-innocence

User 2026-05-24: "GITS2 (which might need to be a separate entry)" — **confirmed**. GITS 1995 and GITS Innocence (2004) are visually distinct enough they should not share a theme key, the same way Tron 1982 and Tron Legacy split:

- **GITS 1995 (this folder)**: practical-cybernetic — concrete mechanism, multi-fingered hands on a glass keyboard, green-code-overlay on industrial pipes. Tangible cyberspace.
- **GITS Innocence (`refs/gits-innocence/`)**: psychedelic-spiritual — concentric orange rings, kanji-tile walls (life/death zen phrases), no literal interface. Abstract dream-state cyberspace.

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_00_cyberpunk_character_group_pipes.png` | 0:00 | Wide character ensemble shot inside an industrial-pipe-tangle room — establishes the "cyberspace is physical infrastructure" register. |
| `00_00_05_character_at_keyboard_anchor.png` | 0:05 | Character moving toward keyboard — interior with metallic ductwork and consoles. |
| `00_00_10_cybernetic_typing_hands_close.png` | 0:10 | **Iconic cybernetic typing hands** — splayed multi-fingered cyborg arms with wooden fingertips on chrome bodies, hovering over a black grid keyboard. The "ghost fingers" of the title. |
| `00_00_13_cyan_keyboard_lit_indicators.png` | 0:13 | Keyboard from above with **teal-cyan glowing square indicators** lighting up at key-strike positions. Mechanical typing + cyan glow grid. |
| `00_00_15_green_code_overlay_iconic.png` | 0:15 | **The canonical GITS 1995 terminal moment** — translucent green C code overlay ("LOADIMG", "CUB_PLAN", "AI_RB_BLACK", "char(BELL)", "signed char") composited over the industrial pipes background. Phosphor-green-on-transparent over real-world depth. |

## Design vocabulary

- **Palette**: deep blue-grey industrial (`#3a4858` pipe shadows), teal-cyan glow (`#33ccdd` keyboard indicators), green phosphor (`#33ff66` code overlay), warm skin/wood (`#c89870` finger tips against chrome bodies)
- **Composite aesthetic**: code is TRANSLUCENT, you can see the physical environment THROUGH it — not on an opaque screen
- **Typography**: monospace C-style code, mixed-case (lowercase function names + ALL CAPS constants), aliased pixel-style rendering
- **Iconography**:
  - Multi-fingered cyborg hands (mechanism made literal)
  - Glass/black keyboard with embedded grid of LEDs
  - Pipe-and-cable industrial environment (the "wetware" of cyberspace as actual fluid plumbing)

## Composability with lucida themes

- **`terminus` already covers**: green-on-black phosphor terminal aesthetic. GITS 1995 ADDS: translucent-code-over-environment compositing, which terminus could pull in as a `cell-overlay` chrome variant (code text rendered with `opacity: 0.85; mix-blend-mode: screen` over a background image).
- **`hackers` already covers**: cyan-glass surfaces with grid indicators. GITS 1995 ADDS: the BLUE-DOTTED-KEY look could be a keyboard-input substrate variant.
- **New chrome flair candidate**: translucent-code-on-environment for `terminus` `cell-fresh` states — when a new cell is being parsed, briefly show the spec text translucent over the rendered cell content before the spec text fades and the substrate stabilizes.

## Retune scope

Smaller than other ref-driven retunes. Mostly a `terminus` augmentation pass:
- 1 hour: add `cell-overlay` chrome for translucent-code-over-rendered-content pattern
- ~30 min if we want to add a "ghost-typing" cell-fresh animation that mimics the multi-finger key-strike LED pattern

No new theme key needed; lives entirely within terminus's existing register.
