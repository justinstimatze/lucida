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
  # lucida.mjs: ~14k lines, dominated by the mixed3d block (~8.6k).
  # Tracked in task #70; remove from this list once mixed3d is extracted.
  "lucida.mjs"
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
