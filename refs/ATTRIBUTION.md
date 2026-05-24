# Attribution

This directory contains still frames extracted from publicly-available video sources for design-vocabulary research in support of an independent software project (lucida — MIT-licensed dashboard / FUI visualization tool). The reference frames are not original creative work of the lucida project and are used here transformatively, non-commercially, to inform our themes' visual direction.

All credit for the source material belongs to the original creators, copyright holders, and the YouTube uploaders who made the material accessible. Thank you to each of them for the work they made — without it, the visual research that shaped lucida's themes wouldn't have been possible.

## Per-folder credits

Each `refs/<theme>/NOTES.md` cites the specific YouTube URL the frames were sourced from and notes the original copyright holder where known. The table below consolidates those credits.

| Folder | Original property | Copyright holder | YouTube source (with thanks to the uploader) |
|---|---|---|---|
| `vigil/` | Iron Man (2008), Iron Man 2 (2010), Iron Man 1-3 + Avengers HUDs (2008-2019) | Marvel Studios / The Walt Disney Company | Al Bro Media · MarekSinister · TopMovieClips · BruceKenobi |
| `hailmary/` | ▵Project Hail Mary — fan-made interactive site inspired by Andy Weir's novel | System47 / meWho (Rob) — individual creator | System47 channel |
| `ops/` | LCARS visual language (Star Trek: TNG/VOY era) + Titan.DS rendition | Paramount Global (CBS Studios) for LCARS · System47/meWho (Rob) for Titan.DS | System47 channel |
| `edex/` | eDEX-UI open-source terminal | Squared (GitSquared) — GPL-3.0 licensed | Gaby (project author) |
| `tron-legacy/` | TRON: Legacy (2010) | The Walt Disney Company | Weyland (clip channel) |
| `tron-82/` | TRON (1982) | The Walt Disney Company | 8Bit · Binary Retro Clips |
| `conclave-nerv/` | Neon Genesis Evangelion (1995-96) | Studio Khara (with Gainax as original production) | Jonathan Kim (upscale) · ygbarelli (original compilation) |
| `gastown/` | Mad Max: Fury Road (2015) + cultural explainer on steampunk | Warner Bros. Pictures / Village Roadshow | Curious XP · Just Write |
| `terminus/` | Alien (1979) — MU-TH-UR 6000 interface scene | The Walt Disney Company (via 20th Century acquisition) | CineRemastered |
| `mainframe/` | ReBoot (1994) S1E1 "The Tearing" | Mainframe Entertainment (now Rainmaker) / ABC | Keep It Unreal |
| `renegade/` | Mass Effect 2 (2010) + Mass Effect 3 (2012) Normandy CIC tours | BioWare / Electronic Arts | OPMarchive · MFRvoatkar |
| `gits-1995/` | Ghost in the Shell (1995) | Production I.G / Bandai Visual / Kodansha | jackschulze |
| `gits-innocence/` | Ghost in the Shell 2: Innocence (2004) | Production I.G / Bandai Visual / Kodansha | Alex Smith |
| `gibson/` | Hackers (1995) | Metro-Goldwyn-Mayer / United Artists | (pre-existing folder; sources documented in `refs/gibson/README.md`) |

A special thank you to System47 / meWho (Rob), whose individual creative work directly seeded both the `hailmary` theme and the `ops` retune. If you appreciate this kind of independent FUI/LCARS work, please consider supporting Rob via [Patreon](https://patreon.com/mewho) or [Ko-Fi](https://ko-fi.com/system47).

## Use rationale

Lucida is a dashboard tool whose themes (`vigil`, `hailmary`, `ops`, `terminus`, etc.) deliberately evoke specific film/TV/game aesthetics as a design choice. Retuning those themes requires referring to source aesthetics during the work — palette derivation, primitive identification, chrome detail. Each `refs/<theme>/NOTES.md` records which frames informed which token / chrome decisions. This is the same workflow human designers use when consulting film stills for visual research; we've made it transparent and auditable here.

US 17 USC §107 (fair use) factors as we understand them:

1. **Purpose** — transformative: design-vocabulary derivation for an independent software project, not film distribution or reproduction.
2. **Nature** — yes, the source works are creative; this factor cuts against fair use but is one of four.
3. **Amount** — individual stills at ~1/24 to 1/30 second of source each. No single work's substantial portion is reproduced.
4. **Market effect** — design reference frames are not a substitute for watching the films / playing the games.

We are not lawyers; this isn't a legal opinion. We've tried to apply the framework in good faith.

## If you'd like material removed

If you represent a rights holder and would prefer specific frames not appear here, please contact <justin@justinstimatze.com> and we will remove them promptly. We'll honor the request without challenge.

For our own records: when a removal happens, we note the date and source in this file, prune the affected frames from `refs/<theme>/`, and update `refs/<theme>/NOTES.md` to reflect the reduced reference set. The project owner retains local-only `lucida-refs-*.tgz` backups of the original set for private archival.

## Process

When extracting new references, we use:

- `yt-dlp` to download a small section of a publicly-available YouTube video
- `ffmpeg` to extract specific frames as PNGs
- The Claude video-vision plugin (`video_watch`, `video_analyze`) to identify which timestamps to extract
- Gemini Vision (`bmg_describe`) to cross-check our reading of design vocabulary

Each step is documented in `design-references.md` § "Per-video extraction recipe."

Thank you again to every creator whose work informs this project.
