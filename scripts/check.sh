#!/usr/bin/env bash
# Validates, type-checks and tests every mod under mods/ (or the ones named).
#   scripts/check.sh               # all mods
#   scripts/check.sh cache-timer   # just one
set -euo pipefail
cd "$(dirname "$0")/.."

mods=("$@")
if [ ${#mods[@]} -eq 0 ]; then
  for dir in mods/*/; do mods+=("$(basename "$dir")"); done
fi

status=0
for mod in "${mods[@]}"; do
  dir="mods/$mod"
  echo "== $mod"
  claude plugin validate "$dir" >/dev/null || { claude plugin validate "$dir"; status=1; }
  # The API types are laid by Claude Code when it loads the mod; skip tsc until then.
  if [ -f "$dir/.claude-plugin/types/tsconfig.json" ]; then
    tsc -p "$dir" || status=1
  else
    echo "   (types not laid yet: load the mod once to type-check it)"
  fi
  if compgen -G "$dir/tests/*.test.ts*" >/dev/null; then
    claude plugin test "$dir" || status=1
  fi
done
exit $status
