#!/usr/bin/env bash
# scripts/scaffold-cr.sh — create a new change request from the template.
# Usage: bash scripts/scaffold-cr.sh invoice-edit-window

set -euo pipefail

NAME="${1:-}"
[ -n "$NAME" ] || { echo "usage: $0 <cr-name>"; exit 1; }

NEXT=$(ls specs/cr 2>/dev/null \
  | grep -E '^cr-[0-9]+-' \
  | sed -E 's/^cr-([0-9]+)-.*/\1/' \
  | sort -n | tail -1 || echo "00")
NEXT=$(printf '%02d' $((10#$NEXT + 1)))

mkdir -p specs/cr
DEST="specs/cr/cr-${NEXT}-${NAME}.md"
cp specs/_change-request-template.md "$DEST"
sed -i.bak "s/CR-NN/CR-${NEXT}/g; s/\[short name\]/${NAME}/g" "$DEST" && rm "${DEST}.bak"

echo "wrote $DEST"
