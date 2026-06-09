# Gastown references — reframing away from "steampunk"

Decision 2026-05-24: "gastown isn't really exactly steampunk and there aren't a lot of good visual references." Two sources shared to triangulate what gastown actually IS:

1. **Steampunk cultural explainer** — <https://www.youtube.com/watch?v=EGgs66Q4dDs> ("What is Steampunk? Fiction to Subculture | Explained for the Curious"). User: "I think the transcript might be the most useful part." → saved as `steampunk-explainer-transcript.txt`. Useful for understanding what gastown is NOT (Victorian brass+goggles).
2. **Mad Max: Fury Road visual breakdown** — <https://www.youtube.com/watch?v=9u6DwJOs604> ("What Writers Should Learn From Mad Max: Fury Road"). Gastown (the city) is featured in Fury Road. → 5 frames extracted.

Extracted: 2026-05-24 via claude-video-vision plugin + yt-dlp captions + ffmpeg seek-to-frame.

## Why the current `gastown` theme description is wrong

Current `themes/gastown.tokens.json` describes the theme as "steampunk brass on cream serif". This is misaligned with what gastown actually evokes. The steampunk-explainer-transcript opens with:

> "steampunk: it's a genre of victorian science fantasy with coal and clockwork cravats and crinoline and of course goggles on a hat..."

That Victorian-fantasy register is NOT the gastown register. Gastown — specifically Fury Road's Gas Town, the oil-refining city — is **petromodern post-apocalyptic scrap-industrial**: chrome-painted faces, war-boys, scrap-armor, oil drums, chained vehicles, orange dust, matte black. The shared aesthetic with steampunk is "appropriate technology to that era" but the era is collapsed-future not Victorian-past.

If the lucida `gastown` theme key is intended to evoke Vancouver's Gastown neighborhood (which DOES have a steampunk-brass-Victorian aesthetic via its historical steam clock), that's a separate (legitimate) interpretation. But the verdict — "isn't really exactly steampunk" — the Fury Road Gastown reading is what we should serve.

## Frames (Fury Road)

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_36_war_boys_chrome_grey_scrap.png` | 0:36 | War boys + Immortan Joe — chrome-grey-painted humans in scrap-leather, salvaged-tire wheels behind. Texture reference for "this is what gastown is built FROM." |
| `00_01_12_furiosa_blue_fog_silhouette.png` | 1:12 | Furiosa silhouetted against blue-dusk fog atop a vehicle, arms raised holding implements. Color-grade reference for night scenes — blue-teal cool against silhouette black. |
| `00_02_24_red_rock_dust_landscape.png` | 2:24 | Red-rock canyon with dust haze. Daytime palette: rust-orange + dust-tan + distant teal sky. |
| `00_05_24_orange_firestorm_explosion.png` | 5:24 | Orange firestorm — pure saturated orange + red explosion against red-brown smoke. Catastrophe-state palette. |
| `00_06_00_george_miller_storyboards_hand.png` | 6:00 | George Miller's hand-drawn pencil storyboards — sequential frames laid out grid-style. Pencil-on-paper aesthetic. Composability note: gastown could pull from this storyboard-strip pattern for the multi-version comparison strip (task #79) chrome. |

## Design vocabulary (Fury Road Gas Town reading)

**Palette:**
- Bg: matte black (`#0a0806`) or deep rust-brown (`#2a1408`)
- Primary: chrome-silver / grey-white (`#c8c8c0` — the war-boys' painted skin tone)
- Accent warm: rust-orange (`#cc6622`) — daytime dust + flame
- Accent cool: blue-teal (`#406878`) — night fog + distant sky
- Highlight: pure white fire (`#ffeecc`) — explosions, glints
- Text fg: cream-bone (`#e8d8c0`) — never pure white, always tinged

**Typography:**
- Display: stencil-style sans-serif (Bahnschrift Condensed Bold + heavy stroke), or a distressed font that reads "spray-painted on metal"
- Body: distressed monospace (Special Elite, American Typewriter rough), reads as carbon-printed on torn paper
- Numerics: chunky LCD-style, reads as fuel-gauge

**Iconography:**
- Skull motifs (the V8 cult symbology — could become a `cell-conf-high` decoration)
- Chained / shackled iconography (cell-borders as forged chains)
- Fuel gauges + odometers — could become the gauge substrate variant
- Storyboard-strip layout (per the Miller storyboards frame) — sequential cells with hand-drawn borders for multi-version comparison

**NOT in gastown vocabulary** (corrects current "steampunk brass on cream serif"):
- Brass / polished metal
- Cream / parchment serif
- Victorian flourishes
- Cravat / crinoline / clock-face elements
- Polished wood

## Steampunk transcript context

`steampunk-explainer-transcript.txt` is the auto-captioned text from the cultural explainer. Useful excerpts for understanding the not-this-frame:

> "in 1987 author k.w. jeter writes a letter about his latest novel which happened to be a tale of foggy victorian streets clockwork automatons and secret societies... 'i think victorian fantasies are going to be the next thing as long as we can come up with a fitting collective name for authors like powers blaylock and myself something based on the appropriate technology of that era like steampunks'"

The key phrase: **"appropriate technology of that era."** Steampunk = Victorian era's "what if more steam?" Gastown = collapse-future era's "what if all you have is salvaged carburetors?" Same fictional-technology move, different era anchor.

## Retune plan for `themes/gastown.tokens.json` (next session pickup)

1. Rename concept: "steampunk brass on cream serif" → "Fury Road scrap-industrial petromodern" (or whatever short tag fits the dropdown).
2. Palette swap to the Fury Road reading above.
3. Typography swap: cream-serif → stencil-bold + distressed-mono.
4. Add `accent.firestorm` for catastrophe state (`#ff6622` saturated orange).
5. Consider new chrome flair: chain-link border on cell frame for `gastown` theme variant of `cell-conf-high`.

Estimated scope: similar to hailmary retune (~1 hour for tokens + ~2 hours for chrome flair if chain-link border lands).

## Composability

- The storyboard-strip layout from Miller's frames maps to the still-pending **task #79 (Phase 4: Multi-version comparison strip)** — gastown could be the first theme to wire that up since the visual vocabulary is native.
- The chrome-silver primary + rust-orange accent could serve a future "decay/aging" cell state — cells that haven't been touched in days could shift toward dust-rust patina.
