import { config } from "./config.js";

/**
 * In-memory TTL cache. Frontend polls every 60s; we cache for half
 * that to keep the upstream API quiet without stale-feeling data.
 *
 * Keyed by an arbitrary string (typically `${route}|${sortedQuery}`).
 * Values can be any JSON-serialisable object.
 *
 * Not persistent. Process restart clears it. That's fine — the
 * frontend will refetch on its next poll.
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

/**
 * Wrap a loader function with the cache. If the key is hot, returns
 * the cached value. Otherwise runs the loader, caches, and returns.
 */
export async function cached(key, loader, ttlMs) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}

/** Stable cache key from a route + query object. */
export function buildCacheKey(route, query = {}) {
  const sorted = Object.keys(query)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&");
  return sorted ? `${route}?${sorted}` : route;
}

/** Exposed for debugging / tests. */
export function _clear() {
  store.clear();
}
