import { logger } from "./logger.js";
/**
 * Cache storage drivers.
 *
 * The cache used to be a bare `Map` living inside cache.js. It is split out
 * here so the same read/write contract can be served by either:
 *
 *   memory — a Map in this process. Default, zero setup, dies with the process.
 *   redis  — shared and durable, so the cache SURVIVES A DEPLOY. That matters
 *            more than raw lookup speed (a Map beats Redis on one node):
 *            `npm run deploy` stops/removes/rebuilds the container, which
 *            emptied the in-process cache and made the first user after every
 *            release pay a full Athena round-trip on every panel.
 *
 * Every method is async regardless of driver, so callers never branch on which
 * one is active. That is safe because every call site already awaits `cached()`
 * — nothing in the codebase reads the cache synchronously.
 *
 * Redis is treated as an OPTIONAL accelerator, never a dependency: if it is
 * unreachable or errors mid-flight we fall back to the in-memory store and keep
 * serving. A cache outage must never become an API outage.
 */

/** Shape every driver implements. Values are stored already-serialized. */

// Fallback when a value cannot be measured (circular structure). Deliberately
// pessimistic so an unmeasurable entry still counts against the budget.
const UNKNOWN_VALUE_BYTES = 64 * 1024;

/** Approximate retained size of a cached value, for the byte budget. */
function approxSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "");
  } catch {
    return UNKNOWN_VALUE_BYTES;
  }
}

/**
 * In-process store, bounded by BYTES and swept on a timer.
 *
 * Both bounds are load-bearing. Entries used to be evicted only when a key was
 * read back after expiry, so anything written once and never re-read stayed
 * forever — and the drill key space is unbounded (every machine/date/filter
 * permutation is its own key) with payloads from 0.1 KB to ~7 MB. The result
 * was a process that grew without limit; the deployed backend was holding
 * 1.38 GB. The periodic sweep reclaims entries nobody comes back for, and the
 * byte cap is the hard ceiling when traffic outruns the sweep.
 *
 * The budget is measured in bytes rather than entries because entry counts are
 * a poor proxy here: 500 landing responses is ~140 MB, but 500 drill responses
 * is over 3 GB. Sizing happens on write, which always follows a multi-second
 * upstream call, so the stringify cost is noise.
 *
 * Eviction is LRU: `get` moves a key to the end of the Map, `set` re-inserts,
 * and eviction takes from the front. This mirrors the `allkeys-lru` policy the
 * Redis driver runs under, so both layers shed the same entries first.
 */
class MemoryStore {
  constructor({ maxBytes = 192 * 1024 * 1024, sweepIntervalMs = 60_000 } = {}) {
    this.name = "memory";
    this.map = new Map();
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.evictions = 0;
    // unref'd so the cache never keeps the process alive on its own.
    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweepTimer.unref?.();
  }

  /** Drop every expired entry. Cheap: the map is bounded by `maxBytes`. */
  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt < now) this.#remove(key, entry);
    }
  }

  #remove(key, entry) {
    this.map.delete(key);
    this.bytes -= entry.size;
  }

  /** Shed least-recently-used entries until the budget is respected. */
  #evict() {
    while (this.bytes > this.maxBytes && this.map.size > 0) {
      const [key, entry] = this.map.entries().next().value;
      this.#remove(key, entry);
      this.evictions++;
    }
  }

  async get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.#remove(key, entry);
      return null;
    }
    // Re-insert to move this key to the most-recently-used end of the Map.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  async set(key, value, ttlMs) {
    const existing = this.map.get(key);
    if (existing) this.#remove(key, existing);

    const size = approxSize(value);
    this.map.set(key, { value, size, expiresAt: Date.now() + ttlMs });
    this.bytes += size;
    this.#evict();
  }

  async del(key) {
    const entry = this.map.get(key);
    if (entry) this.#remove(key, entry);
  }

  async clear() {
    this.map.clear();
    this.bytes = 0;
  }

  async size() {
    return this.map.size;
  }

  /** Bytes currently held, for /admin/cache/stats. */
  usedBytes() {
    return this.bytes;
  }

  async close() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }
}

class RedisStore {
  /**
   * @param {import("ioredis").Redis} client
   * @param {{ keyPrefix: string, fallback: MemoryStore }} opts
   */
  constructor(client, { keyPrefix, fallback }) {
    this.name = "redis";
    this.client = client;
    this.keyPrefix = keyPrefix;
    // Every Redis failure degrades to this, so a Redis outage costs latency,
    // not availability.
    this.fallback = fallback;
    this.degraded = false;
  }

  k(key) {
    return `${this.keyPrefix}${key}`;
  }

  /** Log the first failure only — a broken Redis must not flood the log. */
  degrade(err) {
    if (!this.degraded) {
      this.degraded = true;
      logger.warn(
        `[cache] redis unavailable, falling back to memory: ${err.name}`,
      );
    }
  }

  async get(key) {
    try {
      const raw = await this.client.get(this.k(key));
      if (raw === null || raw === undefined) return null;
      this.degraded = false;
      return JSON.parse(raw);
    } catch (err) {
      this.degrade(err);
      return this.fallback.get(key);
    }
  }

  async set(key, value, ttlMs) {
    // Mirror into memory unconditionally: a later Redis failure then still has
    // something warm to serve from this process.
    await this.fallback.set(key, value, ttlMs);
    try {
      await this.client.set(
        this.k(key),
        JSON.stringify(value),
        "PX",
        Math.max(1, Math.round(ttlMs)),
      );
    } catch (err) {
      this.degrade(err);
    }
  }

  async del(key) {
    await this.fallback.del(key);
    try {
      await this.client.del(this.k(key));
    } catch (err) {
      this.degrade(err);
    }
  }

  async clear() {
    await this.fallback.clear();
    try {
      const keys = await this.client.keys(`${this.keyPrefix}*`);
      if (keys.length > 0) await this.client.del(...keys);
    } catch (err) {
      this.degrade(err);
    }
  }

  async size() {
    try {
      const keys = await this.client.keys(`${this.keyPrefix}*`);
      return keys.length;
    } catch (err) {
      this.degrade(err);
      return this.fallback.size();
    }
  }

  /** Bytes held by the in-process mirror — the bound that matters for RSS. */
  usedBytes() {
    return this.fallback.usedBytes();
  }

  async close() {
    await this.fallback.close();
    try {
      await this.client.quit();
    } catch {
      // Already gone — nothing to do.
    }
  }
}

/**
 * Build the configured store.
 *
 * Redis is loaded with a DYNAMIC import so a `memory` deployment never pays
 * for (or requires) the driver. Any failure to connect returns the memory
 * store instead of throwing — boot must not depend on Redis being up.
 *
 * @param {{ driver: string, redisUrl: string, keyPrefix: string, maxBytes?: number }} cacheConfig
 * @returns {Promise<MemoryStore | RedisStore>}
 */
export async function createStore(cacheConfig) {
  // The memory store is built either way — under `redis` it is also the
  // mirror every write lands in, so its byte budget bounds this process
  // regardless of which driver is active.
  const memory = new MemoryStore({ maxBytes: cacheConfig.maxBytes });
  if (cacheConfig.driver !== "redis") return memory;

  let client = null;
  try {
    const { default: Redis } = await import("ioredis");
    client = new Redis(cacheConfig.redisUrl, {
      // Fail fast and keep serving from memory rather than queueing commands
      // behind a dead connection — a hung cache read would stall the request.
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
    });
    // ioredis emits 'error' on every reconnect attempt; an unhandled one is a
    // process-level crash, so swallow it here (RedisStore.degrade logs).
    client.on("error", () => {});
    await client.connect();
    logger.info(`[cache] redis connected at ${cacheConfig.redisUrl}`);
    return new RedisStore(client, {
      keyPrefix: cacheConfig.keyPrefix,
      fallback: memory,
    });
  } catch (err) {
    // Tear the failed client down before walking away. ioredis retries a lost
    // connection forever, and a client left in that state holds the event loop
    // open — the process then never exits on its own. `disconnect()` (not
    // `quit()`) is right here: there is no live connection to close politely.
    client?.disconnect();
    logger.warn(
      `[cache] redis connect failed (${err.name}) — using memory store`,
    );
    return memory;
  }
}

export { MemoryStore, RedisStore };
