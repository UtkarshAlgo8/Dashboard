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
#
# Usage (on the VM, from the repo root):
#   ./deploy-test.sh            # deploy both
#   ./deploy-test.sh backend    # backend only
#   ./deploy-test.sh frontend   # frontend only
#
set -euo pipefail

BRANCH="${BRANCH:-test/redis-cache}"
VM_HOST="${VM_HOST:-136.112.107.154}"

BE_PORT="${BE_PORT:-8815}"
FE_PORT="${FE_PORT:-3015}"
BE_NAME="jk-dashboard-backend-test"
FE_NAME="jk-dashboard-frontend-test"

NETWORK="jk-net"
REDIS_NAME="jk-redis"
REDIS_CONF="/opt/jk-redis/redis.conf"

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
protected-mode yes
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
    -e FRONTEND_ORIGIN="http://${VM_HOST}:${FE_PORT}" \
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
git pull origin "$BRANCH"

ensure_redis
case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
  *) echo "unknown target: $TARGET (expected: all | backend | frontend)" >&2; exit 1 ;;
esac

log "Done"
echo "  frontend : http://${VM_HOST}:${FE_PORT}"
echo "  backend  : http://${VM_HOST}:${BE_PORT}/api/v1/health"
echo
echo "Verify Redis is actually in use (not silently degraded to memory):"
echo "  curl -s localhost:${BE_PORT}/api/v1/admin/cache/stats | jq '.data | {driver, degraded, entries, memoryBytes}'"
echo "  sudo docker logs ${BE_NAME} 2>&1 | grep '\[cache\]'"
