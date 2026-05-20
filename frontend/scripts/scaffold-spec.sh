#!/usr/bin/env bash
# scripts/scaffold-spec.sh — create a new spec from the template.
# Usage: bash scripts/scaffold-spec.sh user-profile

set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: $0 <feature-name>"
  exit 1
fi

NEXT=$(ls specs/ 2>/dev/null \
  | grep -E '^[0-9]+-' \
  | sed -E 's/^([0-9]+)-.*/\1/' \
  | sort -n | tail -1 || echo "00")
NEXT=$(printf '%02d' $((10#$NEXT + 1)))

DEST="specs/${NEXT}-${NAME}.md"
cp specs/_template.md "$DEST"
sed -i.bak "s/\[Feature Name\]/${NAME}/g" "$DEST" && rm "${DEST}.bak"

echo "wrote $DEST"
