#!/usr/bin/env bash
# Fails when a tracked .mjs/.js source file exceeds MAX_LINES. Keeps the
# per-module split discipline (task #70) by gating new growth at the
# pre-commit hook — Biome doesn't have a max-lines-per-file rule.
#
# Files in ALLOWLIST are exempt — used for blocks we know are oversized
# and have a tracked plan to split. Remove a path from ALLOWLIST once it
# drops below MAX_LINES.

set -euo pipefail

MAX_LINES=4000
ALLOWLIST=(
  # lucida.mjs: ~5.3k after mixed3d slice (was 14k). Next reductions
  # tracked in task #70 — substrate renderers + HUD code are the next
  # likely candidates. Remove once it drops below MAX_LINES.
  "lucida.mjs"
  # mixed3d.mjs: ~8.9k. Single-slice extraction landed; second-pass
  # sub-extractions (camera tour, substrate renderers, decorative
  # layer, tier management) deferred — see
  # memory/handoff_2026_06_08_mixed3d_extraction.md.
  "mixed3d.mjs"
)

is_allowlisted() {
  local path="$1"
  for ok in "${ALLOWLIST[@]}"; do
    [[ "$path" == "$ok" ]] && return 0
  done
  return 1
}

failed=0
while IFS= read -r path; do
  is_allowlisted "$path" && continue
  lines=$(wc -l < "$path")
  if (( lines > MAX_LINES )); then
    printf 'ERROR: %s has %d lines (max %d).\n' "$path" "$lines" "$MAX_LINES" >&2
    failed=1
  fi
done < <(git ls-files '*.mjs' '*.js' | grep -v '^node_modules/')

if (( failed )); then
  cat >&2 <<EOF

To allow this file deliberately, add it to ALLOWLIST in tools/check_js_file_sizes.sh
with a comment explaining the plan to split it. Otherwise, split the file into
smaller modules before committing.
EOF
  exit 1
fi
