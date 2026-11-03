import assert from "node:assert/strict";
import test from "node:test";
import {
  lossTreeSlices,
  lostMinutesTotal,
  scheduledPctTotal,
} from "./lossTreeSlices.js";

// August 2026 MONTH values from Gold.
const AUG = [
  {
    product_type: "Other Losses",
    LostTime_LossCategory: 300,
    LostTime_Pct_LossCategory: 3.57,
  },
  {
    product_type: "Change & Setup",
    LostTime_LossCategory: 100,
    LostTime_Pct_LossCategory: 2.93,
  },
  {
    product_type: "Engineering Breakdown",
    LostTime_LossCategory: 50,
    LostTime_Pct_LossCategory: 1.07,
  },
  {
    product_type: "Preventive Maintenance",
    LostTime_LossCategory: 30,
    LostTime_Pct_LossCategory: 0.38,
  },
  {
    product_type: "Power Failure",
    LostTime_LossCategory: 20,
    LostTime_Pct_LossCategory: 0.26,
  },
];

test("slice size is share of downtime; scheduled % passes through", () => {
  const slices = lossTreeSlices(AUG);
  assert.equal(lostMinutesTotal(slices), 500);
  assert.equal(slices[0].sharePct, 60);
  assert.equal(slices[2].scheduledPct, 1.07);
});

test("header % of scheduled time is the sum of the five rows (8.21)", () => {
  assert.equal(scheduledPctTotal(lossTreeSlices(AUG)).toFixed(2), "8.21");
});

test("a missing stored % (custom range) leaves the header null", () => {
  const slices = lossTreeSlices(
    AUG.map((r) => ({ ...r, LostTime_Pct_LossCategory: null })),
  );
  assert.equal(scheduledPctTotal(slices), null);
  assert.equal(slices[0].scheduledPct, null);
});

test("no rows gives no slices and no header %", () => {
  assert.deepEqual(lossTreeSlices(undefined), []);
  assert.equal(scheduledPctTotal([]), null);
});
