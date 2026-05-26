import { config } from "./config.js";

/**
 * In-memory TTL cache. Frontend polls every 60s; we cache for half
 * that to keep the upstream API quiet without stale-feeling data.
 * Process restart clears it.
 */

const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = config.cacheTtlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cached(key, loader, ttlMs) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}

export function buildCacheKey(route, query = {}) {
  const sorted = Object.keys(query)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&");
  return sorted ? `${route}?${sorted}` : route;
}

export function _clear() {
  store.clear();
}
