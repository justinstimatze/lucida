# tachi references — The Expanse, early/classic-MCRN (Syfy era)

Theme id: `tachi` (MCRN, early-era look). Split from `roci`: roci = late/Amazon
smooth-blue; tachi = early-Syfy hard grey + red. See memory `roci_tachi_era_split`.
CAVEAT: the tachi=grey+red / roci=blue mapping is a curatorial conceit, not literal
canon (rename was S1; palette drift was the S4 Syfy→Amazon handoff).

## Incoming frames (re-assigned from refs/rocinante, user curation 2026-06-09)

`roci_confirm_modal_chevron.png` (chevron-framed confirm modal),
`roci_keyboard_input.png`, `roci_registry_terminal_named.png` (green-phosphor
registry terminal) — user: these are actually mars-red/tachi-era surfaces.
Filenames kept for provenance.

## Sources

- `NqDcnwrsq6U` — **the Donnager (MCRN flagship), S1.** User-supplied 2026-05-29 with
  timestamps; the Donnager carries the same classic-MCRN style as the Tachi. Frames:
  refs/tachi/don_*.png (timestamp = filename seconds). PRIMARY source.
- `Jo95Y5BBHdA` @0:02–0:06 — supplement (rs_*.png). User: "mostly got this with the ring
  station attack earlier" → minor; the Donnager is the real source.

Extracted 2026-05-29 via yt-dlp (≤720p) + ffmpeg at user timestamps. Clips in
/tmp/tachi-refs/ (tmp-reaper wipes between sessions — re-fetch as needed). refs/ is
GITIGNORED (copyrighted stills stay local; grammar also lives in memory).
RE-EXTRACTED 2026-06-09 at 1080p (don_*.png now 1440x1080, was 960x720) — same
five timestamps, AV1 source `NqDcnwrsq6U` via yt-dlp bestvideo[height<=1080].

## Grammar (classic-MCRN / Donnager)

**Surface:** dark INDUSTRIAL GREY/gunmetal hull — NOT the near-black of the ship themes
and NOT roci's cool navy. Cool grey metal, low-key lighting, blue/cyan ceiling strip
lights. Architectural, gritty, less polished than late-roci's holographic blue.

**Palette (the tachi↔roci differentiator):**
- **RED is a CO-PRIMARY working color** — the concentric tactical plots are RED rings +
  RED trajectory arcs (don_85 @1:25, don_201 @3:21), not just danger markers. This is the
  opposite of roci (cyan-primary, red-as-danger-only).
- **Cyan/steel-blue secondary** — holographic orbital plots + lighting (don_149 @2:29,
  don_225 @3:45 has a glowing cyan body at a plot center).
- So tachi duotone = **RED-forward + steel-cyan secondary on grey**, vs roci's
  muted-cyan-primary + red-danger on navy.
- Approx hex to refine when building: MCRN red ~#d8362a / #e0382e; gunmetal hull
  ~#15181d / #20262e; steel-cyan ~#3e8fb0 / #4a9ec0. System triad (green ok / amber warn)
  still present as small status ticks.

**Geometry:** concentric ORBITAL/RADAR plots (the shared MCRN motif — same family as our
rocinante nav-grid), hard angular grey bezels, architectural hull framing. More contrast,
less glow than roci.

**Type:** technical — D-DIN works (it IS MCRN; same face as roci).

**Hand terminals** (don_32 @0:32) appear — faction-agnostic, IGNORE per memory
`feedback_hand_terminal_faction_agnostic`.

## Build direction (→ themes/tachi.tokens.json + .theme-tachi)

Reuse rocinante's MACHINERY (layout=cockpit, chrome=instrument, skin=mcrn, furniture =
the MCRN bezel + red histogram — already red, fits tachi perfectly). The DELTA from roci:
- bg → gunmetal grey (not navy); cells → grey hull surface.
- `--accent` → MCRN RED as primary (roci uses muted cyan); steel-cyan as secondary.
- harder bevels / more contrast / less holographic glow than roci.
- nav-grid backdrop rings → RED-forward (roci's are cyan with a red dashed orbit).
Register in BOTH index.html valid array AND THEME_REGISTRY (theme_valid_list_tripwire).
Then run the sharp-comparative Gemini critique loop vs the Donnager frames.


## User-supplied timestamps (durable)

Verbatim per-video timestamp ranges from the user. Pinned per memory `feedback-pin-timestamps-to-notes`. The video ID is the durable key.

| video ID | URL | timestamps | notes |
|---|---|---|---|
| `NqDcnwrsq6U` | https://www.youtube.com/watch?v=NqDcnwrsq6U | `0:07-0:11 (console in middle of pan), 0:32-0:33, 1:24-1:26, 1:28-1:37, 1:47, 1:59, 2:29, 3:21, 3:28-3:30, 3:45` | Donnager (MCRN flagship, S1) — PRIMARY tachi source. Extracted: don_85 @1:25 (canonical red tactical), don_149 @2:29 (cyan holo), don_201 @3:21 (red trajectory), don_209, don_225 @3:45 |
| `XIKQVow3Mmo` | https://www.youtube.com/watch?v=XIKQVow3Mmo | `0:38-0:39, 0:44-0:45 (handheld — skip), 1:47-1:55, 2:12-2:14` | Naming the Rocinante. Tachi-era UI being renamed to Roci. Frames extracted to refs/tachi/naming/. Cross-listed in refs/rocinante |
| `Jo95Y5BBHdA` | https://www.youtube.com/watch?v=Jo95Y5BBHdA | `0:02-0:06 (ring station attack — already covered earlier)` | Minor supplement; user: "actually we got most of this with the ring station attack earlier" |
