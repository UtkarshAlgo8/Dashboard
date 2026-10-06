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
  CTP_OEE_KPIS,
  emptyColumnPredicate,
  plantPredicate,
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
  assert.deepEqual(plantTyreTypes("banmore"), ["PCR"]);
  // "Both" is a stored value, never a choice.
  assert.ok(!plantTyreTypes("chennai").includes("Both"));
});

test("a line selection also keeps the shared-compound and untagged rows", () => {
  const untagged = emptyColumnPredicate("tyre_type");
  assert.equal(
    tyreTypePredicate("PCR"),
    `(UPPER(tyre_type) IN ('PCR', 'BOTH') OR ${untagged})`,
  );
  assert.equal(
    tyreTypePredicate("TBR"),
    `(UPPER(tyre_type) IN ('TBR', 'BOTH') OR ${untagged})`,
  );
});

test("a line selection on CTP keeps the untagged OEE rows", () => {
  const sql = buildFetchQuery({
    plantId: "chennai",
    context: { section: "Curing", granularity: "DAY", tyre_type: "PCR" },
  });
  assert.ok(sql.includes(emptyColumnPredicate("tyre_type")));
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
  assert.match(tbr, /gold\.ctp_gold/);

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

test("Chennai reads the OEE family from plant CTP and the rest from CHENNAI", () => {
  const p = plantPredicate("plant", "chennai");
  assert.match(p, /UPPER\(plant\) = 'CHENNAI' AND kpi_name NOT IN \(/);
  assert.match(p, /UPPER\(plant\) = 'CTP' AND kpi_name IN \(/);
  for (const k of ["OEE_o", "OEE_s", "Breakdown", "Setup & Change"]) {
    assert.ok(CTP_OEE_KPIS.includes(k), k);
  }
  assert.equal(plantPredicate("plant", "ctp"), p);
});

test("Banmore still matches only BANMORE", () => {
  assert.equal(plantPredicate("plant", "banmore"), "UPPER(plant) = 'BANMORE'");
});

test("an unknown plant is rejected by the plant predicate", () => {
  assert.throws(() => plantPredicate("plant", "nowhere"), /Unknown plant/);
});
