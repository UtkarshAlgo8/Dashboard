#!/usr/bin/env bash
# scripts/snapshot.sh — fast, mechanical project state for Claude to read
# instead of walking the repo. Run before any complex planning session.

set -euo pipefail

OUT="docs/snapshots/state-$(date -u +%Y-%m-%d).md"
mkdir -p "$(dirname "$OUT")"

{
  echo "# Project snapshot — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""

  echo "## Routes / pages"
  for d in src/pages src/routes src/app; do
    if [ -d "$d" ]; then
      find "$d" -type f \( -name '*.jsx' -o -name '*.tsx' -o -name '*.js' \) \
        2>/dev/null | sort
    fi
  done
  echo ""

  echo "## API resources"
  if [ -d src/api ]; then ls src/api/ 2>/dev/null | sort; fi
  echo ""

  echo "## Shared primitives available"
  if [ -d src/components/common ]; then
    ls src/components/common/ 2>/dev/null | sort
  fi
  echo ""

  echo "## Recent commits (10)"
  git log -10 --pretty=format:'%h %s' 2>/dev/null || echo "(no git history)"
  echo ""

  echo "## Open OQR items"
  if [ -f docs/open-questions.md ]; then
    grep -E '^\| Q[0-9]+ .*\| OPEN ' docs/open-questions.md || echo "(none open)"
  fi
} > "$OUT"

echo "wrote $OUT"
