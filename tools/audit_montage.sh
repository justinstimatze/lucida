#!/usr/bin/env bash
# audit_montage.sh — repeatable visual-audit montage builder for lucida themes.
#
# Two modes:
#   grid     [theme1 theme2 ...]      — N×ceil(N/4) grid of theme thumbnails.
#                                       Default: all 17 themes.
#   compare  <theme> [<ref-image>]    — side-by-side: current | target.
#                                       <ref-image> can be a path or a refs-dir
#                                       name (e.g. "rocinante/roci_warship_*").
#
# Common opts:
#   --layout LAYOUT  url ?layout=LAYOUT param (default: theme default from tokens)
#   --url URL        base url (default: http://localhost:8766/)
#   --budget MS      virtual-time-budget (default: 22000 — substrate lazy-mount window)
#   --out FILE       output path (default: /tmp/lucida-audit/<mode>.png)
#   --keep-tiles     keep individual per-theme captures
#
# Examples:
#   ./tools/audit_montage.sh grid                    # full 17-theme grid
#   ./tools/audit_montage.sh grid mars-blue earth    # 2-theme strip
#   ./tools/audit_montage.sh compare mars-blue       # uses refs/rocinante/roci_warship_tactical_screen.png
#   ./tools/audit_montage.sh compare drift refs/belter/00_03_01_freenavy_tactical_creole_display.png
#
# Labeled palette swatches between current and target (preferred theme-critique format):
#   SWATCHES="#040a1f:deep_indigo_bg #1A2B49:panel_composite #4c8dc6:cobalt_accent" \
#     ./tools/audit_montage.sh compare mars-blue
#   # Format: HEX:LABEL pairs, space-separated. Use underscores in labels (no spaces).
#   # Include pre-composited end-states (e.g. "cobalt-at-0.14-over-indigo = #1A2B49")
#   # for opacity decisions so the user sees the actual result, not raw values.
#
# See memory/{all_themes_grid_demo,feedback_audit_montage_layout,theme_compare_swatch_pattern}.md.

set -euo pipefail

ALL_THEMES=(circuit conclave drift earth gastown hackers hailmary lab mainframe
            mars-blue mars-red minimal noir ops renegade terminus vigil)

# Default ref per theme — used by `compare` when no ref-image is supplied.
declare -A DEFAULT_REF=(
  [mars-blue]="refs/rocinante/roci_warship_tactical_screen.png"
  [mars-red]="refs/rocinante/roci_warship_tactical_screen.png"  # tachi refs WIP
  [earth]="refs/unn/00_03_22_un_warroom_blue_holo_table_wide.png"
  [drift]="refs/belter/00_03_01_freenavy_tactical_creole_display.png"
  [hackers]="refs/gibson/tower_glass_closeup.png"
  [conclave]="refs/conclave-nerv/magi_screens.png"
  [vigil]="refs/vigil/jarvis_callout.png"
  [ops]="refs/ops/lcars_panel_canon.png"
  [renegade]="refs/renegade/n7_rail.png"
)

# Args
URL="http://localhost:8766/"
BUDGET=22000
LAYOUT=""
OUT=""
KEEP_TILES=0

mode="${1:-}"
shift || true

remaining=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --layout) LAYOUT="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --budget) BUDGET="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --keep-tiles) KEEP_TILES=1; shift ;;
    --) shift; remaining+=("$@"); break ;;
    *) remaining+=("$1"); shift ;;
  esac
done

# Resolve repo dir BEFORE any cd so paths stay valid throughout the script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

WORKDIR="${WORKDIR:-/tmp/lucida-audit}"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

capture_theme() {
  local theme="$1"
  local outfile="tile_${theme}.png"
  local theme_url="${URL}?theme=${theme}"
  [[ -n "$LAYOUT" ]] && theme_url="${theme_url}&layout=${LAYOUT}"
  echo "  capturing $theme → $outfile" >&2
  google-chrome --headless --disable-gpu --no-sandbox \
    --window-size=1568,758 \
    --virtual-time-budget="$BUDGET" \
    --screenshot="$outfile" \
    "$theme_url" 2>/dev/null
  echo "$outfile"
}

case "$mode" in
  grid)
    themes=( "${remaining[@]}" )
    [[ ${#themes[@]} -eq 0 ]] && themes=( "${ALL_THEMES[@]}" )
    OUT="${OUT:-${WORKDIR}/grid_$(printf '%s_' "${themes[@]}")$(date +%s).png}"
    tiles=()
    for t in "${themes[@]}"; do
      tile=$(capture_theme "$t")
      tiles+=( "$tile" )
    done
    n=${#tiles[@]}
    cols=4
    [[ $n -lt 4 ]] && cols=$n
    rows=$(( (n + cols - 1) / cols ))
    montage "${tiles[@]}" \
      -tile "${cols}x${rows}" \
      -geometry 320x160+4+4 \
      -background "#040a1f" \
      -label '%t' \
      "$OUT"
    echo "$OUT"
    (( KEEP_TILES )) || rm -f "${tiles[@]}"
    ;;

  compare)
    theme="${remaining[0]:-}"
    ref="${remaining[1]:-}"
    [[ -z "$theme" ]] && { echo "usage: compare <theme> [ref] [--swatch HEX:LABEL ...]" >&2; exit 1; }
    [[ -z "$ref" ]] && ref="${DEFAULT_REF[$theme]:-}"
    [[ -z "$ref" ]] && { echo "no ref for $theme; supply one" >&2; exit 1; }
    [[ "$ref" != /* ]] && ref="${REPO}/${ref}"
    [[ ! -e "$ref" ]] && { echo "ref not found: $ref" >&2; exit 1; }

    OUT="${OUT:-${WORKDIR}/compare_${theme}_$(date +%s).png}"
    cur=$(capture_theme "$theme")
    H=600
    convert "$cur" -resize "x${H}" "_cur.png"
    convert "$ref" -resize "x${H}" "_ref.png"
    WC=$(identify -format "%w" "_cur.png")
    WR=$(identify -format "%w" "_ref.png")
    convert -size "${WC}x32" xc:"#040a1f" \
      -gravity center -fill "#bcd4e2" -pointsize 18 \
      -annotate +0+0 "CURRENT — ${theme}" _lbl_cur.png
    convert -size "${WR}x32" xc:"#040a1f" \
      -gravity center -fill "#bcd4e2" -pointsize 18 \
      -annotate +0+0 "TARGET — $(basename "$ref")" _lbl_ref.png
    convert -append _lbl_cur.png _cur.png _cur_block.png
    convert -append _lbl_ref.png _ref.png _ref_block.png

    # Optional swatches column (between current and target). Pass via
    # SWATCHES env var as a space-separated list of "HEX:LABEL" pairs:
    #   SWATCHES="#162648:cell-bg #4c8dc6:accent" ./audit_montage.sh compare mars-blue
    # Or via positional --swatch HEX:LABEL pairs (parsed from remaining[2:]).
    swatches=()
    [[ -n "${SWATCHES:-}" ]] && read -ra swatches <<< "$SWATCHES"
    for s in "${remaining[@]:2}"; do
      [[ "$s" == *:* ]] && swatches+=( "$s" )
    done

    if [[ ${#swatches[@]} -gt 0 ]]; then
      SW=240
      SWH=$(( H / ${#swatches[@]} ))
      swatch_tiles=()
      for s in "${swatches[@]}"; do
        hex="${s%%:*}"; lbl="${s#*:}"
        convert -size "${SW}x${SWH}" xc:"$hex" \
          -gravity south -fill "#bcd4e2" -pointsize 14 \
          -annotate +0+6 "$lbl  $hex" "_sw_$(echo "$hex" | tr -d '#').png"
        swatch_tiles+=( "_sw_$(echo "$hex" | tr -d '#').png" )
      done
      convert -append "${swatch_tiles[@]}" "_sw_col.png"
      convert -size "${SW}x32" xc:"#040a1f" \
        -gravity center -fill "#bcd4e2" -pointsize 18 \
        -annotate +0+0 "SWATCHES" _lbl_sw.png
      convert -append _lbl_sw.png _sw_col.png _sw_block.png
      convert +append _cur_block.png _sw_block.png _ref_block.png -background "#040a1f" "$OUT"
      (( KEEP_TILES )) || rm -f "${swatch_tiles[@]}" _sw_col.png _lbl_sw.png _sw_block.png
    else
      convert +append _cur_block.png _ref_block.png -background "#040a1f" "$OUT"
    fi
    echo "$OUT"
    (( KEEP_TILES )) || rm -f "$cur" _cur.png _ref.png _lbl_cur.png _lbl_ref.png _cur_block.png _ref_block.png
    ;;

  *)
    echo "usage: $0 {grid|compare} [args] [--layout L] [--url U] [--budget N] [--out F] [--keep-tiles]" >&2
    exit 1
    ;;
esac
