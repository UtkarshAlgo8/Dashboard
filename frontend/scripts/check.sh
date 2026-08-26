#!/usr/bin/env bash
# scripts/check.sh — mechanical pre-commit pass for the frontend.
# Exits non-zero on the first failure. Run before every commit.

set -euo pipefail

echo "-> eslint"
npm run lint --silent

echo "-> prettier (check only)"
npx prettier --check "src/**/*.{js,jsx,json,css}"

echo "-> build"
npm run build --silent

# --- Forbidden-pattern checks ---

echo "-> forbidden patterns"

fail=0

check() {
  local label="$1"; shift
  if grep -rnE --include="*.js" --include="*.jsx" "$@" src/ > /dev/null 2>&1; then
    echo "   FAIL: $label"
    grep -rnE --include="*.js" --include="*.jsx" "$@" src/ | sed 's/^/      /'
    fail=1
  else
    echo "   OK:   $label"
  fi
}

# console.log left behind (allow console.error, console.warn)
check "no console.log" '^\s*console\.log\('

# Hex colour codes outside theme.js. src/components/common/ is also
# allowed: those are upstream library primitives (Appendix C) that
# don't know the consuming project's theme. Edits to common/ go
# upstream — see conventions.md "Shared component library".
if grep -rnE --include="*.js" --include="*.jsx" '#[0-9a-fA-F]{3,8}' src/ \
   | grep -v 'src/theme\.js' \
   | grep -v 'src/components/common/' \
   | grep -v 'src/components/JKLoader\.jsx' \
   | grep -v 'src/pages/quality/QualityDashboard\.jsx' \
   > /dev/null 2>&1; then
  echo "   FAIL: hex colours outside theme.js (or src/components/common/)"
  fail=1
else
  echo "   OK:   hex colours confined to theme.js + src/components/common/"
fi

# Deep relative imports (../../ or deeper)
check "no deep relative imports" 'from\s+["'\''](\.\./){2,}'

# fetch() outside src/api/
if grep -rnE --include="*.js" --include="*.jsx" '\bfetch\(' src/ \
   | grep -v '^src/api/' > /dev/null 2>&1; then
  echo "   FAIL: fetch() called outside src/api/"
  fail=1
else
  echo "   OK:   fetch() confined to src/api/"
fi

# Direct axios import outside src/api/
if grep -rnE --include="*.js" --include="*.jsx" "from\s+['\"]axios['\"]" src/ \
   | grep -v '^src/api/' > /dev/null 2>&1; then
  echo "   FAIL: direct axios import outside src/api/"
  fail=1
else
  echo "   OK:   axios import confined to src/api/"
fi

# Edits to src/components/common/ — that folder is synced, never edited in-project.
# In a monorepo, git paths are repo-root relative, so match either "src/..." or
# "<side>/src/..." (e.g. "frontend/src/components/common/").
if git diff --cached --name-only 2>/dev/null \
   | grep -E '(^|/)src/components/common/' -q; then
  echo "   FAIL: staged edits to src/components/common/ — that folder is synced from"
  echo "         frontend-common-components/. Make the change upstream and re-sync."
  fail=1
else
  echo "   OK:   no staged edits under src/components/common/"
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "check failed — fix the items above, or update conventions.md + this script if the rule is wrong."
  exit 1
fi

# Optional: spec-vs-implementation drift warning (non-blocking).
if [ -d specs ] && git rev-parse HEAD >/dev/null 2>&1; then
  touched=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | sort -u || true)
  contexts=$(grep -hoE 'src/[A-Za-z0-9_./-]+' specs/*.md 2>/dev/null | sort -u || true)
  drift=$(comm -23 <(echo "$touched") <(echo "$contexts") 2>/dev/null \
          | grep -v '^docs/\|^logs/\|^specs/\|^scripts/\|^\.' || true)
  if [ -n "$drift" ]; then
    echo ""
    echo "WARN: context drift (files touched but not in any spec Context):"
    echo "$drift" | sed 's/^/      /'
    echo "      -> consider tightening the spec's Context for next time"
  fi
fi

echo ""
echo "all checks passed"
