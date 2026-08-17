import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildCacheKey,
  stableStringify,
  cached,
  cacheGet,
  runAsRefresh,
  _clear,
} from "./cache.js";

/**
 * The frontend's own serializer, copied verbatim from
 * frontend/src/hooks/useDashboardFetch.js. The backend cache key and the
 * frontend request cache key must agree on what "the same request" means;
 * this pins that agreement so a change to one side fails here.
 */
function frontendStableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(frontendStableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${frontendStableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("buildCacheKey", () => {
  test("is independent of context property order", () => {
    // The real failure this guards: buildContext() in useDashboardFetch.js
    // inserts `granularity` in a different slot depending on whether it was
    // already set, so the same logical query produced two different keys —
    // splitting one cache entry in two and defeating the warmer.
    const a = buildCacheKey("/dashboard/kpi-data", {
      context: { section: "Mixing", category: "Productivity", granularity: "MONTH" },
      plantId: "banmore",
    });
    const b = buildCacheKey("/dashboard/kpi-data", {
      plantId: "banmore",
      context: { granularity: "MONTH", category: "Productivity", section: "Mixing" },
    });
    assert.equal(a, b);
  });

  test("is independent of order at every nesting level", () => {
    const a = buildCacheKey("/r", {
      parentFilters: { machine: "0201", inner: { b: 2, a: 1 } },
    });
    const b = buildCacheKey("/r", {
      parentFilters: { inner: { a: 1, b: 2 }, machine: "0201" },
    });
    assert.equal(a, b);
  });

  test("still separates genuinely different requests", () => {
    const mixing = buildCacheKey("/dashboard/kpi-data", {
      context: { section: "Mixing" },
    });
    const curing = buildCacheKey("/dashboard/kpi-data", {
      context: { section: "Curing" },
    });
    assert.notEqual(mixing, curing);
  });

  test("keeps array order significant", () => {
    // Arrays carry meaning in their order (drillKpis / landingKpis), so unlike
    // object keys they must NOT be normalised away.
    const a = buildCacheKey("/r", { landingKpis: ["A", "B"] });
    const b = buildCacheKey("/r", { landingKpis: ["B", "A"] });
    assert.notEqual(a, b);
  });

  test("serializes objects rather than collapsing them to [object Object]", () => {
    const key = buildCacheKey("/r", { context: { section: "Mixing" } });
    assert.ok(!key.includes("[object Object]"));
    assert.ok(key.includes("Mixing"));
  });
});

describe("stableStringify", () => {
  test("matches the frontend implementation for a realistic landing payload", () => {
    const payload = {
      plantId: "banmore",
      context: {
        section: "Mixing",
        category: "Productivity",
        granularity: "MONTH",
      },
      from: "2026-08-01",
      to: "2026-08-14",
      drillKpis: null,
      landingKpis: ["Production", "OEE"],
      parentFilters: {},
      limit: 10000,
      withBaseline: true,
    };
    assert.equal(stableStringify(payload), frontendStableStringify(payload));
  });
});

describe("cached", () => {
  beforeEach(async () => {
    await _clear();
  });

  test("calls the loader once and serves the rest from cache", async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      return { rows: calls };
    };

    assert.deepEqual(await cached("k", loader, 60_000), { rows: 1 });
    assert.deepEqual(await cached("k", loader, 60_000), { rows: 1 });
    assert.equal(calls, 1);
  });

  test("collapses concurrent misses onto one loader call", async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    };

    const [a, b] = await Promise.all([
      cached("herd", loader, 60_000),
      cached("herd", loader, 60_000),
    ]);
    assert.equal(calls, 1);
    assert.equal(a, b);
  });
});

describe("runAsRefresh (write-through warm path)", () => {
  beforeEach(async () => {
    await _clear();
  });

  test("overwrites a live entry instead of returning it", async () => {
    await cached("k", async () => "old", 60_000);
    assert.equal(await cacheGet("k"), "old");

    // The bug this prevents: a warmer built on plain `cached()` short-circuits
    // on a live entry, so it would only ever refresh keys that had ALREADY
    // expired — after a user had already paid the cost.
    const fresh = await runAsRefresh(() => cached("k", async () => "new", 60_000));

    assert.equal(fresh, "new");
    assert.equal(await cacheGet("k"), "new");
  });

  test("a failed refresh leaves the previous value intact", async () => {
    await cached("k", async () => "good", 60_000);

    await assert.rejects(
      runAsRefresh(() =>
        cached(
          "k",
          async () => {
            throw new Error("upstream exploded");
          },
          60_000,
        ),
      ),
      /upstream exploded/,
    );

    // Overwriting on failure would turn one upstream hiccup into an empty
    // cache and make every user pay full price until the next warm cycle.
    assert.equal(await cacheGet("k"), "good");
  });

  test("does not leak the refresh flag outside its own context", async () => {
    await runAsRefresh(() => cached("a", async () => 1, 60_000));

    let calls = 0;
    const loader = async () => {
      calls++;
      return "value";
    };
    await cached("b", loader, 60_000);
    await cached("b", loader, 60_000);
    assert.equal(calls, 1);
  });
});
