import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Isolated fixtures only. Never load the original checkout environment here.
process.env.AWS_DATA_URL = "http://127.0.0.1:1/fixture-only";
process.env.AWS_DATA_API_KEY = "uniformity-test-placeholder";
process.env.NODE_ENV = "development";
process.env.AUTH_ENABLED = "true";
process.env.CACHE_DRIVER = "memory";
process.env.CACHE_WARM_ENABLED = "false";
process.env.CACHE_MATERIALIZE_ENABLED = "false";
process.env.CACHE_PREHEAT_ENABLED = "false";

function get(server, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: server.address().port, path }, (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode, body: JSON.parse(text) }),
        );
      })
      .on("error", reject);
  });
}
const url = (kind, changes = {}) =>
  `/api/v1/quality/product/uniformity/${kind}?${new URLSearchParams({ plant: "BANMORE", card: "mtms", from: "2026-03-01", to: "2026-03-01", period: "day", shift: "ALL", level: "machine", ...changes })}`;

test("Uniformity routes remain behind existing JWT gate; selected-level cache deduplicates queries", async (t) => {
  // App assembly imports an eager auth-DB authenticate() side effect. Stub it
  // before assembly: fixture route tests must never open a real DB connection.
  const { Sequelize } = await import("sequelize");
  t.mock.method(Sequelize.prototype, "authenticate", async () => {});
  const { app } = await import("../../app.js");
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    reads++;
    const request = JSON.parse(init.body);
    assert.equal(request.engine, "athena");
    assert.deepEqual(request.tables, []);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return new Response(
      JSON.stringify({
        rows: [
          {
            machine: "MICROPOISE",
            yield_pct: 95,
            tyres_tested: 20,
            _total: 1,
            _duplicates: 0,
          },
        ],
      }),
      { status: 200 },
    );
  });
  for (const kind of ["gold", "barcodes", "points"])
    assert.equal((await get(server, url(kind))).status, 401);
  assert.equal(reads, 0);
  // The real gate remains mounted; its documented local-dev bypass lets fixture
  // requests exercise the production router without a DB/auth dependency.
  process.env.AUTH_ENABLED = "false";
  const [first, duplicate] = await Promise.all([
    get(server, url("gold")),
    get(server, url("gold")),
  ]);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, duplicate.body);
  assert.equal(reads, 1);
  assert.equal(first.body.data.context.level, "machine");
  await get(server, url("gold"));
  assert.equal(reads, 1);
  await get(server, url("gold", { level: "sku", machine: "OTHER" }));
  assert.equal(reads, 2);
  assert.equal((await get(server, url("gold", { plant: "CTP" }))).status, 400);
  assert.equal(
    (
      await get(
        server,
        url("gold", {
          card: "tuo",
          level: "parameter",
          machine: "M",
          sku: "S",
        }),
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await get(
        server,
        url("barcodes", { card: "tuo", machine: "M", sku: "S" }),
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await get(
        server,
        url("points", {
          card: "zf-uniformity",
          machine: "M",
          sku: "S",
          parameter: "RFV CW",
        }),
      )
    ).status,
    400,
  );
  assert.equal(reads, 2);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          status: "ERROR",
          message: "fixture source failure",
          type: "UPSTREAM_ERROR",
        }),
        { status: 200 },
      ),
  );
  const failed = await get(
    server,
    url("gold", { from: "2026-03-02", to: "2026-03-02" }),
  );
  assert.equal(failed.status, 502);
  assert.equal(failed.body.error.message, "fixture source failure");
});
