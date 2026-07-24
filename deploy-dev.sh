#!/usr/bin/env bash
#
# deploy-dev.sh — deploy BOTH backend and frontend in one shot.
#
# Merges the two per-side "deploy" npm scripts (backend/package.json and
# frontend/package.json) into a single command: pull the target branch ONCE,
# then rebuild + restart each Dockerized service. Mirrors the originals
# exactly (sudo docker, --restart always, same image/container names + ports)
# so it stays drop-in on the server.
#
#   Backend : jk-dashboard-backend   -> port 8814
#   Frontend: jk-dashboard-frontend  -> port 3014
#
# Usage:
#   ./deploy-dev.sh                 # pull origin/main, deploy both
#   DEPLOY_BRANCH=utkarsh/dev ./deploy-dev.sh   # deploy a different branch
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"

log() { printf '\033[1;36m[deploy-dev]\033[0m %s\n' "$*"; }

# Pull the latest source ONCE (each per-side script did this on its own).
log "Pulling origin/${BRANCH}…"
cd "$ROOT"
git pull origin "$BRANCH"

# Rebuild + restart one Dockerized service.
#   $1 = subdirectory (backend | frontend)
#   $2 = image / container name
#   $3 = published port (used for both host and container: PORT:PORT)
deploy_service() {
  local dir="$1" name="$2" port="$3"
  log "Deploying ${name} (port ${port})…"
  cd "$ROOT/$dir"

  # Stop / remove any existing container + image so the rebuild is clean.
  # Each guard is a no-op (|| true) when the container/image is absent.
  sudo docker ps    -q --filter "name=${name}" | grep -q . && sudo docker stop "${name}" || true
  sudo docker ps -a -q --filter "name=${name}" | grep -q . && sudo docker rm   "${name}" || true
  sudo docker images -q "${name}"              | grep -q . && sudo docker rmi  "${name}" || true

  sudo docker build -t "${name}" .
  sudo docker run --restart always -p "${port}:${port}" --name "${name}" -d "${name}"
  log "${name} is up."
}

deploy_service backend  jk-dashboard-backend  8814
deploy_service frontend jk-dashboard-frontend 3014

log "Both services deployed (branch: ${BRANCH})."
