# Design references for lucida visual substrates

Captured 2026-04-27. Sources reviewed in support of the "rich insightful dynamic visuals" / iron-man-inspired direction (per `memory/lucida_vision.md`).

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
  (per `memory/no_react_flow.md`).
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
