import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { MemoryStore, RedisStore, createStore } from "./cache-store.js";

const runNode = promisify(execFile);
const STORE_PATH = fileURLToPath(new URL("./cache-store.js", import.meta.url));
// A port nothing listens on, so the connect attempt always fails.
const DEAD_REDIS = "redis://127.0.0.1:63999";

/**
 * Stand-in for an ioredis client. `fail` flips it into "Redis is down", which
 * is the case that matters: Redis is an optional accelerator here, so every
 * failure has to degrade to the memory store rather than surface as a 5xx.
 */
function stubClient() {
  const data = new Map();
  return {
    fail: false,
    calls: [],
    data,
    async get(key) {
      if (this.fail) throw new Error("ECONNREFUSED");
      this.calls.push(["get", key]);
      return data.has(key) ? data.get(key) : null;
    },
    async set(key, value, mode, ttl) {
      if (this.fail) throw new Error("ECONNREFUSED");
      this.calls.push(["set", key, mode, ttl]);
      data.set(key, value);
    },
    async del(...keys) {
      if (this.fail) throw new Error("ECONNREFUSED");
      for (const k of keys) data.delete(k);
    },
    async keys() {
      if (this.fail) throw new Error("ECONNREFUSED");
      return [...data.keys()];
    },
    async quit() {},
  };
}

describe("MemoryStore", () => {
  test("returns a live value and drops an expired one", async () => {
    const store = new MemoryStore();
    await store.set("k", { a: 1 }, 50_000);
    assert.deepEqual(await store.get("k"), { a: 1 });

    await store.set("expired", "v", -1);
    assert.equal(await store.get("expired"), null);
    // The expired entry is evicted on read, not left to accumulate.
    assert.equal(await store.size(), 1);
    await store.close();
  });

  test("sweep reclaims expired entries nobody reads back", async () => {
    const store = new MemoryStore();
    // The leak this guards: an entry written once and never read again used
    // to stay for the life of the process, because eviction only happened on
    // a subsequent read.
    await store.set("abandoned", "x".repeat(1000), -1);
    assert.equal(await store.size(), 1);

    store.sweep();
    assert.equal(await store.size(), 0);
    assert.equal(store.usedBytes(), 0, "byte accounting must follow eviction");
    await store.close();
  });

  test("evicts least-recently-used entries once over the byte budget", async () => {
    const store = new MemoryStore({ maxBytes: 4000 });
    const payload = "x".repeat(1000);

    await store.set("a", payload, 50_000);
    await store.set("b", payload, 50_000);
    await store.set("c", payload, 50_000);

    // Touch "a" so "b" becomes the least-recently-used key.
    assert.equal(await store.get("a"), payload);

    await store.set("d", payload, 50_000);
    await store.set("e", payload, 50_000);

    assert.equal(await store.get("b"), null, "LRU victim must be gone");
    assert.equal(await store.get("a"), payload, "recently read key must survive");
    assert.ok(store.usedBytes() <= 4000, "budget must hold after eviction");
    assert.ok(store.evictions > 0);
    await store.close();
  });

  test("byte accounting does not double-count an overwritten key", async () => {
    const store = new MemoryStore();
    await store.set("k", "x".repeat(1000), 50_000);
    const first = store.usedBytes();

    await store.set("k", "x".repeat(1000), 50_000);
    assert.equal(store.usedBytes(), first, "overwrite must replace, not add");
    assert.equal(await store.size(), 1);
    await store.close();
  });

  test("del and clear reset the byte budget", async () => {
    const store = new MemoryStore();
    await store.set("a", "x".repeat(1000), 50_000);
    await store.set("b", "x".repeat(1000), 50_000);

    await store.del("a");
    assert.ok(store.usedBytes() > 0);

    await store.clear();
    assert.equal(store.usedBytes(), 0);
    assert.equal(await store.size(), 0);
    await store.close();
  });

  test("an unserializable value is still bounded", async () => {
    const store = new MemoryStore();
    const circular = { name: "loop" };
    circular.self = circular;

    // JSON.stringify throws here; the entry must still be charged to the
    // budget rather than counted as free.
    await store.set("circular", circular, 50_000);
    assert.ok(store.usedBytes() > 0);
    await store.close();
  });
});

describe("createStore", () => {
  test("falls back to memory when redis is unreachable", async () => {
    const store = await createStore({
      driver: "redis",
      redisUrl: DEAD_REDIS,
      keyPrefix: "t:",
      maxBytes: 1_000_000,
    });
    assert.equal(store.name, "memory", "a dead redis must not break boot");
    await store.close();
  });

  test("a failed redis connect does not keep the process alive", async () => {
    // The bug this guards: the catch returned the memory store but left the
    // ioredis client retrying forever. That client held the event loop open,
    // so anything importing the cache never exited on its own — test runs and
    // one-off scripts both hung indefinitely with no error to explain it.
    const script = `
      const { createStore } = await import(${JSON.stringify(STORE_PATH)});
      const store = await createStore({
        driver: "redis", redisUrl: ${JSON.stringify(DEAD_REDIS)},
        keyPrefix: "t:", maxBytes: 1000000,
      });
      console.log(store.name);
    `;
    // execFile rejects on timeout, so a hang fails this test rather than
    // stalling the suite.
    const { stdout } = await runNode(
      process.execPath,
      ["--input-type=module", "-e", script],
      { timeout: 20_000 },
    );
    assert.match(stdout, /memory/);
  });
});

describe("RedisStore", () => {
  let client;
  let store;

  beforeEach(() => {
    client = stubClient();
    store = new RedisStore(client, {
      keyPrefix: "test:",
      fallback: new MemoryStore(),
    });
  });

  test("round-trips a value through Redis with a millisecond TTL", async () => {
    await store.set("k", { rows: [1, 2] }, 25_000);
    assert.deepEqual(await store.get("k"), { rows: [1, 2] });

    const setCall = client.calls.find((c) => c[0] === "set");
    assert.equal(setCall[1], "test:k", "key must carry the configured prefix");
    assert.equal(setCall[2], "PX", "TTL must be applied in milliseconds");
    assert.equal(setCall[3], 25_000);
  });

  test("a missing key reads as null, not undefined", async () => {
    assert.equal(await store.get("nope"), null);
  });

  test("serves from the memory mirror when Redis fails mid-flight", async () => {
    await store.set("k", "value", 50_000);
    client.fail = true;

    // A Redis outage must cost latency, never availability — the value was
    // mirrored into memory on write precisely so this read still succeeds.
    assert.equal(await store.get("k"), "value");
    assert.equal(store.degraded, true);
  });

  test("a write still succeeds while Redis is down", async () => {
    client.fail = true;
    await store.set("k", "written-while-down", 50_000);
    assert.equal(await store.get("k"), "written-while-down");
  });

  test("recovers silently once Redis comes back", async () => {
    client.fail = true;
    await store.get("k");
    assert.equal(store.degraded, true);

    client.fail = false;
    await store.set("k", "back", 50_000);
    assert.equal(await store.get("k"), "back");
    assert.equal(store.degraded, false);
  });
});
