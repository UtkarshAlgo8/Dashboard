import assert from "node:assert/strict";
import test from "node:test";
import {
  machinesAffectedBars,
  machinesAffectedHeadline,
} from "./machinesAffected.js";

// August 2026 MONTH rows from Gold, joined on status.
const GRADE = [
  { status: "Unmapped", TotalMachines_Grade: 94, BreakdownMachines_Grade: 33 },
  { status: "A", TotalMachines_Grade: 9, BreakdownMachines_Grade: 8 },
  { status: "C", TotalMachines_Grade: 182, BreakdownMachines_Grade: 177 },
  { status: "B", TotalMachines_Grade: 29, BreakdownMachines_Grade: 28 },
];
const GRADE_KEYS = {
  dim: "status",
  totalKpi: "TotalMachines_Grade",
  affectedKpi: "BreakdownMachines_Grade",
};

test("headline: affected / total, % and no-breakdown count", () => {
  const h = machinesAffectedHeadline(GRADE, 314);
  assert.equal(h.affected, 246);
  assert.equal(h.total, 314);
  assert.equal(h.noBreakdown, 68);
  assert.equal(h.pct.toFixed(1), "78.3");
});

test("bars: largest total first, Unmapped always last", () => {
  const bars = machinesAffectedBars(GRADE, GRADE_KEYS);
  assert.deepEqual(
    bars.map((b) => b.label),
    ["C", "B", "A", "Unmapped"],
  );
  assert.equal(
    bars.reduce((s, b) => s + b.total, 0),
    314,
  );
});

test("a group with no breakdown row counts 0 affected", () => {
  const bars = machinesAffectedBars(
    [{ status: "D", TotalMachines_Grade: 5, BreakdownMachines_Grade: null }],
    GRADE_KEYS,
  );
  assert.equal(bars[0].affected, 0);
});

test("missing data: no rows or no total leaves the headline blank", () => {
  const empty = machinesAffectedHeadline([], 314);
  assert.equal(empty.affected, null);
  assert.equal(empty.pct, null);
  const noTotal = machinesAffectedHeadline(GRADE, undefined);
  assert.equal(noTotal.total, null);
  assert.equal(noTotal.pct, null);
  assert.equal(noTotal.noBreakdown, null);
});
