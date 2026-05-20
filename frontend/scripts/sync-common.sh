#!/usr/bin/env bash
# scripts/sync-common.sh — pull frontend-common-components/ into src/components/common/.
# Resolves ClaudeAutomation as a sibling of the project — no hard-coded paths.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_DIR="$(dirname "$PROJECT_ROOT")"
GRANDPARENT_DIR="$(dirname "$PARENT_DIR")"

# Look for ClaudeAutomation as a sibling of either this side (frontend/) or
# the monorepo root — whichever finds it first.
CA_DIR="${CLAUDE_AUTOMATION_DIR:-}"
if [ -z "$CA_DIR" ] && [ -d "$PARENT_DIR/ClaudeAutomation/frontend-common-components" ]; then
  CA_DIR="$PARENT_DIR/ClaudeAutomation"
fi
if [ -z "$CA_DIR" ] && [ -d "$GRANDPARENT_DIR/ClaudeAutomation/frontend-common-components" ]; then
  CA_DIR="$GRANDPARENT_DIR/ClaudeAutomation"
fi

if [ -z "$CA_DIR" ] || [ ! -d "$CA_DIR/frontend-common-components" ]; then
  echo "Could not locate ClaudeAutomation/frontend-common-components/."
  echo "Set CLAUDE_AUTOMATION_DIR=/path/to/ClaudeAutomation and re-run."
  exit 1
fi

SRC="$CA_DIR/frontend-common-components"
DEST="$PROJECT_ROOT/src/components/common"
mkdir -p "$DEST"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude=".git" --exclude="node_modules" "$SRC/" "$DEST/"
else
  rm -rf "$DEST" && mkdir -p "$DEST" && cp -R "$SRC/." "$DEST/"
fi

echo "synced from $SRC -> src/components/common/"
