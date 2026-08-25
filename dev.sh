#!/usr/bin/env bash
#
# deploy.sh — local dev launcher for JK Dashboard.
# Starts the backend (node --watch) and frontend (vite) with live reload,
# then prints the frontend URL. Ctrl-C stops both.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

# Local dev ports (backend: config.js PORT default; frontend: Vite default).
BACKEND_PORT="${PORT:-3005}"
FRONTEND_PORT="${FRONTEND_PORT:-5175}"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

# Point the frontend at the LOCAL backend, not the remote server baked into
# frontend/.env (VITE_API_BASE_URL=http://35.208.174.2:8814/...). Vite gives
# a shell-provided VITE_ var priority over .env, so exporting it here wins
# without editing the committed .env. Matches backend port + /api/v1 prefix.
LOCAL_API_BASE="http://localhost:${BACKEND_PORT}/api/v1"

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }

# Install deps only when node_modules is missing.
install_if_needed() {
  local dir="$1" name="$2"
  if [ ! -d "$dir/node_modules" ]; then
    log "Installing $name dependencies…"
    (cd "$dir" && npm install)
  fi
}

install_if_needed "$BACKEND_DIR" "backend"
install_if_needed "$FRONTEND_DIR" "frontend"

PIDS=()
cleanup() {
  log "Shutting down…"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

log "Starting backend (live reload) on http://localhost:${BACKEND_PORT}"
(cd "$BACKEND_DIR" && PORT="$BACKEND_PORT" npm run dev) &
PIDS+=("$!")

log "Starting frontend (Vite HMR) on ${FRONTEND_URL} → API ${LOCAL_API_BASE}"
(cd "$FRONTEND_DIR" && VITE_API_BASE_URL="$LOCAL_API_BASE" npm run dev -- --port "$FRONTEND_PORT") &
PIDS+=("$!")

printf '\n\033[1;32m➜  Frontend:\033[0m %s\n' "$FRONTEND_URL"
printf '\033[1;32m➜  Backend :\033[0m http://localhost:%s\n' "$BACKEND_PORT"
printf '\033[1;32m➜  FE→BE   :\033[0m %s\n\n' "$LOCAL_API_BASE"
log "Press Ctrl-C to stop both."

# Keep the script alive until a child exits or the user interrupts.
wait
