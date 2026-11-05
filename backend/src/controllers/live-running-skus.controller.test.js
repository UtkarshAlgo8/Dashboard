import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

process.env.NODE_ENV = "test";
process.env.CACHE_DRIVER = "memory";
const { router } = await import("../routes/dashboard.js");
const { errorHandler } = await import("../middlewares/errorHandler.js");
const { config } = await import("../config.js");
const { _clear, cacheSet, buildCacheKey } = await import("../utils/cache.js");
const { LIVE_RUNNING_SKU_TABLES } = await import("../queries/live-running-skus.js");
const app = express();
app.use("/api/v1/dashboard", router);
app.use(errorHandler);

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("live SKU endpoint uses Athena, ignores legacy caches and temporal filters, and hides stale SKUs", async (t) => {
  await _clear();
  await cacheSet(
    buildCacheKey("/dashboard/live-running-skus:failure", { version: 1 }),
    { message: "Legacy Databricks failure", type: "UPSTREAM_ERROR", status: 503 },
    60_000,
  );
  await cacheSet(
    buildCacheKey("/dashboard/live-running-skus", { version: 1 }),
    { machines: [{ machine_id: "legacy" }] },
    60_000,
  );
  const nativeFetch = globalThis.fetch;
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) !== config.upstream.url) return nativeFetch(url, init);
    requests.push(JSON.parse(init.body));
    return new Response(
      JSON.stringify({
        rows: [
          {
            machine_id: "0201",
            machine_status: "Running",
            live_sku: "ML405",
            live_sku_description: "Master",
            as_of: "2026-10-21 15:05:00",
          },
          {
            machine_id: "TRC",
            machine_status: "Idle",
            live_sku: "OLD-SKU",
            live_sku_description: "Old description",
            last_sku: "OLD-SKU",
          },
        ],
      }),
      { status: 200 },
    );
  });
  await withServer(async (base) => {
    const first = await nativeFetch(
      `${base}/api/v1/dashboard/live-running-skus?from=2020-01-01&to=2020-01-02&shift=A`,
    );
    assert.equal(first.status, 200);
    const { data } = await first.json();
    assert.equal(data.lookback_days, 7);
    assert.equal(data.feed_stale_min, 90);
    assert.equal(data.as_of, "2026-10-21 15:05:00");
    assert.equal(data.machines[0].live_sku, "ML405");
    assert.equal(data.machines[1].live_sku, null);
    assert.equal(data.machines[1].live_sku_description, null);
    assert.equal(data.machines[1].last_sku, "OLD-SKU");
    const second = await nativeFetch(
      `${base}/api/v1/dashboard/live-running-skus?date=2030-12-31&granularity=YEAR&shift=C`,
    );
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { data });
  });
  assert.equal(
    requests.length,
    1,
    "time/shift filters must not partition the live cache",
  );
  assert.equal(requests[0].engine, "athena");
  assert.deepEqual(requests[0].tables, []);
  for (const table of LIVE_RUNNING_SKU_TABLES) {
    assert.ok(requests[0].sql.includes(table), `Missing Athena source ${table}`);
  }
  assert.doesNotMatch(requests[0].sql, /2020-01|2030-12/);
});

test("live SKU upstream failure is an error, never a zero-machine snapshot", async (t) => {
  await _clear();
  const nativeFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) !== config.upstream.url) return nativeFetch(url, init);
    return new Response(
      JSON.stringify({ status: "ERROR", message: "Silver unavailable" }),
      { status: 503 },
    );
  });
  await withServer(async (base) => {
    const response = await nativeFetch(
      `${base}/api/v1/dashboard/live-running-skus`,
    );
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.message, "Silver unavailable");
    assert.equal(body.data, undefined);
  });
});

test("a failed live snapshot is replayed, not re-queried, while remembered", async (t) => {
  await _clear();
  const nativeFetch = globalThis.fetch;
  let upstreamCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) !== config.upstream.url) return nativeFetch(url, init);
    upstreamCalls += 1;
    return new Response(
      JSON.stringify({ status: "ERROR", message: "Service Unavailable" }),
      { status: 503 },
    );
  });
  await withServer(async (base) => {
    const url = `${base}/api/v1/dashboard/live-running-skus`;
    const first = await nativeFetch(url);
    const second = await nativeFetch(url);
    assert.equal(first.status, 503);
    assert.equal(second.status, 503);
    assert.deepEqual(await second.json(), await first.json());
  });
  assert.equal(upstreamCalls, 1, "the remembered failure must not re-hit Silver");

  // Once the failure is forgotten the next request queries Silver again.
  await _clear();
  await withServer(async (base) => {
    await nativeFetch(`${base}/api/v1/dashboard/live-running-skus`);
  });
  assert.equal(upstreamCalls, 2);
});

test("missing Athena sources remain unavailable instead of falling back or returning partial counts", async (t) => {
  await _clear();
  const nativeFetch = globalThis.fetch;
  const requests = [];
  const message = "Query FAILED: TABLE_NOT_FOUND: Table 'awsdatacatalog.silver.dim_tblitemmaster' does not exist";
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) !== config.upstream.url) return nativeFetch(url, init);
    requests.push(JSON.parse(init.body));
    return new Response(
      JSON.stringify({ status: "ERROR", type: "Exception", message }),
      { status: 502 },
    );
  });
  await withServer(async (base) => {
    const response = await nativeFetch(`${base}/api/v1/dashboard/live-running-skus`);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error.message, message);
    assert.equal(body.data, undefined);
  });
  assert.equal(requests.length, 1, "must not retry through Databricks or Bronze");
  assert.equal(requests[0].engine, "athena");
  assert.doesNotMatch(requests[0].sql, /\bbronze\./i);
});
