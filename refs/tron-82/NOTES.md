# Tron (1982) references

Source: <https://www.youtube.com/watch?v=Ppoz8ObULBE> — "Tron (1982) — Bit" (3:02). Director: Steven Lisberger. Backlit photochemical + CGI hybrid (~one of the first widely-released computer-rendered films).

Also queued: <https://www.youtube.com/watch?v=yN5TYdSqYVg> — Solar Sail simulation (2:01) — downloaded but not extracted (action/movement-heavy, less useful for UI vocabulary).

Extracted: 2026-05-24 via claude-video-vision plugin + ffmpeg seek-to-frame.

## Why separate from `tron-legacy`

Decision 2026-05-24: "for tron 1982 which may need to be its own thing." **Confirmed.** Tron 1982 and Tron Legacy (2010) are fundamentally different aesthetics that should NOT share a theme key:

**Tron 1982 (this folder)**
- Deep saturated cyan/teal with backlit edge glow on every surface
- Low-poly vector-graphic environments — geometric primitives, flat-shaded planes
- Rotoscoped + photochemical-blacklit characters (the iconic "circuit suit" glow)
- Iconic geometric "BIT" character (icosahedron — a perfect polyhedron flipping between two states)
- Orange/amber/red as RARE highlight (cockpit warning indicators, MCP red)
- Pure black background, deep blue-cyan as "lit space"

**Tron: Legacy 2010** (see `refs/tron-legacy/NOTES.md`)
- Corporate-future cool blue-grey + cyan HUDs
- Thin-line OLED data displays
- Real-time financial dashboards, sparklines, rotating wireframe globes

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_20_tron_character_cyan_suit.png` | 0:20 | Tron in his circuit-traced cyan suit standing in a CGI-rendered interior. Backlit suit lines glow against the dark-blue environment. **The canonical Tron 1982 character look.** |
| `00_01_00_bit_icosahedron_geometric.png` | 1:00 | **The BIT character.** A perfect icosahedron with internal facets, floating against pure black with light slivers behind. Geometric primitive as a CHARACTER. Single most-iconic Tron 1982 image. |
| `00_01_20_cockpit_circuit_amber_accents.png` | 1:20 | Inside the recognizer cockpit. Pilot wears circuit suit. Foreground console has bright amber/orange accent buttons + a green grid panel. Shows the rare-warm-accent rule firing in context. |
| `00_01_40_vector_environment_full_body.png` | 1:40 | Full-body shot in an angular, neon-edged corridor. Dense vector lines on every surface — equipment, walls, floor, ceiling. Aesthetic at peak density. |
| `00_02_00_low_poly_corridor.png` | 2:00 | Low-poly architecture: floating geometric panels, vector-edged walls. Flat-shaded planes, simple ambient. |
| `00_02_20_low_poly_canyon_arena.png` | 2:20 | Low-poly canyon/arena interior. Stadium-like blocky tiers. Pure geometric abstraction, almost-no characters. |

## Design vocabulary

- **Palette**: deep saturated cyan (`#1a4d7a`-ish, with brighter `#5cb8d8` for edges), pure black background, occasional amber `#ffaa44` and red `#cc3322` for warnings/MCP. Backlit edge glow is the signature.
- **Typography**: minimal — Tron 1982 doesn't use much screen text. Where present: chunky sans-serif with bracket corners.
- **Geometry**: low-poly + flat-shaded + vector-edged on EVERY surface. The world is constructed from geometric primitives.
- **Lighting**: backlit/rim-lit characters and props; ambient is dim, edges are bright (anti-realistic for narrative immersion).
- **Iconic primitives**: icosahedron (BIT), light cycles, identity discs, glowing circuit-trace suits.

## Composability

- **Existing `circuit` theme retune** — current `circuit` is "teal-blue + orange binary on pure black" which is closer to Tron 1982 than Tron Legacy. Could be renamed/aliased to make this explicit, OR retuned to the saturated-edge-glow specifically.
- **New scene3d primitive: "wireframe_icosahedron"** — BIT-style geometric character. Different from `wireframe_sphere` (smoother) and `wireframe_cube` (boxier). Worth adding to the scene3d primitive vocabulary.
- **Low-poly architectural backgrounds** — could inform a new scene type for non-cell-content (replaces "particle_cloud" with structured-geometric ambient).

## Related to eDEX-UI

The eDEX-UI demo (refs/edex/) explicitly cites Tron Legacy as inspiration. So `tron-legacy` and `edex` refs reinforce each other; they share the cool desaturated-cyan-on-black aesthetic. Tron 1982 is its own thing.
