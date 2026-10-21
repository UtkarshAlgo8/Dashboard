import { test } from "node:test";
import assert from "node:assert/strict";

import { UpstreamError, runQuery, _test } from "./upstream.js";
import { config } from "../config.js";

const { unwrapRowsEnvelope } = _test;

test("per-query Silver transport leaves existing Gold engine and tables unchanged", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(
      JSON.stringify({ columns: ["machine"], rows: [["0201"]] }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  });
  const engineBefore = config.upstream.engine;
  const tableBefore = config.upstream.table;
  const tables = ["databricks_table/silver/fct_o_production"];
  assert.deepEqual(
    await runQuery("SELECT machine FROM fct_o_production", {
      engine: "databricks",
      tables,
    }),
    [{ machine: "0201" }],
  );
  await runQuery("SELECT machine FROM gold.gold");
  assert.equal(requests[0].engine, "databricks");
  assert.deepEqual(requests[0].tables, tables);
  assert.equal(requests[1].engine, engineBefore);
  assert.deepEqual(requests[1].tables, [tableBefore]);
  assert.equal(config.upstream.engine, engineBefore);
  assert.equal(config.upstream.table, tableBefore);
});

test("Silver engine overrides retain the read-only query guard", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
  });
  await assert.rejects(
    runQuery("DELETE FROM fct_o_production", {
      engine: "databricks",
      tables: [],
    }),
    /Only SELECT/,
  );
  assert.equal(requests, 0);
});

test("unwrapRowsEnvelope accepts data.rows", () => {
  assert.deepEqual(unwrapRowsEnvelope({ data: { rows: [{ a: 1 }] } }), {
    rows: [{ a: 1 }],
  });
});

test("unwrapRowsEnvelope accepts Lambda body with nested result.rows", () => {
  const payload = {
    statusCode: 200,
    body: JSON.stringify({ result: { rows: [{ b: 2 }] } }),
  };

  assert.deepEqual(unwrapRowsEnvelope(payload), { rows: [{ b: 2 }] });
});

test("unwrapRowsEnvelope keeps columns beside positional rows", () => {
  assert.deepEqual(
    unwrapRowsEnvelope({ data: { columns: ["a"], rows: [[1]] } }),
    { columns: ["a"], rows: [[1]] },
  );
});

test("unwrapRowsEnvelope rejects invalid Lambda body JSON", () => {
  assert.throws(
    () => unwrapRowsEnvelope({ body: "not-json" }),
    (err) =>
      err instanceof UpstreamError &&
      err.type === "UPSTREAM_INVALID_JSON" &&
      err.status === 502,
  );
});
