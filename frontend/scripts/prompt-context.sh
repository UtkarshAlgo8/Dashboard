#!/usr/bin/env bash
# scripts/prompt-context.sh — emit stable project context in cache-friendly order.
# Stable content first (cacheable), nothing else.

set -euo pipefail

print_if_exists() {
  local file="$1"
  if [ -f "$file" ]; then
    echo "# === $file ==="
    cat "$file"
    echo ""
  fi
}

print_if_exists CLAUDE.md
print_if_exists AGENTS.md
print_if_exists conventions.md
print_if_exists docs/open-questions.md
