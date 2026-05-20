#!/usr/bin/env bash
# scripts/log-history.sh — append the latest commit to logs/history.md.
# Wired via .githooks/post-commit. Idempotent — re-running just appends nothing
# new because we key on the commit hash.

set -euo pipefail

LOG="logs/history.md"
mkdir -p "$(dirname "$LOG")"
[ -f "$LOG" ] || printf '# Change log\n\nDated entries appended automatically by the post-commit hook.\n' > "$LOG"

HASH=$(git rev-parse --short HEAD)
DATE=$(git log -1 --pretty=format:'%cs')   # YYYY-MM-DD
SUBJECT=$(git log -1 --pretty=format:'%s')
AUTHOR=$(git log -1 --pretty=format:'%an')

# Skip if this hash is already logged.
if grep -q " - $HASH " "$LOG" 2>/dev/null; then
  exit 0
fi

# Group under a date header. Append a new header only if today isn't already there.
if ! grep -q "^## $DATE\$" "$LOG"; then
  printf '\n## %s\n' "$DATE" >> "$LOG"
fi

printf '  - %s — %s _(%s)_\n' "$HASH" "$SUBJECT" "$AUTHOR" >> "$LOG"
