import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "test";
process.env.CACHE_DRIVER = "memory";
process.env.AWS_DATA_URL ||= "https://upstream.invalid/query";
process.env.AWS_DATA_API_KEY ||= "test";
const { router } = await import("../routes/inventory.js");
const { errorHandler } = await import("../middlewares/errorHandler.js");
const { config } = await import("../config.js");
const { _clear } = await import("../utils/cache.js");
const app = express();
app.use("/plants/:plantId/inventory", router);
app.use(errorHandler);
const nativeFetch = globalThis.fetch;

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(
      `http://127.0.0.1:${server.address().port}/plants/banmore/inventory/overage`,
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}
function upstream(t, reply) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) !== config.upstream.url) return nativeFetch(url, init);
    const body = JSON.parse(init.body);
    requests.push(body);
    return new Response(JSON.stringify(reply(body)), { status: 200 });
  });
  return requests;
}

test("summaries share one compact batch cache across sections and ignore date/shift; refresh bypasses cache", async (t) => {
  await _clear();
  const requests = upstream(t, () => ({
    rows: [
      {
        kind: "total",
        dashboard_section: "Mixing",
        unit: "KG",
        overage_qty: "123.45",
        as_of: "2026-11-11 12:00:00.123",
      },
      {
        kind: "product",
        dashboard_section: "Mixing",
        product_type: "Master Compound",
        unit: "KG",
        overage_qty: "123.45",
        as_of: "2026-11-11 12:00:00.123",
      },
      {
        kind: "product",
        dashboard_section: "Mixing",
        product_type: "Final Compound",
        unit: "",
        overage_qty: "0",
        as_of: "2026-11-11 12:00:00.123",
      },
      {
        kind: "total",
        dashboard_section: "Cutter",
        unit: "M",
        overage_qty: "10",
        as_of: "2026-11-11 12:00:00.123",
      },
    ],
  }));
  await withServer(async (base) => {
    const first = await nativeFetch(
      `${base}/summary?section=Mixing&shift=A&from=2020-01-01`,
    );
    assert.equal(first.status, 200);
    const { data } = await first.json();
    assert.equal(data.totals[0].overage_qty, 123.45);
    assert.equal(data.products[1].overage_qty, 0);
    assert.equal(data.products[1].unit, null);
    assert.equal(data.as_of, "2026-11-11T12:00:00.123+05:30");
    assert.equal(data.lookback_hours, 240);
    assert.equal(data.rows, undefined);
    assert.equal(data.skus, undefined);
    assert.equal(
      (await nativeFetch(`${base}/summary?section=Mixing&shift=C`)).status,
      200,
    );
    assert.equal(requests.length, 1);
    assert.equal(
      (await nativeFetch(`${base}/summary?section=Cutter`)).status,
      200,
    );
    assert.equal(requests.length, 1, "all area summaries share a cache");
    const batch = await (await nativeFetch(`${base}/summary`)).json();
    assert.equal(batch.data.totals.length, 2);
    assert.equal(requests.length, 1);
    assert.equal(
      (await nativeFetch(`${base}/summary?section=Mixing&refresh=1`)).status,
      200,
    );
    assert.equal(requests.length, 2);
    assert.equal(
      (await nativeFetch(`${base}/summary?section=Mixing&refresh=1`)).status,
      200,
    );
    assert.equal(requests.length, 2, "refresh guard prevents repeated scans");
    assert.doesNotMatch(requests[0].sql, /WHERE dashboard_section =/);
  });
  for (const body of requests) {
    assert.equal(body.engine, "athena");
    assert.deepEqual(body.tables, []);
  }
});

test("lazy item/barcode endpoints are bounded, safely scoped and preserve audit fields", async (t) => {
  await _clear();
  const requests = upstream(t, () => ({
    rows: Array.from({ length: 3 }, (_, i) => ({
      barcode: `B${i}`,
      product_type: "Tread",
      item_code: "A/('B')",
      unit: "NOS",
      overage_qty: "2.50",
      assumed_qty: "0",
      barcodes: "1",
      hours_over_limit: "12.3",
      qty_source: "Posted",
      quality_status: "Consumed",
      produced_at: "2026-11-01 06:30:00.000",
      production_date: "2026-10-31",
      shift: "C",
    })),
  }));
  await withServer(async (base) => {
    const items = await nativeFetch(`${base}/items?section=Extruder&limit=2`);
    assert.equal(items.status, 200);
    const { data } = await items.json();
    assert.equal(data.rows.length, 2);
    assert.equal(data.lookback_hours, 240);
    assert.equal(data.has_more, true);
    assert.equal(data.rows[0].overage_qty, 2.5);
    assert.equal(data.rows[0].quality_status, "Consumed");
    assert.equal(data.rows[0].produced_at, "2026-11-01T06:30:00.000+05:30");
    const params = new URLSearchParams({
      section: "Extruder",
      product_type: "Tread",
      item_code: "A/('B')",
      unit: "NOS",
      limit: "2",
      offset: "2",
    });
    const response = await nativeFetch(`${base}/barcodes?${params}`);
    assert.equal(response.status, 200);
    const barcodePage = (await response.json()).data;
    assert.equal(barcodePage.offset, 2);
    assert.equal(barcodePage.lookback_hours, 240);
    assert.match(requests[1].sql, /A\/\(''B''\)/);
    assert.match(requests[1].sql, /AND unit = 'NOS'/);
    assert.match(requests[1].sql, /OFFSET 2 ROWS LIMIT 3/);
  });
  assert.equal(requests.length, 2);
  for (const request of requests)
    assert.match(request.sql, /INTERVAL '240' HOUR/);
});

test("invalid scopes and pages are rejected before contacting Athena", async (t) => {
  await _clear();
  const requests = upstream(t, () => ({ rows: [] }));
  await withServer(async (base) => {
    for (const suffix of [
      "/summary?section=Unknown",
      "/summary?section=Bead",
      "/summary?section=Green+Tyre",
      "/items?section=Mixing&product_type=Tread",
      "/items?section=Mixing&limit=201",
      "/items?section=Mixing&offset=-1",
      "/items?section=Mixing&section=Cutter",
      "/barcodes?section=Mixing&product_type=Master+Compound",
      "/summary?section=Mixing&refresh=bad",
    ])
      assert.equal((await nativeFetch(base + suffix)).status, 400, suffix);
    assert.equal(
      (
        await nativeFetch(
          base.replace("banmore", "chennai") + "/summary?section=Mixing",
        )
      ).status,
      400,
    );
  });
  assert.equal(requests.length, 0);
});

test("missing sources fail closed and are briefly remembered, never returned as zero", async (t) => {
  await _clear();
  const requests = upstream(t, () => ({
    status: "ERROR",
    message: "TABLE_NOT_FOUND: silver.dim_tblunitmaster",
  }));
  await withServer(async (base) => {
    for (const section of ["Mixing", "Cutter"]) {
      const response = await nativeFetch(`${base}/summary?section=${section}`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.error.code, "OVERAGE_SOURCE_UNAVAILABLE");
      assert.equal(body.data, undefined);
    }
  });
  assert.equal(requests.length, 1);
});

test("classification conflicts fail the affected section, including paged drills, without blocking other sections", async (t) => {
  await _clear();
  const requests = upstream(t, () => ({
    rows: [
      {
        kind: "total",
        dashboard_section: "Mixing",
        overage_qty: "20",
        classification_conflict: "1",
      },
      {
        kind: "total",
        dashboard_section: "Cutter",
        overage_qty: "10",
        classification_conflict: "0",
      },
    ],
  }));
  await withServer(async (base) => {
    const summary = await nativeFetch(`${base}/summary?section=Mixing`);
    assert.equal(summary.status, 503);
    assert.equal(
      (await summary.json()).error.code,
      "OVERAGE_CLASSIFICATION_CONFLICT",
    );
    assert.equal(
      (await nativeFetch(`${base}/items?section=Mixing&offset=100`)).status,
      503,
    );
    assert.equal(
      requests.length,
      1,
      "conflict failure should be briefly remembered for the section",
    );
    assert.equal(
      (await nativeFetch(`${base}/summary?section=Cutter`)).status,
      200,
    );
    assert.equal(requests.length, 1);
    const batch = await (await nativeFetch(`${base}/summary`)).json();
    assert.equal(
      batch.data.unavailable_sections[0].dashboard_section,
      "Mixing",
    );
    assert.ok(
      batch.data.totals.every((row) => row.dashboard_section !== "Mixing"),
    );
  });
});

test("an empty summary result is an error, not inferred zero stock", async (t) => {
  await _clear();
  upstream(t, () => ({ rows: [] }));
  await withServer(async (base) => {
    const response = await nativeFetch(`${base}/summary?section=Mixing`);
    assert.equal(response.status, 502);
    assert.match(
      (await response.json()).error.message,
      /zero snapshot cannot be inferred/,
    );
  });
});

test("empty detail pages are legitimate, bounded responses", async (t) => {
  await _clear();
  upstream(t, () => ({ rows: [] }));
  await withServer(async (base) => {
    const response = await nativeFetch(`${base}/items?section=Mixing`);
    const { data } = await response.json();
    assert.deepEqual(data.rows, []);
    assert.equal(data.has_more, false);
    assert.ok(data.as_of);
  });
});
