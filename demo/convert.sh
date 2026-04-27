#!/usr/bin/env bash
# convert.sh — convert a raw screen recording to assets/demo.mp4
#
# Usage:
#   bash demo/convert.sh ~/Videos/Screencast*.webm
#   bash demo/convert.sh ~/Videos/Screencast*.webm --trim 6   # drop first N seconds
#   bash demo/convert.sh ~/Videos/Screencast*.webm --width 1280

set -euo pipefail
cd "$(dirname "$0")/.."

INPUT="${1:?usage: convert.sh <input.webm> [--trim N] [--width 1280]}"
shift

TRIM=0
WIDTH=1280
OUT="assets/demo.mp4"

while [[ $# -gt 0 ]]; do
  case $1 in
    --trim)  TRIM="$2";  shift 2 ;;
    --width) WIDTH="$2"; shift 2 ;;
    --out)   OUT="$2";   shift 2 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

mkdir -p assets

DURATION=$(ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || echo "?")
echo "Input: $INPUT (${DURATION}s)"
echo "Trim:  ${TRIM}s  →  output ${WIDTH}px wide  →  ${OUT}"

SS_ARG=()
[[ "$TRIM" -gt 0 ]] && SS_ARG=(-ss "$TRIM")

ffmpeg -y -i "$INPUT" "${SS_ARG[@]}" \
  -vf "scale=${WIDTH}:-2" \
  -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -an \
  "$OUT" 2>/dev/null

echo "✓ ${OUT}  ($(du -sh "$OUT" | cut -f1))"
echo ""
echo "Next steps:"
echo "  git add ${OUT}"
echo "  git commit -m 'Update demo recording'"

paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null \
  || spd-say "done" 2>/dev/null \
  || true
