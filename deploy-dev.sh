#!/usr/bin/env bash
#
# Deploy the DEV stack (branch dev-quality) — Redis-backed, same shape as
# deploy-test.sh so the two are diffable line for line.
#
# The two stacks are fully independent: own ports, own container names, own
# Redis instance, own Docker network, own branch.
#
#                      dev (this script)            test (deploy-test.sh)
#   branch    dev-quality                  test/redis-cache
#   backend   8814  jk-dashboard-backend    8815  jk-dashboard-backend-test
#   frontend  3014  jk-dashboard-frontend   3015  jk-dashboard-frontend-test
#   redis     jk-redis-dev on jk-net-dev    jk-redis on jk-net
#   volume    jk-redis-dev-data             jk-redis-data
#   prefix    jkdash:dev:                   jkdash:
#
# Separate Redis containers on separate networks, so the dev backend cannot
# reach the test cache even by misconfiguration. The key prefixes differ too,
# which is what makes a stray `KEYS *` readable if they are ever pointed at
# one instance.
#
# WARNING — both scripts drive the SAME working tree and each checks out its
# own branch before building. Never run them concurrently: the second checkout
# would swap the source out from under the first one's `docker build`. Run one
# to completion, then the other. (A second clone, or a git worktree per stack,
# removes the hazard entirely if you ever want them parallel.)
#
# Usage (on the VM, from the repo root):
#   ./deploy-dev.sh            # deploy both
#   ./deploy-dev.sh backend    # backend only
#   ./deploy-dev.sh frontend   # frontend only
#
set -euo pipefail

BRANCH="${BRANCH:-dev-quality}"
VM_HOST="${VM_HOST:-136.112.107.154}"

BE_PORT="${BE_PORT:-8814}"
FE_PORT="${FE_PORT:-3014}"
BE_NAME="jk-dashboard-backend"
FE_NAME="jk-dashboard-frontend"

NETWORK="jk-net-dev"
REDIS_NAME="jk-redis-dev"
REDIS_CONF="/opt/jk-redis-dev/redis.conf"
REDIS_VOLUME="jk-redis-dev-data"
CACHE_KEY_PREFIX="jkdash:dev:"

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
  log "Redis (${REDIS_NAME})"
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
# the bridge network (172.x), causing the backend to fall back to memory.
protected-mode no
tcp-keepalive 300
timeout 0
EOF
  fi

  sudo docker volume create "$REDIS_VOLUME" >/dev/null
  # No -p: Redis is reachable only from $NETWORK, never from the host or the
  # internet. It has no password, so this isolation is the security boundary.
  sudo docker run -d \
    --name "$REDIS_NAME" \
    --network "$NETWORK" \
    --restart always \
    --memory 384m \
    -v "$REDIS_CONF":/usr/local/etc/redis/redis.conf:ro \
    -v "$REDIS_VOLUME":/data \
    redis:7-alpine redis-server /usr/local/etc/redis/redis.conf >/dev/null
  echo "$REDIS_NAME started"
}

# -------------------------------------------------------------- backend ----
# Every per-stack value is passed with -e rather than edited into
# backend/.env. dotenv does not overwrite variables already present in the
# environment, so these win over the .env baked into the image — which means
# ONE .env file serves both stacks and there is nothing to keep in sync by
# hand. (.env's REDIS_URL points at 127.0.0.1, which inside a container is the
# container itself: without the -e below the backend would quietly fall back
# to the memory store.)
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
    -e CACHE_KEY_PREFIX="$CACHE_KEY_PREFIX" \
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
git merge --ff-only "origin/$BRANCH"

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
echo
echo "Confirm the two stacks are on SEPARATE Redis instances:"
echo "  sudo docker exec ${REDIS_NAME} redis-cli dbsize   # dev  (${CACHE_KEY_PREFIX})"
echo "  sudo docker exec jk-redis      redis-cli dbsize   # test (jkdash:)"
