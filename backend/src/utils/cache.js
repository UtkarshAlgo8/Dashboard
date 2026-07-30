import { config } from "../config.js";

/**
 * In-memory TTL cache. Frontend polls every 60s; we cache for half
 * that to keep the upstream API quiet without stale-feeling data.
 * Process restart clears it.
 */

const store = new Map();
const pending = new Map();

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
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const promise = loader()
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, promise);
  return promise;
}

export function buildCacheKey(route, query = {}) {
  const sorted = Object.keys(query)
    .sort()
    .map((k) => {
      const v = query[k];
      // Object/array values (e.g. the dashboard `context`, `drillKpis`,
      // `parentFilters`) MUST be serialized — `${obj}` stringifies to
      // "[object Object]", which collapsed every section/category into one
      // cache key and served the wrong section's data (intermittent data
      // loss). JSON.stringify keeps each distinct request on its own key.
      const s =
        v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k}=${s}`;
    })
    .join("&");
  return sorted ? `${route}?${sorted}` : route;
}

export function _clear() {
  store.clear();
  pending.clear();
}
