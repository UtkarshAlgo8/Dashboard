import { test } from "node:test";
import assert from "node:assert/strict";

import { UpstreamError, _test } from "./upstream.js";

const { unwrapRowsEnvelope } = _test;

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
