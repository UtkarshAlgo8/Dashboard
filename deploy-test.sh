#!/usr/bin/env bash
#
# Deploy the TEST stack — the Redis-backed cache branch — alongside production.
#
# Nothing here touches the production containers. Test runs on its own ports,
# its own container names and its own branch, so both stacks can be compared
# side by side on the same VM:
#
#            production                test
#   backend  8814  jk-dashboard-backend       8815  jk-dashboard-backend-test
#   frontend 3014  jk-dashboard-frontend      3015  jk-dashboard-frontend-test
#   cache    in-process memory                redis (jk-redis on jk-net)
#   rca pdf  —                                jk-rca-pdf on jk-net (no host port)
#
# Usage (on the VM, from the repo root):
#   ./deploy-test.sh            # deploy both
#   ./deploy-test.sh backend    # backend only
#   ./deploy-test.sh frontend   # frontend only
#   ./deploy-test.sh rca        # RCA PDF service only
#
set -euo pipefail

BRANCH="${BRANCH:-test/redis-cache}"
# The VM these stacks run on. It is NOT cosmetic: the frontend bundle calls
# the backend at an absolute URL (nginx.conf proxies nothing), and Vite inlines
# that URL at BUILD time -- so a wrong value here ships a bundle that talks to
# the wrong machine. It is also the CORS origin the backend accepts.
VM_HOST="${VM_HOST:-136.112.107.154}"

BE_PORT="${BE_PORT:-8815}"
FE_PORT="${FE_PORT:-3015}"
BE_NAME="jk-dashboard-backend-test"
FE_NAME="jk-dashboard-frontend-test"

NETWORK="jk-net"
REDIS_NAME="jk-redis"
REDIS_CONF="/opt/jk-redis/redis.conf"
RCA_NAME="jk-rca-pdf"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# Replace a container in place. Left as separate guarded steps rather than
# `docker rm -f` so a first run (nothing to remove) is not an error.
recreate() {
  local name="$1"
  sudo docker ps -q --filter "name=^/${name}$" | grep -q . && sudo docker stop "$name" >/dev/null || true
  sudo docker ps -aq --filter "name=^/${name}$" | grep -q . && sudo docker rm "$name" >/dev/null || true
}

# ---------------------------------------------------------------- redis ----
# Created once and then left alone: Redis must OUTLIVE a deploy, which is the
# whole reason the cache moved out of process. Never torn down here.
ensure_redis() {
  log "Redis"
  sudo docker network inspect "$NETWORK" >/dev/null 2>&1 || {
    echo "creating network $NETWORK"
    sudo docker network create "$NETWORK" >/dev/null
  }

  if sudo docker ps -q --filter "name=^/${REDIS_NAME}$" | grep -q .; then
    echo "$REDIS_NAME already running — left untouched"
    return
  fi

  if [ ! -f "$REDIS_CONF" ]; then
    echo "writing $REDIS_CONF"
    sudo mkdir -p "$(dirname "$REDIS_CONF")"
    # allkeys-lru matters: on the default noeviction policy a full instance
    # returns OOM on SET, which cache-store.js swallows into one warning and
    # degrades to memory — caching would stop while looking healthy.
    sudo tee "$REDIS_CONF" >/dev/null <<'EOF'
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
appendonly no
bind 0.0.0.0
# Redis is not published to the host (`docker run` has no -p), so the Docker
# network is the security boundary. protected-mode rejects non-loopback clients
# when no password is configured, which includes backend -> redis traffic on
# jk-net (172.x), causing the backend to fall back to memory.
protected-mode no
tcp-keepalive 300
timeout 0
EOF
  fi

  sudo docker volume create jk-redis-data >/dev/null
  # No -p: Redis is reachable only from $NETWORK, never from the host or the
  # internet. It has no password, so this isolation is the security boundary.
  sudo docker run -d \
    --name "$REDIS_NAME" \
    --network "$NETWORK" \
    --restart always \
    --memory 384m \
    -v "$REDIS_CONF":/usr/local/etc/redis/redis.conf:ro \
    -v jk-redis-data:/data \
    redis:7-alpine redis-server /usr/local/etc/redis/redis.conf >/dev/null
  echo "$REDIS_NAME started"
}

# -------------------------------------------------------------- rca pdf ----
# RCA Why-Why export service (rca-service/): fills the official UTQM.00.SQ-156
# sheet and prints it to PDF with LibreOffice. Only the backend calls it, over
# $NETWORK, so it publishes no host port. Rebuilt every deploy; the LibreOffice
# layer is cached, so an unchanged service rebuilds in seconds.
deploy_rca() {
  log "RCA PDF service (${RCA_NAME})"
  cd "$REPO_ROOT/rca-service"
  recreate "$RCA_NAME"
  sudo docker build -t "$RCA_NAME" .
  sudo docker run -d \
    --name "$RCA_NAME" \
    --network "$NETWORK" \
    --restart always \
    --memory 1g \
    "$RCA_NAME" >/dev/null
  echo "started"
}

# -------------------------------------------------------------- backend ----
deploy_backend() {
  log "Backend -> :${BE_PORT} (${BE_NAME})"
  cd "$REPO_ROOT/backend"
  recreate "$BE_NAME"
  sudo docker build --build-arg PORT="$BE_PORT" -t "$BE_NAME" .
  sudo docker run -d \
    --name "$BE_NAME" \
    --network "$NETWORK" \
    --restart always \
    -p "${BE_PORT}:${BE_PORT}" \
    -e PORT="$BE_PORT" \
    -e CACHE_DRIVER=redis \
    -e REDIS_URL="redis://${REDIS_NAME}:6379" \
    -e RCA_SERVICE_URL="http://${RCA_NAME}:8010" \
    -e FRONTEND_ORIGIN="http://${VM_HOST}:${FE_PORT}" \
    -e RESET_PASSWORD_REDIRECT_URL="http://${VM_HOST}:${FE_PORT}/reset-password" \
    "$BE_NAME" >/dev/null
  echo "started"
}

# ------------------------------------------------------------- frontend ----
deploy_frontend() {
  log "Frontend -> :${FE_PORT} (${FE_NAME})"
  cd "$REPO_ROOT/frontend"
  recreate "$FE_NAME"
  # VITE_API_BASE_URL is inlined at build time, so it is a --build-arg, not -e.
  sudo docker build \
    --build-arg VITE_API_BASE_URL="http://${VM_HOST}:${BE_PORT}/api/v1" \
    --build-arg NGINX_PORT="$FE_PORT" \
    -t "$FE_NAME" .
  sudo docker run -d \
    --name "$FE_NAME" \
    --restart always \
    -p "${FE_PORT}:${FE_PORT}" \
    -e NGINX_PORT="$FE_PORT" \
    "$FE_NAME" >/dev/null
  echo "started"
}

# ------------------------------------------------------------------ run ----
log "Branch: $BRANCH"
cd "$REPO_ROOT"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"

ensure_redis
case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  rca)      deploy_rca ;;
  all)      deploy_rca; deploy_backend; deploy_frontend ;;
  *) echo "unknown target: $TARGET (expected: all | backend | frontend | rca)" >&2; exit 1 ;;
esac

log "Done"
echo "  frontend : http://${VM_HOST}:${FE_PORT}"
echo "  backend  : http://${VM_HOST}:${BE_PORT}/api/v1/health"
echo "  rca pdf  : sudo docker exec ${BE_NAME} node -e \"fetch('http://${RCA_NAME}:8010/api/rca/health').then(r => r.text()).then(console.log)\""
echo
echo "Verify Redis is actually in use (not silently degraded to memory):"
echo "  curl -s localhost:${BE_PORT}/api/v1/admin/cache/stats | jq '.data | {driver, degraded, entries, memoryBytes}'"
echo "  sudo docker logs ${BE_NAME} 2>&1 | grep '\[cache\]'"
