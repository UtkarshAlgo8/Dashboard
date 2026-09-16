import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../config.js";
import { createStore } from "./cache-store.js";
import { materializerStats } from "./materializer.js";

/**
 * TTL cache in front of the upstream data API.
 *
 * Read-through by default: `cached()` returns a live entry and only calls the
 * loader on a miss. The backing store is pluggable (memory | redis) — see
 * cache-store.js.
 *
 * On top of that there is a WRITE-THROUGH path for the background warmer.
 * A warm cycle must not go through the normal read-through route: `cached()`
 * returns early on a live entry, so a warmer using it would only ever refresh
 * keys that had ALREADY expired — i.e. only after a user had already paid the
 * cost. `runAsRefresh()` marks the surrounding async context so `cached()`
 * skips the read and overwrites instead.
 *
 * A refresh that THROWS writes nothing, so the previous value survives. That
 * is deliberate: overwriting on error would turn one upstream hiccup into an
 * empty cache and make every user pay full price until the next cycle.
 */

const storePromise = createStore(config.cache);
const pending = new Map();

// Marks "this async context is a warm refresh, bypass the read". AsyncLocalStorage
// rather than a parameter so no controller signature has to change — the flag
// flows automatically from the warm request down into every `cached()` call the
// handler makes, including nested ones (e.g. kpi-data's baseline query).
const refreshContext = new AsyncLocalStorage();

export const CACHE_TTL = {
  KPI_ROWS: 2 * 60 * 1000,
  PRODUCT_OPTIONS: 15 * 60 * 1000,
  ANCHORS: 15 * 60 * 1000,
  AS_OF: 15 * 60 * 1000,
  STATIC_LOOKUPS: 30 * 60 * 1000,
  QUALITY_PROCESS: 5 * 60 * 1000,
  ENGINEERING_RELIABILITY: 5 * 60 * 1000,
};

const stats = {
  hits: 0,
  misses: 0,
  warmWrites: 0,
  warmFailures: 0,
  lastWarmAt: null,
  lastWarmDurationMs: null,
  lastWarmTargets: 0,
};

/** Run `fn` in write-through mode: `cached()` inside it overwrites, never reads. */
export function runAsRefresh(fn) {
  return refreshContext.run({ force: true }, fn);
}

/** True when the current async context is a warm refresh. */
export function isRefreshing() {
  return refreshContext.getStore()?.force === true;
}

export async function cacheGet(key) {
  const store = await storePromise;
  return store.get(key);
}

export async function cacheSet(key, value, ttlMs = config.cacheTtlMs) {
  const store = await storePromise;
  return store.set(key, value, ttlMs);
}

/**
 * A warmed entry outlives the gap between warm cycles.
 *
 * The normal TTLs are tuned for user traffic (KPI_ROWS is 2 minutes). Warming
 * every 10 minutes against a 2-minute TTL would leave an 8-minute hole in every
 * cycle where users still wait — the cron would look like it was working while
 * changing nothing. Warmed entries therefore get at least `warmTtlMs`, which is
 * configured to comfortably exceed the interval so a single failed cycle still
 * never exposes anyone.
 */
function effectiveTtl(ttlMs, forced) {
  const base = ttlMs ?? config.cacheTtlMs;
  return forced ? Math.max(base, config.cache.warmTtlMs) : base;
}

export async function cached(key, loader, ttlMs) {
  const forced = isRefreshing();

  if (!forced) {
    const hit = await cacheGet(key);
    if (hit !== null && hit !== undefined) {
      stats.hits++;
      return hit;
    }
    // Collapse a thundering herd onto one upstream call.
    const inflight = pending.get(key);
    if (inflight) {
      stats.hits++;
      return inflight;
    }
    stats.misses++;
  }

  const promise = loader()
    .then(async (value) => {
      await cacheSet(key, value, effectiveTtl(ttlMs, forced));
      if (forced) stats.warmWrites++;
      return value;
    })
    .catch((err) => {
      // Nothing is written, so the previous value (if any) stays live.
      if (forced) stats.warmFailures++;
      throw err;
    })
    .finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });

  pending.set(key, promise);
  return promise;
}

/**
 * Order-independent serialization.
 *
 * `JSON.stringify` preserves INSERTION order, so two requests describing the
 * same query produced different cache keys purely because the frontend built
 * the context object in a different order (e.g. `granularity` landing in a
 * different slot depending on whether it was already set). That splits one
 * logical entry across several keys — and it would silently defeat the warmer,
 * which would fill keys no request ever reads while the dashboard stayed slow.
 * Mirrors `stableStringify` in frontend/src/hooks/useDashboardFetch.js.
 */
export function stableStringify(value) {
  if (value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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
      // loss). stableStringify additionally makes key ORDER irrelevant.
      const s = v !== null && typeof v === "object" ? stableStringify(v) : String(v);
      return `${k}=${s}`;
    })
    .join("&");
  return sorted ? `${route}?${sorted}` : route;
}

/** Snapshot for GET /api/v1/admin/cache/stats. */
export async function cacheStats() {
  const store = await storePromise;
  const total = stats.hits + stats.misses;
  return {
    driver: store.name,
    degraded: store.degraded ?? false,
    entries: await store.size(),
    // In-process bytes held vs the configured ceiling. Under the redis driver
    // this still reports the memory MIRROR, which is what actually bounds RSS.
    memoryBytes: store.usedBytes?.() ?? null,
    memoryLimitBytes: config.cache.maxBytes,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: total > 0 ? Number((stats.hits / total).toFixed(4)) : null,
    inFlight: pending.size,
    warm: {
      writes: stats.warmWrites,
      failures: stats.warmFailures,
      lastRunAt: stats.lastWarmAt,
      lastRunDurationMs: stats.lastWarmDurationMs,
      lastRunTargets: stats.lastWarmTargets,
    },
    materializer: materializerStats(),
  };
}

/** Called by the warmer so /admin/cache/stats can report cycle health. */
export function recordWarmCycle({ durationMs, targets }) {
  stats.lastWarmAt = new Date().toISOString();
  stats.lastWarmDurationMs = durationMs;
  stats.lastWarmTargets = targets;
}

export async function _clear() {
  const store = await storePromise;
  await store.clear();
  pending.clear();
  stats.hits = 0;
  stats.misses = 0;
  stats.warmWrites = 0;
  stats.warmFailures = 0;
}
