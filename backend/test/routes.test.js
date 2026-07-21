/**
 * Route/controller smoke tests.
 *
 * These exist because a missing import in dashboard.controller.js shipped a
 * 500 on GET /dashboard/anchors while the whole unit suite stayed green: the
 * other tests import from queries/dashboard-query.js directly and never load
 * the controller, so nothing referenced the undefined symbol. Any endpoint
 * added here must be reachable through the real Express app.
 *
 * Skipped when upstream credentials are absent.
 */
import test from "node:test";
import assert from "node:assert/strict";

let app;
try {
  ({ app } = await import("../src/app.js"));
} catch {
  app = null; // missing AWS_DATA_* env — config throws at import time
}

const skip = app ? false : "upstream credentials not configured";

/**
 * Start the app on an ephemeral port, run fn(baseUrl), always close.
 *
 * `closeAllConnections()` is required: node's fetch keeps sockets alive, so a
 * bare server.close() waits for them forever and the test run hangs rather
 * than failing. Requests also send `connection: close` for the same reason.
 */
async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

/** fetch with keep-alive disabled so the server can shut down promptly. */
function get(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: { connection: "close", ...(init.headers ?? {}) },
  });
}

test("GET /dashboard/anchors responds 200 with anchors + partialDays", { skip }, async () => {
  await withServer(async (base) => {
    const res = await get(`${base}/api/v1/dashboard/anchors`);
    assert.equal(res.status, 200, "anchors must not 500");

    const body = await res.json();
    assert.ok(body.data, "expected a data envelope");
    const { anchors, partialDays } = body.data;
    assert.ok(anchors && typeof anchors === "object");
    assert.ok(partialDays && typeof partialDays === "object");

    // C6 — the lag that a single global date would flatten.
    assert.equal(anchors["Curing|OEE_o"], "2026-07-16");
    assert.equal(anchors["Curing|Production"], "2026-07-20");

    // Out-of-scope sections must never appear (realdata.md §4).
    for (const key of Object.keys(anchors)) {
      const section = key.split("|")[0];
      assert.ok(
        ["Mixing", "TBM", "Curing", "Stock"].includes(section),
        `anchors leaked an out-of-scope section: ${section}`,
      );
    }

    // C14 — the in-progress day is reported.
    assert.equal(partialDays["Curing|2026-07-20"], 2);
  });
});

test("POST /dashboard/kpi-data returns rows plus a truncation flag", { skip }, async () => {
  await withServer(async (base) => {
    const res = await get(`${base}/api/v1/dashboard/kpi-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: { section: "Curing", granularity: "DAY" },
        date: "2026-07-16",
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.equal(typeof body.truncated, "boolean");
  });
});

test("POST /dashboard/kpi-data with withBaseline returns the baseline window", { skip }, async () => {
  await withServer(async (base) => {
    const res = await get(`${base}/api/v1/dashboard/kpi-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: { section: "Curing", granularity: "DAY" },
        from: "2026-07-01",
        to: "2026-07-16",
        withBaseline: true,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    // C15: 16 days -> the immediately preceding 16 days.
    assert.deepEqual(body.baselineWindow, {
      from: "2026-06-15",
      to: "2026-06-30",
    });
    assert.ok(Array.isArray(body.baseline));
  });
});

test("a malformed request is rejected, not 500'd", { skip }, async () => {
  await withServer(async (base) => {
    const res = await get(`${base}/api/v1/dashboard/kpi-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: { section: "Curing" },
        from: "2026-07-16",
        to: "2026-07-01", // from > to
      }),
    });
    assert.equal(res.status, 400, "from > to must be a validation error");
  });
});
