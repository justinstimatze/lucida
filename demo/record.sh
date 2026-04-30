#!/usr/bin/env bash
# record.sh — capture the lucida dashboard and produce assets/demo.gif
#
# Usage:
#   bash demo/record.sh                     # auto-detect display mode
#   bash demo/record.sh --duration 70       # recording length in seconds
#   bash demo/record.sh --theme conclave    # theme for the browser URL
#   bash demo/record.sh --width 1280        # output GIF width (height auto)
#   bash demo/record.sh --fps 10            # output GIF fps
#
# Prerequisites: ffmpeg, Google Chrome or Chromium
# Run replay.py in another terminal before starting:
#   python demo/replay.py --interval 6 &
#
# On Wayland (GNOME): uses org.gnome.Shell.Screencast.ScreencastArea D-Bus API.
# On X11: uses ffmpeg x11grab.
#
# Output: assets/demo.gif

set -euo pipefail
cd "$(dirname "$0")/.."

# ── defaults ──────────────────────────────────────────────────────────────────
DURATION=70
GIF_FPS=10
GIF_WIDTH=1280
THEME=conclave
SESSION_FILTER="nif-demo"
TMP_DIR=/tmp/lucida_demo
OUT_GIF="assets/demo.gif"
RENDERER_URL="http://localhost:8766/?theme=${THEME}&session=${SESSION_FILTER}"

# Pixels to crop from top/left to remove GNOME top bar and dock.
# CROP_TOP: GNOME top bar is typically 32px.
# CROP_LEFT: auto-detected from dash-to-dock icon size; override with --crop-left N.
CROP_TOP=32
CROP_LEFT=64

# Capture the full display where the browser opens.
# CAPTURE_X/Y is the top-left of the target monitor in global screen coords.
# For a single display or primary: X=0 Y=0 W=1920 H=1080.
# For a second monitor to the right at 1920+0: X=1920 Y=0 W=1920 H=1080.
CAPTURE_X=0
CAPTURE_Y=0
CAPTURE_W=1920
CAPTURE_H=1080

# ── arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --duration)   DURATION="$2"; shift 2 ;;
    --theme)      THEME="$2"; RENDERER_URL="http://localhost:8766/?theme=${THEME}&session=${SESSION_FILTER}"; shift 2 ;;
    --width)      GIF_WIDTH="$2"; shift 2 ;;
    --fps)        GIF_FPS="$2"; shift 2 ;;
    --crop-top)   CROP_TOP="$2"; shift 2 ;;
    --crop-left)  CROP_LEFT="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

# ── detect display mode ───────────────────────────────────────────────────────
ON_WAYLAND=0
GNOME_SCREENCAST=0
if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  ON_WAYLAND=1
  # Check if GNOME Screencast D-Bus service is available
  if gdbus introspect --session \
       --dest org.gnome.Shell.Screencast \
       --object-path /org/gnome/Shell/Screencast \
       2>/dev/null | grep -q "ScreencastArea"; then
    GNOME_SCREENCAST=1
  fi
fi

# ── launch browser ────────────────────────────────────────────────────────────
CHROME=""
for bin in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$bin" &>/dev/null; then
    CHROME="$bin"; break
  fi
done

CHROME_PID=""
if [[ -n "$CHROME" ]]; then
  echo "Launching browser at ${RENDERER_URL} ..."
  "$CHROME" \
    --start-maximized \
    --app="$RENDERER_URL" \
    --new-window \
    &>/dev/null &
  CHROME_PID=$!
  sleep 4
else
  echo "⚠  Chrome not found. Open manually: ${RENDERER_URL}"
fi

# ── setup ─────────────────────────────────────────────────────────────────────
mkdir -p "$TMP_DIR" assets
PALETTE="$TMP_DIR/palette.png"
RAW_MP4="$TMP_DIR/raw.mp4"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  lucida demo recording                   ║"
echo "╠══════════════════════════════════════════╣"
echo "║  mode     : $(if [[ $GNOME_SCREENCAST -eq 1 ]]; then echo "GNOME Screencast (Wayland)"; elif [[ $ON_WAYLAND -eq 1 ]]; then echo "Wayland (manual)"; else echo "x11grab"; fi)"
echo "║  region   : ${CAPTURE_W}x${CAPTURE_H}+${CAPTURE_X}+${CAPTURE_Y}"
echo "║  duration : ${DURATION}s"
echo "║  theme    : ${THEME}"
echo "║  output   : ${OUT_GIF}"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Make sure replay.py is running in another terminal:"
echo "  python demo/replay.py --interval 6"
echo ""

for i in 5 4 3 2 1; do
  echo -n "Recording in ${i}... "
  sleep 1
done
echo "GO"
echo ""

# ── capture ───────────────────────────────────────────────────────────────────
if [[ $GNOME_SCREENCAST -eq 1 ]]; then
  # Wayland GNOME: use full-screen Screencast (more reliable than ScreencastArea).
  # We crop the GNOME chrome in the ffmpeg pass below.
  WEBM_TEMPLATE="${TMP_DIR}/lucida_raw_%d"
  RESULT=$(gdbus call --session \
    --dest org.gnome.Shell.Screencast \
    --object-path /org/gnome/Shell/Screencast \
    --method org.gnome.Shell.Screencast.Screencast \
    "$WEBM_TEMPLATE" \
    '{"framerate": <uint32 12>}' 2>&1)

  # Parse filename from: (true, '/path/to/file.webm')
  WEBM_FILE=$(echo "$RESULT" | grep -oP "'/[^']+'" | tr -d "'" | head -1)
  if [[ -z "$WEBM_FILE" ]]; then
    echo "error: ScreencastArea failed — $RESULT"
    exit 1
  fi
  echo "Recording to ${WEBM_FILE} ..."

  sleep "$DURATION"

  gdbus call --session \
    --dest org.gnome.Shell.Screencast \
    --object-path /org/gnome/Shell/Screencast \
    --method org.gnome.Shell.Screencast.StopScreencast \
    2>/dev/null

  # Wait for GNOME to flush the WebM file before converting
  sleep 2

  if [[ ! -s "$WEBM_FILE" ]]; then
    echo "error: WebM file empty or missing: $WEBM_FILE"
    echo ""
    echo "── GNOME shell log (last 2 min) ──────────────────────────────"
    journalctl /usr/bin/gnome-shell --since "2 minutes ago" \
      | grep -i -E "screen|record|gst|webm" || echo "(no matching entries)"
    echo "──────────────────────────────────────────────────────────────"
    exit 1
  fi

  # Warn if file is suspiciously short (< 1s likely means GStreamer bailed early)
  WEBM_DURATION=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$WEBM_FILE" 2>/dev/null || echo 0)
  if (( $(echo "$WEBM_DURATION < 1.0" | bc -l) )); then
    echo "warning: WebM is only ${WEBM_DURATION}s — GStreamer may have bailed early"
    echo ""
    echo "── GNOME shell log (last 2 min) ──────────────────────────────"
    journalctl /usr/bin/gnome-shell --since "2 minutes ago" \
      | grep -i -E "screen|record|gst|webm" || echo "(no matching entries)"
    echo "──────────────────────────────────────────────────────────────"
    echo ""
  fi

  echo "Capture done ($(du -sh "$WEBM_FILE" | cut -f1), ${WEBM_DURATION}s). Converting WebM → GIF..."

  # Convert WebM → MP4 intermediate (palette method works on MP4)
  ffmpeg -y -i "$WEBM_FILE" -c:v libx264 -preset ultrafast -crf 18 "$RAW_MP4"
  rm -f "$WEBM_FILE"

elif [[ $ON_WAYLAND -eq 0 ]]; then
  # X11: use ffmpeg x11grab
  DISPLAY_ENV="${DISPLAY:-:0}"
  ffmpeg -y \
    -f x11grab \
    -video_size "${CAPTURE_W}x${CAPTURE_H}" \
    -framerate 12 \
    -i "${DISPLAY_ENV}.0+${CAPTURE_X},${CAPTURE_Y}" \
    -t "$DURATION" \
    -c:v libx264 -preset ultrafast -crf 18 \
    "$RAW_MP4" \
    2>/dev/null
  echo "Capture done. Converting to GIF..."

else
  echo ""
  echo "⚠  Wayland detected but GNOME Screencast D-Bus not available."
  echo "   Options:"
  echo "   1. Install wf-recorder: sudo apt install wf-recorder"
  echo "      Then record manually and convert with:"
  echo "      bash demo/convert_to_gif.sh recording.mp4"
  echo "   2. Use GNOME's built-in recorder (Ctrl+Alt+Shift+R) → ~/Videos/*.webm"
  echo "      Then convert: ffmpeg -i ~/Videos/Screencast*.webm <options> assets/demo.gif"
  echo ""
  [[ -n "$CHROME_PID" ]] && kill "$CHROME_PID" 2>/dev/null || true
  exit 1
fi

# ── gif conversion (2-pass palette) ──────────────────────────────────────────
# Crop GNOME chrome (top bar + left dock), then scale to target width.
_CT="${CROP_TOP:-0}"
_CL="${CROP_LEFT:-0}"
if [[ "$_CT" -gt 0 || "$_CL" -gt 0 ]]; then
  VF="crop=iw-${_CL}:ih-${_CT}:${_CL}:${_CT},fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos"
else
  VF="fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos"
fi

ffmpeg -y -i "$RAW_MP4" \
  -vf "${VF},palettegen=stats_mode=diff" \
  -update 1 \
  "$PALETTE"

ffmpeg -y -i "$RAW_MP4" -i "$PALETTE" \
  -lavfi "${VF}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  "$OUT_GIF"

GIF_SIZE=$(du -sh "$OUT_GIF" | cut -f1)
echo ""
echo "✓ ${OUT_GIF}  (${GIF_SIZE})"
echo ""
echo "Next steps:"
echo "  git add ${OUT_GIF}"
echo "  # Embed in README: ![lucida demo](${OUT_GIF})"
echo "  git commit -m 'Add demo GIF'"

# cleanup
rm -f "$RAW_MP4" "$PALETTE"
[[ -n "$CHROME_PID" ]] && kill "$CHROME_PID" 2>/dev/null || true

# sound notification — try freedesktop sound, fall back to speech
paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null \
  || paplay /usr/share/sounds/gnome/default/alerts/sonar.ogg 2>/dev/null \
  || spd-say "recording done" 2>/dev/null \
  || true
