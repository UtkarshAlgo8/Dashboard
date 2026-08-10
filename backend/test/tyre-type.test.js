/**
 * Tyre-type selection — CTP runs two lines (PCR / TBR), Banmore one.
 *
 * Offline: builds SQL and inspects it, no upstream call.
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  plantTyreTypes,
  tyreTypePredicate,
  TYRE_TYPE_ALL,
} from "../src/utils/normalize.js";
import {
  buildFetchQuery,
  QueryValidationError,
} from "../src/queries/dashboard-query.js";

test("CTP offers All / PCR / TBR, Banmore only its single line", () => {
  assert.deepEqual(plantTyreTypes("chennai"), [TYRE_TYPE_ALL, "PCR", "TBR"]);
  assert.deepEqual(plantTyreTypes("ctp"), [TYRE_TYPE_ALL, "PCR", "TBR"]);
  assert.deepEqual(plantTyreTypes("banmore"), [TYRE_TYPE_ALL, "PCR"]);
  // "Both" is a stored value, never a choice.
  assert.ok(!plantTyreTypes("chennai").includes("Both"));
});

test("a line selection also keeps the shared-compound rows", () => {
  assert.equal(
    tyreTypePredicate("PCR"),
    "UPPER(tyre_type) IN ('PCR', 'BOTH')",
  );
  assert.equal(
    tyreTypePredicate("TBR"),
    "UPPER(tyre_type) IN ('TBR', 'BOTH')",
  );
});

test("All / empty places no tyre_type restriction", () => {
  assert.equal(tyreTypePredicate("All"), null);
  assert.equal(tyreTypePredicate("all"), null);
  assert.equal(tyreTypePredicate(""), null);
  assert.equal(tyreTypePredicate(null), null);
});

test("the built query filters on the selected line, and not on All", () => {
  const tbr = buildFetchQuery({
    plantId: "chennai",
    context: { section: "Curing", granularity: "MONTH", tyre_type: "TBR" },
  });
  assert.match(tbr, /UPPER\(tyre_type\) IN \('TBR', 'BOTH'\)/);
  assert.match(tbr, /ctp_gold\.ctp_gold/);

  const all = buildFetchQuery({
    plantId: "chennai",
    context: { section: "Curing", granularity: "MONTH", tyre_type: "All" },
  });
  // tyre_type still appears as a selected column / dedupe key — what must
  // be absent is any predicate on it.
  assert.ok(!/UPPER\(tyre_type\) IN/.test(all));
  assert.ok(!/\btyre_type\s*=/.test(all));
});

test("an unsupported tyre type is rejected", () => {
  assert.throws(
    () =>
      buildFetchQuery({
        plantId: "chennai",
        context: { granularity: "MONTH", tyre_type: "LTR" },
      }),
    QueryValidationError,
  );
});
