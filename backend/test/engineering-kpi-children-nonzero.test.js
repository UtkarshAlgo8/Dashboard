import assert from "node:assert/strict";
import test from "node:test";
import { kpiChildrenQuery } from "../src/engineering/queries/reliability.queries.js";

const base = {
  kpiNames: ["Breakdown_Pct_m_Failure"],
  date: "2026-10-01",
  granularity: "MONTH",
};

test("nonZero drops zero-valued rows in SQL", () => {
  assert.match(kpiChildrenQuery({ ...base, nonZero: true }), /actual_value <> 0/);
});

test("zero rows are kept by default", () => {
  assert.doesNotMatch(kpiChildrenQuery(base), /actual_value <> 0/);
});

test("nonZero combines with the other filters", () => {
  const sql = kpiChildrenQuery({ ...base, nonZero: true, status: "C" });
  assert.match(sql, /actual_value <> 0 AND/);
  assert.match(sql, /status = 'C'/);
});
