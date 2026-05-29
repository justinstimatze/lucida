# refs/gastown/ identity mismatch — flag for resolution

Surfaced during the 2026-05-29 multi-theme fan review.

## What the THEME is

`THEME_REGISTRY.gastown.description` in index.html says:

> "steampunk brass on cream serif"

That's **Vancouver's Gastown district** — the steampunk steam-clock,
brass-on-cream typography, Victorian industrial aesthetic.

When you load `?theme=gastown` the page actually renders with this
palette: cream body, orange-brass accents.

## What the REFS are

`refs/gastown/` (this directory) contains Mad Max Fury Road stills:

- `00_00_36_war_boys_chrome_grey_scrap.png`
- `00_01_12_furiosa_blue_fog_silhouette.png`
- `00_02_24_red_rock_dust_landscape.png`
- `00_05_24_orange_firestorm_explosion.png`
- `00_06_00_george_miller_storyboards_hand.png`

That's the *Citadel / Gastown* wasteland — chrome+rust on rock — not
Vancouver-Gastown.

## Why it matters

If a future contributor opens this dir to validate the theme against
references, they'll be staring at the wrong source material.  The
rendered theme will look "wrong" against these refs even though it
matches its own intent.

## Resolution options (pick one when the gastown polish session happens)

A. **Stay Vancouver-steampunk**, remove the Mad Max refs (mv elsewhere
   or rm).  Re-shoot proper refs of steampunk / Vancouver Gastown /
   brass-and-cream Victorian industrial.

B. **Pivot to Mad Max-Gastown**, rewrite the theme tokens for chrome
   on rust + dust-orange palette + war-boys typography.  Re-author
   the THEME_REGISTRY description.

C. **Split into two themes** — `gastown` (Vancouver) and `wasteland`
   (Mad Max) — both palettes are strong enough to stand alone.

Until decided, both halves live: the theme is steampunk-Vancouver and
the refs are Mad Max wasteland.  Don't take either as authoritative
without checking the other.
