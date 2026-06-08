#!/usr/bin/env bash
# ref_contact_sheet.sh — labeled thumbnail grid of reference frames for a theme.
#
# Recurring need during theme critique loops: pick canonical refs from a noisy
# refs/<theme>/ directory by squint-scanning everything at once with filenames
# visible. Output mirrors `audit_montage.sh grid` — a wide labeled montage.
#
# Usage:
#   ./tools/ref_contact_sheet.sh <theme-or-dir> [out-file]
#
# Examples:
#   ./tools/ref_contact_sheet.sh refs/belter
#   ./tools/ref_contact_sheet.sh belter             # auto-resolves to refs/belter
#   ./tools/ref_contact_sheet.sh drift              # theme name → faction dir
#   ./tools/ref_contact_sheet.sh refs/unn /tmp/sheet.png
#
# Env knobs:
#   COLS=4 TILE_W=360 TILE_H=180   # grid shape + image tile size (label adds ~40)
#   POINTSIZE=13                    # filename label size
#
# Theme→dir map (the Expanse faction split is the wrinkle):
#   mars-blue→refs/rocinante  mars-red→refs/tachi  drift→refs/belter
#   earth→refs/unn  hackers→refs/gibson  conclave→refs/conclave-nerv
#   ops→refs/ops  renegade→refs/renegade  vigil→refs/vigil
#
# Why pre-compose tiles: `magick montage -label '%f'` silently drops labels on IM7.
# Pre-rendering each tile as image+caption-strip then montaging is reliable.
#
# Companion to tools/audit_montage.sh (theme thumbnails + ref compare).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

declare -A THEME_TO_DIR=(
  [mars-blue]="refs/rocinante"
  [mars-red]="refs/tachi"
  [drift]="refs/belter"
  [earth]="refs/unn"
  [hackers]="refs/gibson"
  [conclave]="refs/conclave-nerv"
  [ops]="refs/ops"
  [renegade]="refs/renegade"
  [vigil]="refs/vigil"
  [rocinante]="refs/rocinante"
  [tachi]="refs/tachi"
  [belter]="refs/belter"
  [unn]="refs/unn"
  [gibson]="refs/gibson"
)

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <theme-or-dir> [out-file]" >&2
  exit 2
fi

ARG="$1"
OUT_ARG="${2:-}"

# Resolve to absolute directory
if [[ -d "$ARG" ]]; then
  DIR="$(cd "$ARG" && pwd)"
elif [[ -d "$REPO_ROOT/$ARG" ]]; then
  DIR="$REPO_ROOT/$ARG"
elif [[ -n "${THEME_TO_DIR[$ARG]:-}" ]]; then
  DIR="$REPO_ROOT/${THEME_TO_DIR[$ARG]}"
  [[ -d "$DIR" ]] || { echo "mapped dir does not exist: $DIR" >&2; exit 2; }
else
  echo "could not resolve '$ARG' to a refs dir" >&2
  exit 2
fi

BASENAME="$(basename "$DIR")"
TS="$(date +%s)"
mkdir -p /tmp/lucida-audit
OUT="${OUT_ARG:-/tmp/lucida-audit/refsheet_${BASENAME}_${TS}.png}"

# Gather images, sorted, excluding any working/scratch files (leading _).
mapfile -t IMAGES < <(find "$DIR" -maxdepth 1 -type f \
  \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
  ! -name '_*' -printf '%f\n' | LC_ALL=C sort)

if [[ ${#IMAGES[@]} -eq 0 ]]; then
  echo "no images found in $DIR" >&2
  exit 1
fi

N="${#IMAGES[@]}"
COLS="${COLS:-4}"
ROWS=$(( (N + COLS - 1) / COLS ))
TILE_W="${TILE_W:-360}"
TILE_H="${TILE_H:-180}"
LABEL_H="${LABEL_H:-40}"
POINTSIZE="${POINTSIZE:-13}"

echo "refs in $DIR: $N frames → ${COLS}×${ROWS} @ ${TILE_W}x${TILE_H} (+${LABEL_H} label)"

# Pre-compose each tile (image + caption strip) into a temp dir with a numeric
# prefix so the final montage stays in sorted order.
TILES="$(mktemp -d -t lucida-refsheet.XXXX)"
trap 'rm -rf "$TILES"' EXIT

for i in "${!IMAGES[@]}"; do
  f="${IMAGES[$i]}"
  name="${f%.*}"
  prefix="$(printf '%03d' "$i")"
  magick "$DIR/$f" \
    -resize "${TILE_W}x${TILE_H}^" -gravity center -extent "${TILE_W}x${TILE_H}" \
    \( -background '#0a0a0a' -fill '#cde2dc' \
       -font Helvetica -pointsize "$POINTSIZE" \
       -size "${TILE_W}x${LABEL_H}" -gravity center \
       caption:"$name" \) \
    -append \
    -bordercolor '#222' -border 1 \
    "$TILES/${prefix}_${name}.png"
done

magick montage "$TILES"/*.png \
  -tile "${COLS}x${ROWS}" -geometry '+8+8' \
  -background '#0a0a0a' \
  -fill '#cde2dc' \
  -title "$BASENAME — ${N} ref frames" \
  "$OUT"

echo "$OUT"
