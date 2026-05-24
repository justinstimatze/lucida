# Design references for lucida visual substrates

Captured 2026-04-27. Sources reviewed in support of the FUI / mission-control aesthetic direction.

## Sources

- **pushing-pixels.org/fui/** — Kirill Grouchnikov's long-form designer interviews. Practitioner POV, tech-stack details, opinions on what works in real software vs. on screen.
- **scifiinterfaces.com** — Chris Noessel (co-author of *Make It So*). Analytic side: every interface catalogued, named, critiqued against perceptual reality.

The two are complementary: pushing-pixels tells you how it was built, scifiinterfaces tells you whether it could actually work as a tool.

## Load-bearing principles

### Coleran's pragmatic futurism
Mark Coleran (the screen-graphics designer who arguably codified the modern FUI dialect): keep one foot on the ground (familiar UX hooks the viewer parses in 21 frames), push the other slightly forward. Pure-fantasy FUI is easier to make but ages worse and doesn't cross-apply to real product. Source: <https://www.pushing-pixels.org/2021/12/21/pragmatic-futurism-and-screen-graphics-interview-with-mark-coleran.html>

His own aesthetic DNA is technical drafting / engineering drawing — large-document precision linework brought to screen. Lucida's "looks like a real readout, not generic dashboard" instinct lives here.

### The diegetic-prop trap
Coleran via Noessel: "We tend to fall in love with the aesthetic and think the good looks are what makes it work. But the work we do in film is to create a diegetic prop." Real software goes the opposite direction — less detail, simpler, focused.

Direct implication for lucida: a cell that *only* looks cool is the failure mode the kill criteria are designed to catch. Aesthetic alone is FUI's failure mode too; same trap, two contexts.

### Hero / ambient screen split
Daniel Hojlund's working principle: pick the screens that carry story beats and lavish craft on those; everything else just needs "flashing bits to show activity." Maps directly to lucida's priority-driven generation — load-bearing cells get full specialist + retrigger budget; ambient cells stay lightweight. Source: <https://www.pushing-pixels.org/2018/09/27/the-art-and-craft-of-screen-graphics-interview-with-daniel-hojlund.html>

### Noessel's four awarenesses (from *Make It So*)
For any cell that claims to be a "view," it should provide some of: sensor display, location awareness, context awareness, goal awareness. Useful as a checklist when designing new substrate types — what awareness is this cell providing that prose cannot?

## Visual conventions worth lifting

Concrete vocabulary from the Iron HUD breakdown (<https://scifiinterfaces.com/2015/07/13/iron-man-hud-just-the-functions/>):

- cyan-on-black with red as alarm
- all-caps labels, monospace + technical typography
- wireframes, schematics, reticles, biometrics
- multilayered translucent overlays
- randomized rule lines, cryptic abbreviations
- persistent peripheral gauges that escalate to center on need

The peripheral-to-center attention move (<https://scifiinterfaces.com/2015/07/21/iron-man-hud-1-person-view/>) is especially relevant — small icons bloom into hero elements when their data becomes load-bearing. Lucida's analog: a small status cell in the corpus that grows into the focused cell when a snippet hits.

## Iron Man HUD — the four-post deep dive

1. <https://scifiinterfaces.com/2015/07/01/iron-man-hud-a-breakdown/> — components/conceptual model
2. <https://scifiinterfaces.com/2015/07/13/iron-man-hud-just-the-functions/> — function catalog (the visual-vocabulary list above)
3. <https://scifiinterfaces.com/2015/07/21/iron-man-hud-1-person-view/> — first-person view + four-awarenesses framework
4. <https://scifiinterfaces.com/2015/07/29/iron-man-hud-2-person-view/> — second-person view as impossible-but-useful conceit

Top reframes for lucida from these:
- JARVIS, not Tony, is the superhero. The AI is the load-bearing element; the user is "command-and-control center." Lucida sits on the same axis: Claude is the engine, the user steers via prose.
- The 2nd-person view (geometrically impossible) is a narrative construct. Films can do this; products cannot.
- Attention management *is* crisis management when info density is high.

## Workshop-monitor patterns (Iron Man 1 — *transferable*)

Captured 2026-05-01 after a frame-by-frame pass over the Mark III workshop
scene (Iron Man 2008, design by The Front + The Orphanage — a distinct
studio from Jayse Hansen's later Mark VII suit-HUD work). The in-suit HUD
is covered in the four-post deep dive above; this section catalogs
patterns specific to *monitor-and-bench* FUI, which is closer to lucida's
actual surface than the cockpit HUD is.

Frames referenced from a 92-second clip; observations are visual-only
(steady-state motion patterns inferred from the genre, not directly
observed in stills).

### Patterns transferable to lucida

- **Variety implies intelligence.** A wide surface of viz specificity —
  many substrate types, niche customizations applied judiciously,
  particular polish moments per content shape — signals a smart
  classifier+specialist behind the system. The user's read of system
  intelligence comes partly from breadth: more cell shapes used
  appropriately = more inferred reasoning power. Counter-pressure on
  consolidation; favor adding distinct substrate types over making one
  substrate do everything.
- **Theme-specific flair.** Every theme deserves its own satisfying
  flourishes — not a shared chrome library reskinned with palette
  swaps. `vigil` wants spinning reticles and rotating loader rings;
  `terminus` wants phosphor scanlines and CRT bulge; `gastown` wants
  brass dials and serif numerals; `mainframe` wants 1994-Energy-Sea
  geometric grid pulses. Lean *into* the cosplay when a theme is
  active. The discipline is per-theme depth, not cross-theme
  consistency.
- **Holographic / volumetric depth.** Floating layered UI is *hard to
  do well* — and that fragility is part of the signal. A robust browser
  implementation (CSS perspective + translateZ layers, scene3d for true
  depth, depth-cue chrome on flat cells) registers as system intelligence
  because flat-and-easy is the default everyone else settles for. Don't
  sleep on it. Existing infrastructure: scene3d via Three.js, the 2D/3D
  mix arc.
- **Edge telemetry density.** Tony's monitors crowd corners with tiny
  gauges, sparklines, numeric readouts — the screen is never just one
  big display. Lucida cells use corner pixels for nothing. Cell-corner
  micro-meta (mint timestamp, classifier confidence, token cost, source
  line range) at 3-5px sparkline scale would honor this without changing
  layout. Pairs with Tufte's data-ink ratio.
- **Annotation overlay system.** Dot + thin-line + ALL-CAPS callouts
  pointing at 3D models (frames 0:16, 1:20). Lucida's mermaid / scene3d /
  treemap cells could surface span-or-node annotations — pointing at
  *which* part of the source snippet anchored which sub-element. Closes
  the classifier→render provenance loop visibly.
- **Wireframe→solid temporal reveal.** Frame 0:00 is a cyan wireframe
  helmet; 1:22 is fully painted and assembled. The build state itself
  is content. Cells could mint as outlined entity → geometry →
  color/labels rather than atomically. Echoes reflect.py's role at
  synthesis time, applied at cell render time.
- **Multi-version comparison strip.** Frame 1:16 shows palette variants
  side-by-side; 1:20 shows a multi-suit summary panel. Lucida overwrites
  cells on re-mint. Snapshotting prior versions as a horizontal strip
  below the cell would expose lineage as a feature — no current
  substrate offers this.
- **Real-bezel / hardware-frame chrome.** Frame 1:20 deliberately keeps
  the DELL monitor bezel visible. FUI *inside* hardware reads more
  believable than free-floating UI. LCARS already does this; could
  generalize as a per-theme "device" framing language applied to cells.
- **Selective high-saturation accent.** The hot-rod-red moment lands
  because every other shot is desaturated cyan/grey. Audit `--accent`
  usage per theme: reserved for *moments* (new mint, error, completion),
  or sprayed across all chrome? Mostly disciplined; worth periodic
  re-checks per the visual-consistency theming pass.
- **Always-running ambient motion.** Inferred (not visible in stills):
  workshop monitors never freeze. Lucida's animated_svg cells move;
  html / mermaid / vega don't. A low-amplitude ambient layer (scanline
  drift, breathing corner dot) on every cell regardless of substrate
  would kill the "frozen" feeling without becoming busy. Bounded budget
  critical.
### Cross-theme bleed to avoid

The discipline isn't avoiding Iron-Man-y elements — many of them
(reticles, loaders, holograms) are exactly the kind of theme-locked
flair lucida wants. The discipline is keeping each theme's flourishes
*to* that theme. Cross-theme bleed is the failure mode, not the
patterns themselves.

- The cyan/gold accent palette belongs to `vigil`. Don't ship it into
  `mainframe` or `gastown`.
- Stark-style spinning reticles and rotating ring loaders fit `vigil`
  well; would feel wrong in `terminus` (which wants phosphor CRT
  artifacts) or `gastown` (steam gauges + brass).
- Cosplay when a theme is *active* is a feature, not a bug — `vigil`
  should feel maximally MCU/Jarvis. The constraint is: each theme
  should feel *uniquely satisfying* in its own register, not a reskin
  of the same chrome.

### Priority for landing

If picking 1–3 to ship first: **edge telemetry** (highest leverage,
dense without layout change), **ambient motion** (cheap global feel
transformation), **multi-version strip** (unlocks lineage-as-feature,
no current substrate has it).

## Tech-stack pointers

- Working pipeline for film FUI is Photoshop + After Effects + Illustrator. The browser-rendered analog is static SVG composition + animated transforms (animated_svg specialist territory). Three.js / A-Frame are the native dynamic substrates for anything depth-based.
- Resolution shift Coleran flagged (1280×720 → 2560/3840) suggests planning density at native modern resolutions, not at HD. Lucida cells live in browser viewport, so this naturally lands.
- Hojlund's "21 frames to parse" gate maps to "look at it once during scroll, get something" — the ephemeral artifact's actual perception window.

## What's NOT translatable

- Stock-footage compositing and 3D render passes (FUI uses these heavily) are out of scope for browser-rendered cells.
- The "live alphanumeric character churn" effect is cheap on a browser substrate but feels overused — pushing-pixels designers consistently warn it reads as set-dressing.
- Most FUI is built for cinematic camera moves over the screen graphic, not for the viewer driving their own eye. Static-rendering equivalents need their own motion logic.

## Carry-forward for substrate decisions

When weighing whether a cell would benefit from animated_svg / scene3d / aframe / lottie over vega/mermaid/html, ask:
1. Is there motion or temporal change in the snippet's claim?
2. Would peripheral-to-center escalation (Noessel) clarify the cell's role?
3. Is the data load-bearing enough to justify hero-screen treatment (Hojlund)?
4. Does the resulting cell pass the diegetic-prop test — does it justify itself functionally, not just visually (Coleran)?

If yes to (1-3) and the answer to (4) is "yes, it's earning its visual weight" — lean dynamic. Otherwise, the static substrate is honest.

## Bookmarks for quick local reference

Curated entries we want to be able to look up quickly. Pushing-pixels prioritized for visual density and newer coverage; scifiinterfaces for Iron Man corpus + analytic frame. Original content lives at the URLs — we don't mirror.

### pushing-pixels.org/fui/ (designer interviews)

- **Mark Coleran** — engineering-drafting precision linework, pragmatic-futurism, diegetic-prop discipline. Source DNA of modern FUI dialect. <https://www.pushing-pixels.org/2021/12/21/pragmatic-futurism-and-screen-graphics-interview-with-mark-coleran.html>
- **Daniel Hojlund** — hero/ambient screen split, story-relevance gate, 21-frames-to-parse rule. <https://www.pushing-pixels.org/2018/09/27/the-art-and-craft-of-screen-graphics-interview-with-daniel-hojlund.html>
- **Geoff McFetridge — *Her*** — restrained palette, paper-warm typography as anti-FUI register. <https://www.pushing-pixels.org/2018/04/05/screen-graphics-of-her-interview-with-geoff-mcfetridge.html>
- **Clayton McDermott — *Black Mirror*** — concentric ring nav (eye/clock/tree-rings), environmental color saturation as dystopia signal, ZX Spectrum period fidelity. <https://www.pushing-pixels.org/2020/04/03/the-art-of-the-black-mirror-interview-with-clayton-mcdermott/>
- **John Koltai — Marvel / Spider-Man / Iron Man 2-3** — holograms detached from surfaces; per-character palettes (Lance=blue, Killian=red/black, Eyes=cyan/pink). <https://www.pushing-pixels.org/2020/03/13/the-art-and-craft-of-screen-graphics-interview-with-john-koltai/>
- **Stylow — *Ghost in the Shell*, *Ready Player One*** — retro-futurism research practice ("libraries + obscure books > Pinterest"); avoid generic corporate blue. <https://www.pushing-pixels.org/2019/04/19/the-art-and-craft-of-screen-graphics-interview-with-stylow/>
- **Henri & Grimm — *Alien: Earth*** — dual aesthetic split: 4:3 green-mono CRT with scanlines + chromatic aberration + bulge for legacy systems vs 16:9 modern layered scroll for Prodigy. <https://www.pushing-pixels.org/2025/11/01/the-art-and-craft-of-screen-graphics-interview-with-dave-henri-stefan-grimm/>
- **Danny Ho — DC TV / Yellowjackets / Monarch** — "schmience"-into-coherent-story; 4K media servers feeding inserts shot live on set. <https://www.pushing-pixels.org/2024/10/07/the-art-and-craft-of-screen-graphics-interview-with-danny-ho/>
- **Paul Taglianetti — *Demolition Man*** — era-specific CRT playback, 30fps↔24fps sync. Cited for historical context on the genre's hardware-bound roots. <https://www.pushing-pixels.org/2024/10/23/the-art-and-craft-of-screen-graphics-interview-with-paul-taglianetti/>

Index page (every interview, navigable): <https://www.pushing-pixels.org/fui/>

### scifiinterfaces.com — Iron HUD corpus

Four-post deep dive worth bookmarking:

- Components/conceptual model — <https://scifiinterfaces.com/2015/07/01/iron-man-hud-a-breakdown/>
- Function catalog (visual-vocabulary list) — <https://scifiinterfaces.com/2015/07/13/iron-man-hud-just-the-functions/>
- 1st-person view + four-awarenesses framework — <https://scifiinterfaces.com/2015/07/21/iron-man-hud-1-person-view/>
- 2nd-person view as impossible-but-useful conceit — <https://scifiinterfaces.com/2015/07/29/iron-man-hud-2-person-view/>

Site root (analytic critiques across films/TV): <https://scifiinterfaces.com>

### Adjacent reference

- Bret Victor — Worrydream essays on representation + Dynamicland practice. Conceptual foundation for "media as substrate, not page". <https://worrydream.com> · <https://dynamicland.org>
- Jayse Hansen — FUI portfolio incl. Iron Man HUDs. <https://jayse.tv>

### How to extend this list

Add only entries you've actually returned to, or that anchor a specific lucida design decision. The full per-archive scrape lives locally in `research/` (gitignored) — this section is the curated subset, not a mirror.

## Decisions anchored from these references

What's actually shipped in lucida that traces back to a specific
reference, so future redesigns know what's load-bearing vs decorative:

- **Peripheral-to-center bloom on kill rings** (Iron HUD post 2,
  function catalog) — kill-criteria gauge transitions to "tripped"
  trigger a Web Animations API bloom: clone the slot's content,
  animate from peripheral position to viewport center, hold ~2s, fade
  back. The "peripheral gauges escalate to center when their data
  becomes load-bearing" move is the single most-on-brand FUI touch
  lucida has shipped.
- **Hero / ambient auto-layout** (Hojlund's hero/ambient principle)
  — `:first-child` cell gets full-row hero treatment; older cells
  flow into a responsive ambient grid. CSS-only, no JS layout engine
  (no JS layout engine needed).
- **Reflections always full-row** (Noessel's four-awarenesses
  framework — context awareness) — a cell synthesizing other cells
  gets prominence regardless of recency position; SVG connection
  paths trace from reflection to source cells (or short directional
  stubs if sources are off-screen).
- **HTML scan line under magi** (Iron HUD post 2 — alphanumeric
  churn / live readout aesthetic) — vertical gradient sweep across
  every html cell on a slow loop. Gives static comparison tables a
  "live FUI readout" feel rather than a spreadsheet feel.
- **JARVIS-not-Tony framing** (Iron HUD posts 3-4) — lucida's
  positioning literature explicitly puts the AI as the load-bearing
  agent, the user as command-and-control. The watcher is the
  protagonist; the renderer is the bridge readout.
- **Pragmatic-futurism rejection of pure-fantasy FUI** (Coleran
  interview) — cells must justify themselves functionally
  (DIRECT/DERIVED/INVENTED audit), not just look cool. The
  substrate-hallucination kill criterion (#3) operationalizes this.

## HCI / UX principles directly informing lucida

Captured 2026-04-29 after user flagged that custom layout iteration was
reinventing window-manager patterns ("is there not a library for this
kind of thing already? or documented hci ui/ux best practices?"). These
are the load-bearing principles to consult before adding more layout /
interaction features. 

### Mark Weiser — calm computing (1991, 1996)
Calm technology engages both the center and the periphery of our
attention — Weiser & Brown's core framing. The lucida thesis. Cells in the periphery feel the way
ambient information should: present but non-demanding, escalating to
center on need. The peripheral-to-center bloom (kill rings) and the
"still warm" hero glow are direct applications. When a feature would
require the user to interrupt their primary task to consume the
visualization, it has drifted from calm-computing. Source: Weiser &
Brown, *The Coming Age of Calm Technology*.

### Edward Tufte — data-ink ratio + small multiples
*Data-ink ratio*: maximize the share of pixels carrying actual
information; minimize chrome. The auto-mode chrome-collapse (hairline
trigger / prompt summaries) is this rule applied. When deciding
whether a UI element should be permanent-visible or hover-revealed,
ask "is this element data-ink or chrome?"
*Small multiples*: the lucida cell mosaic IS small multiples. Each
cell is one panel; their arrangement carries information by proximity.
Treat layout choices through this lens — what does adjacency
communicate? Source: *The Visual Display of Quantitative Information*
(1983), *Envisioning Information* (1990).

### Gestalt principles
Auto-arrangement gets perceptual grouping for free if we respect
Gestalt rules:
- **Proximity** — same-session cells in grid mode read as a group
  because they cluster spatially.
- **Similarity** — substrate-typed cell-id border colors group cells
  of the same type without an explicit legend.
- **Common fate** — cell-fresh slide-in, breath pulse, html scan-
  line: cells that animate together feel related.
- **Figure-ground** — hero (figure) at full opacity, ambient
  (ground) slightly de-emphasized; backdrop blur in click-zoom.
When designing a new visual signal, check which Gestalt principle
makes it parse without explanation.

### Fitts's Law
Click-target time = a + b × log2(distance / size + 1). Small targets
require dwell; distant targets cost reach. Implication for lucida:
power-user controls (cell-id copy button) can be small / discoverable;
primary actions (click-to-zoom anywhere on cell body, theme switch)
should be large and forgiving. The entire cell body being a zoom
target — not a tiny icon — is correct here.

### Hick's Law
Decision time ∝ log2(n + 1). When the user has to choose among
options, keep n small or progressively disclose. The LAYOUT dropdown
shows 4 options (under Hick's threshold for snap-decision). The
substrate type isn't a user choice at all — the classifier picks.
Deliberate: lucida resists choice-overload by assigning rather than
asking.

### Nielsen 10 heuristics (the relevant ones)
- *Visibility of system state* — the HUD with status / cells / kill
  rings is the principal application. ACTIVE pulse, since-last
  counter, kill state — the user always knows what lucida is doing.
- *Recognition over recall* — LAYOUT chip names (grid / treemap /
  organic / scatter) instead of `?layout=` URL parameters. Theme
  cookie persists so the user doesn't have to remember the choice.
- *Aesthetic and minimalist design* — pairs with Tufte. The auto-mode
  hairline summaries are Nielsen #8.
- *Help users recognize, diagnose, and recover from errors* — the
  mermaid render-error fallback (cell renders the error text
  visibly, not blank) follows this.

### Noessel's four awarenesses (from *Make It So*)
Already covered above as a substrate-design checklist. Re-read
whenever proposing a new substrate: what awareness is this cell
providing that prose can't?

### When to consult these
At every architectural fork, before iterating on a custom
implementation. Pattern from the 2026-04-29 organic / scatter / treemap
arc: we built three custom layouts before checking that Tufte +
Gestalt + Hick already named what we were doing, and that Muuri /
GridStack / D3 / jsPlumb already shipped most of it. Don't repeat that.

## Information visualization principles for dense cells

Captured 2026-04-29 when working out the response to dense mermaid cells
(cell-1015 had 5 orphans + 3 multi-node clusters in one frame, rendered
too small to read). The literature offers a small set of canonical
answers, each targeting a specific failure mode. Use this as the
decision tree before adding mitigations.

### Shneiderman's Visual Information Seeking Mantra (1996)
"Overview first, zoom and filter, then details-on-demand." The most-
cited principle for designing info-rich interfaces. Maps to **overview
+ detail** patterns (minimap, sparkline-as-summary). When a lucida cell
is dense enough to need orientation, the rigorous answer is to provide
the overview alongside the detail rather than expecting the reader to
maintain mental orientation themselves. Source: Shneiderman, *The eyes
have it: A task by data type taxonomy for information visualizations*,
IEEE VL 1996. <https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf>

### Holten — hierarchical edge bundling (2006)
Treats edges between leaves of a hierarchy as B-spline curves attracted
to common ancestor paths, dramatically reducing visual clutter on
networks with many cross-connections. Peer-reviewed, well-validated for
graph readability. Specific to one failure mode (hairball graphs with
many crossings) but the gold standard within that mode. Source:
*Hierarchical Edge Bundles*, IEEE TVCG 2006. The d3-bundle and Cytoscape
plugins are mature implementations.
<https://aviz.fr/wiki/uploads/Teaching2014/bundles_infovis.pdf>

### Bederson — semantic zoom (Pad++, 1994)
Different levels-of-detail at different zoom factors: far view shows
clusters as single nodes, mid view shows nodes, close view shows labels
and edges. Foundation pattern for the lucida click-zoom dialog — when
the dialog opens, re-render at higher detail rather than just enlarging
pixels. Source: Bederson & Hollan, *Pad++: A Zooming Graphical Interface
for Exploring Alternate Interface Physics*, UIST 1994. Modern descendants:
deck.gl, OpenSeadragon, ZoomCharts.
<https://www.cs.umd.edu/~bederson/papers/uist-94-pad.pdf>

### Furnas — generalized fisheye view (1986)
Focus + context lens: the focus region renders large, surrounding
context shrinks but stays visible (no hard cutoff). Classic but
implementation-tricky — easy to make a fisheye, hard to make one that
preserves layout legibility. Lower priority for first pass at lucida.
Source: Furnas, *Generalized Fisheye Views*, CHI 1986.
<https://dl.acm.org/doi/10.1145/22627.22342>

### Shneiderman — treemaps (1991)
Canonical answer for hierarchical data: nested rectangles where size
encodes a quantitative attribute and nesting encodes hierarchy. Lucida's
mermaid + vega vocabularies miss this: file trees, cluster sizes, and
mint distributions over time read better as treemaps than as flowcharts-
with-labels. Adding `treemap` as a substrate type via vega-lite is the
cleanest path. Source: Johnson & Shneiderman, *Tree-maps: A space-filling
approach to the visualization of hierarchical information structures*,
IEEE Visualization 1991. <https://www.cs.umd.edu/~ben/papers/Johnson1991Tree.pdf>

### Tufte — small multiples (1983)
Already cross-referenced under "Edward Tufte" in the HCI section above.
Re-anchored here as the primary answer to "too much in one frame":
split into N panes, each readable, varying one parameter. For lucida,
the architectural application is splitting a multi-subgraph mermaid
spec into N cells (one per subgraph) before persistence — each cell
gets full pixels for its cluster, the dashboard layout encodes the
relationships between them. This is the most-cited info-viz principle
and the foundation move for the dense-cell problem. Source: *The Visual
Display of Quantitative Information* (1983), *Envisioning Information*
(1990).

### Decision tree by failure mode
- Too many entities for one frame → **small multiples** (Tufte). Foundation.
- Hairball / many edge crossings → **edge bundling** (Holten).
- Hierarchy too deep → **treemap** (Shneiderman 1991).
- Need orientation alongside detail → **overview + detail** (Shneiderman 1996 mantra).
- Different LODs at different zooms → **semantic zoom** (Bederson).
- Reader needs to inspect a focus region without losing context → **focus + context** (Furnas).

## Theme strategy: design tokens, one source of truth

A theme is more than a CSS palette — it has to reach every substrate
(mermaid `themeVariables`, vega `config`, scene3d / A-Frame colors,
html accents, HUD `--accent`). User flagged 2026-04-29: "things like
mermaid diagrams and plots should match the theme and its general
visual identity. like LCARS has specific fonts, spacing, colors,
conventions, etc."

**Plan (deferred until after current layout work, gate to LCARS):**
- Define `themes/<name>.tokens.json` per theme: `{ accent: { primary, warning, danger, ok }, data: { cat: [...] }, surface: { cell, body, header }, type: { title, body, mono, scale } }`.
- Compile tokens to CSS custom properties via **Style Dictionary**
  (Amazon) — the standard multi-target token tool — or a tiny inline
  loader. CSS vars feed HTML / scene3d / A-Frame / HUD / connection
  lines for free.
- Mermaid + Vega read the same token JSON at runtime to build their
  `themeVariables` / `config.range`. No hand-mapped per-substrate
  color literals in `THEME_CONFIG`; adapters consume tokens.
- Palette references for new themes:
  - **Radix Colors** — semantic 12-step scales, contrast-tested.
  - **Open-Color** — neutral product UI palette (JSON, MIT).
  - **LCARS47** + **thelcars.com** — LCARS-specific palette + assets.

## Roadmap from FUI insights (drafted 2026-05-01)

Phased plan grounded in the workshop-monitor patterns above and the
adjacent `feedback_*` memos. Order is dependency-driven (foundation
chrome before depth, depth before lineage). Long-horizon items live in
their own arc memos: `multi_stream_arc`, `audio_reactive_arc`,
`station_vr_loopback`, `multi_assistant_dashboard`,
`demo_screen_recording_arc`.

### Phase 0 — Audit (read-only)

Baseline inputs for the chrome work:
- `--accent` usage map across 11 themes; flag spray-vs-moment.
- Per-substrate motion inventory; identify frozen substrates.
- Per-theme flair gap matrix: what does each theme *uniquely* do today?

#### Phase 0 findings (2026-05-01)

**Accent audit.** All 11 themes have distinct `--accent` token values
(no palette collisions). `var(--accent)` resolves to ~50 call sites in
`notebook.css`. Categorization:
- *Moment-correct (~6 sites):* outline focus (line 32), cell-fresh
  new-mint pulse (443-450), kill/trigger states (642-648), HUD chip
  active (1217, 1325).
- *Spray (~30 sites, demote candidates):* title/header colors
  (184, 188, 541, 577, 856, 933, 945, 963), code syntax tokens
  (814, 823, 827), border-bottom (186), cell shadows (392, 396-397),
  hero shadows (404-405, 411-412), reflection borders (799, 859, 909,
  940, 947).
- *Fallback-only (OK):* cell-id substrate borders 617-627 use
  `--accent` only as fallback under `--data-cat-N`.
- *Phase 1 work:* introduce `--title-color`, `--label-muted`,
  `--syntax-keyword`, `--cell-edge` tokens, demote spray sites.

**Motion inventory.** Substantially less frozen than first thought.
- *Always-on ambient already shipping:* `html-scan` 22s linear infinite
  on every html cell; `hud-pulse` 1.6s on the HUD; per-cell entrance
  animations (`cell-arrive`, `cell-arrive-unfold`, `cell-arrive-render`,
  `cell-arrive-sweep`); `cell-still-warm-fade` 60s post-mint.
- *Hero pulse:* `hero-live-breath` / `hero-live-breath-conclave` 3.2s
  on the hero cell only.
- *Per-substrate gap (Phase 1 ambient-motion target):* mermaid, vega,
  treemap, sparkline have entrance only — no infinite ambient layer.
  animated_svg + scene3d self-animate by definition.

**Per-theme flair gap matrix.** Keyframe count per theme prefix:
- *Rich (4-5 keyframes each):* circuit (5), vigil/noir/renegade/
  mainframe (4 each).
- *Mid (3):* terminus.
- *Sparse (1, work needed):* lab, ops, conclave, magi, gastown.
- *Intentionally flat:* minimal (per CSS comment "keep minimal flat").
- *Phase 2A hero candidates:* gastown (brass dials + serif numerals
  named explicitly by user; currently sparse) and ops (LCARS — heavy
  chrome already, light on motion). Then lab and conclave/magi.

**Open infra gap (blocks Task #68):** classifier confidence is tracked
in `cells.json`; source line range / `source_line` is *not* surfaced
through the watcher pipeline. Phase 1 edge-telemetry work needs that
field added to the cell record before it can render. Audit either
extends Task #68 description or spawns a precursor task.

### Phase 1 — Edge polish foundation

Cheap, broad, foundational. Compounds everything later.
- Edge telemetry density on every cell (mint timestamp, classifier
  confidence, source line range as 3-5px sparkline-scale glyphs).
- Always-running low-amplitude ambient motion on
  html/mermaid/vega/treemap. <2% pixel-area motion budget.
- Accent moment-only enforcement (new-mint pulse, kill-state,
  completion only — no spray).

### Phase 2 — Variety arcs (parallel ribbons)

Both serve *variety implies intelligence*.

**2A. Theme-specific flair.** Per-theme flourishes that don't bleed:
vigil reticles + rotating loaders, terminus phosphor decay + CRT
bulge, gastown brass dials + serif numerals, mainframe Energy-Sea
geometric pulses, etc. 2-4 distinct moves per theme.

**2B. Substrate diversification.** Identified gaps in mermaid/html
dominance: force-directed graph, timeline ribbon, coordinate-plot
trajectory.

### Phase 3 — Depth and provenance

The ambitious aesthetic phase per `feedback_holographic_depth_yes`.
- CSS perspective + translateZ depth (theme-opt-in).
- Scene3d content richness pivot — primitive vocabulary + semantic
  geometry (per `scene3d_content_richness`).
- Annotation overlay layer — dot+line+ALL-CAPS on
  mermaid/scene3d/treemap; closes classifier→render provenance.
- Wireframe→solid temporal cell-mint reveal.

### Phase 4 — Lineage and framing

- Multi-version comparison strip — cell re-mints snapshot prior
  versions; horizontal scrubbable strip below cell.
- Real-bezel chrome generalization — per-theme `device-frame` token
  applied as cell decoration. LCARS pattern extended.

### Resolutions (2026-05-01)

1. Phase 0 audit first — yes.
2. 2B (substrate diversification) before 2A (per-theme flair).
3. Phase 3 — all four items, but stay in low-hanging-fruit register
   per item; don't yak-shave any single one.
4. Phase 2A — hero themes first (4-5 of the 11). Note to spread the
   love to remaining themes after first wave; learn as we go.


## Video reference channels

Captured 2026-05-23. Channels and individual creators whose work supplies our
per-theme visual ground truth. We pull short samples via `yt-dlp` + the
`claude-video-vision` plugin, extract frames, and back-derive token decisions.

### System47 / meWho (Rob)

Channel: <https://www.youtube.com/@system47>

The deepest single-source for thoroughly-researched FUI in 2026. Active LCARS
work via Titan.DS (their flagship), plus speculative interfaces for ships and
contexts that don't have established canon yet — notably **▵Project Hail Mary**
(<https://mewho.com/pphm>), which is the seed for our `hailmary` theme.

Key projects worth lifting from:

- **Titan.DS** — multi-module LCARS rendition (Spacedock, Warp Drive,
  Enterprise-G, Discovery NCC-1031). Best 4K loop refs for our `ops` theme:
  `9XtYJmSu5oY` Spacedock, `9nJlJQ5_o5E` Enterprise-G.
- **TURBOLIFT 1** — interactive turbolift interface (`mTew8IURfew` demo,
  `x0skXFKlDEg` 1-hour loop in "Fuel Ignition" theme variant).
- **▵Project Hail Mary** — speculative PHM ship interface
  (`9yoMXYTC9pA` 1-hour loop). Source for our `hailmary` theme tokens.
- **LCARS Asset Prep timelapse** (`gXnuG9dcpDo`) — shows the building blocks
  being designed; high-leverage for design-vocabulary extraction.

Attribution: every theme we derive from System47 work cites Rob and links the
specific video in `refs/<theme>/NOTES.md`. Currently `refs/hailmary/NOTES.md`,
`refs/ops/NOTES.md`.

Support: <https://patreon.com/mewho> / <https://ko-fi.com/system47>.

#### Full @system47 video index (snapshot 2026-05-24)

| Duration | Title | ID |
|---|---|---|
| 1:00:01 | ▵Project Hail Mary • 1-Hour Loop in 2K | `9yoMXYTC9pA` |
| 0:34 | How many turbolifts does the Enterprise-D have? / devLog • 2026-04 | `OM89kD9Dphk` |
| 3:11 | Enterprise-D LCARS Asset Prep (timelapse) / devLog • 2026-03-30 | `gXnuG9dcpDo` |
| 1:00:02 | Turbolift 1 • 1-Hour Loop in 4K "Fuel Ignition" theme | `x0skXFKlDEg` |
| 8:00:01 | Turbolift 1 • 8-Hour Loop in 4K (default theme) | `BImAWx1I-pQ` |
| 1:41 | Enterprise-D MSD Asset Prep / devLog • 2025-11-05 | `o16BhAEurBE` |
| 1:00:01 | Titan.DS: MAP • 1-Hour Loop in 4K | `3b4r_6k-SQk` |
| 4:01 | TURBOLIFT 1 • Interactive Site Demo / 2025-09 | `mTew8IURfew` |
| 2:48 | Titan.DS • new MAP Module / Quick Demo | `mvQPTSMvbIY` |
| 0:18 | Titan.DS Map Module / devLog • 2025-05-04 | `AxflA04p6XQ` |
| 4:02 | Titan.DS • Auto Mode System • 2024-03-28 | `qIkKXNCor-A` |
| 1:00:02 | Titan.DS: Warp Drive • 1-Hour Loop in 4K | `oUS5x_JJSt4` |
| 5:13 | Titan.DS • Warp Drive Module Demo • 2024-11-18 | `5q07SS3wi9E` |
| 4:02 | Titan.DS Warp Drive devLog • 2024-11 (Warp Coils & M/AM Injectors) | `eNacWdRtjgc` |
| 8:00:01 | STARFIELD 47 • 8-Hour Loop in 2K | `V1ukxamRQig` |
| 9:14 | Protostar.NX Demo • 2024-07-09 | `n8t5Ftvqh7M` |
| 3:44 | Titan.DS • U.S.S. Discovery / NCC-1031 Module Demo • 2024-05-28 | `Bn5BoDdWRVg` |
| 8:19 | APOD Stardate Demo • 2024-03-03 | `uwIH-w8usfU` |
| 1:18 | Project E.D.E. devLog • 2024-01-23 | `mYQ1ntbao6I` |
| 2:42 | Demo: simple LCARS in Figma / devLog • 2024-01-25 | `1-aLpWCZ3BE` |
| 1:00:00 | Titan.DS: Holiday Jingles + Snowflakes • 1-Hour Loop | `7h5n7IjR08M` |
| 1:36 | Titan.DS • 2023-12 Holiday Update | `9W5nojyCUHc` |
| 1:00:01 | Titan.DS: Spacedock • 1-Hour Loop in 4K | `9XtYJmSu5oY` |
| 8:17 | Titan.DS • Enterprise-G Module User Manual • 2023-10-31 | `TvBS_b8Si4s` |
| 1:00:48 | Titan.DS: Enterprise-G / NCC-1701-G • 1-Hour Loop in 4K | `9nJlJQ5_o5E` |

Re-list any time:
```
yt-dlp --flat-playlist --print "%(duration_string)s | %(title)s | %(id)s" \
  "https://www.youtube.com/@system47/videos"
```

**Per-video extraction recipe** (used for hailmary + ops):
```bash
# Sample 90s for 1-hour loop videos (they repeat — any segment is representative)
yt-dlp --download-sections "*0-90" -f 'best[ext=mp4][height<=720]' \
  -o 'sample.%(ext)s' "https://www.youtube.com/watch?v=<ID>"
# Full download for short videos (<5min)
yt-dlp -f 'best[ext=mp4][height<=720]' -o 'sample.%(ext)s' "https://..."
```
Then `video_watch fps=0.5 view_sample=10-12` via claude-video-vision to pick
best moments; `ffmpeg -y -ss MM:SS -i sample.mp4 -frames:v 1 -q:v 2 out.png`
per extracted PNG; `bmg_describe` to cross-check design vocabulary.

### General FUI survey video

- `1NMquGw21tU` — "FUI - Fictional User Interfaces" by Fabio Baccaglioni
  (5:05, 2016). Cross-film compilation: Spectre, Avengers: Age of Ultron,
  RoboCop, Captain America: Winter Soldier, Prometheus, Oblivion, Ender's
  Game, After Earth, Iron Man 3, Total Recall, The Avengers, Battleship,
  Tron. Useful as a **vocabulary survey** — patterns common across films
  that could become substrate variants or chrome flourishes. Not a
  theme-specific source.

### eDEX-UI — Tron Legacy aesthetic (GPL-3.0, visual reference only)

- Repo: <https://github.com/GitSquared/edex-ui> (archived 2021-10-18)
- Demo video: `BGeY1rK19zA` (30s, 2021 OSS Awards trailer)

**License compatibility**: eDEX-UI is **GPL-3.0** (copyleft). Lucida is
**MIT**. We cannot lift code, assets, or substantial UI patterns from
eDEX-UI without relicensing lucida to GPL-3.0 — which would force
every downstream user/contributor to comply with copyleft.

**What we CAN do**: clean-room visual reference. Ideas aren't
copyrightable, only specific code. The eDEX-UI demo video shows the
aesthetic we can mirror with independent implementation:

- Tron Legacy cyan-on-black (close to our existing `circuit` theme)
- System monitor panels: CPU/RAM/swap real-time gauges in fixed sidebar slots
- Network monitor with GeoIP visualization
- On-screen keyboard chrome (decorative)
- Tabbed terminal as central element
- File browser tracking CWD

**Composes with**: `circuit` theme retune (existing Tron-derived) OR a new
"operator-terminal" theme/layout where system-monitor cells dock around a
central focal area. Aligned with the PHM "cockpit layout" arc (task #190)
since both share the named-slots-around-a-central-hero pattern.

**Strict rule**: when working with eDEX-UI as reference, treat its demo
video and screenshots the same way we treat film stills — observe, sketch,
reimplement. Never copy CSS, JS, or asset files from the repo.

### Refs serve BOTH 2D themes AND mixed3d variants

**User 2026-05-24: "remember we'll need these visual refs not just for the 2d
themes but the mixed3d versions we can make later."**

Currently `mixed3d` = `hackers` (Gibson tower canyon). The plan is to build
per-theme mixed3d variants over time — vigil-mixed3d, conclave-mixed3d,
hailmary-mixed3d, etc. Each per-theme refs/ folder serves BOTH:

1. **2D theme retune** (pack/tactical/organic/scatter/terminal layouts) —
   palette tokens, chrome flourishes, substrate variants. Same shape as
   the hackers retune already shipped.
2. **mixed3d variant build** — scene composition (what does the 3D world
   *look* like for this theme?), camera path, decorative-tier vocabulary,
   per-theme tier-2 procedural draw rules. Same shape as the hackers
   mixed3d already shipped (tower canyon, swoopy tour, magenta floor PCB,
   etc.).

The reference frames that capture **scene-level imagery** (Iron Man workshops
with multi-panel orbital HUD, PHM ship in space against grid, NERV launch
bay, Tron Legacy server room, eDEX-UI dome of code) are direct inputs to the
3D scene composition for that theme, not just 2D card chrome.

**How to apply when working with a refs/ folder:**

- Read NOTES.md for the 2D theme retune scope (palette / typography /
  iconic primitives).
- ALSO read for the scene-level frames — those inform what to build when
  the per-theme mixed3d arc lands.
- For NEW themes being scoped: note both the 2D card vocabulary AND the
  spatial/environmental vocabulary in the same NOTES.md. Don't force a
  separate "mixed3d ref folder" — the SAME visual source informs both.

**Concrete mixed3d-implication examples** (extracted from current refs):

- `refs/vigil/00_01_25_im2_orbital_multi_panel_hud_center.png` — implies a
  vigil-mixed3d "orbital panel-cluster" arrangement (cells docked in arc
  around a central focal point), distinct from hackers' tower canyon.
- `refs/hailmary/00_00_01_ship_wireframe_wide_chrome.png` — implies a
  hailmary-mixed3d "cockpit cutaway" — central ship-hologram with
  fixed-slot side panels (left readouts, right indicators).
- `refs/conclave-nerv/00_01_06_magi_system_terminal_config.png` — implies
  a conclave-mixed3d "Magi pyramid" arrangement (three towers in
  triangular formation, vs. hackers' grid).
- `refs/tron-legacy/00_02_56_server_room_encom_cabinets.png` — implies a
  tron-legacy-mixed3d "datacenter rack walk" — cells as illuminated
  server-cabinet panels in long parallel corridors.

The mixed3d-implication line items aren't fully exhausted in each NOTES.md
yet (early NOTES were 2D-tokens-focused). When time permits, revisit each
NOTES.md with a "mixed3d implications" section noting the spatial vocabulary.
