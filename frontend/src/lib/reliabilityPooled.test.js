import { test } from "node:test";
import assert from "node:assert/strict";
import {
  meanRepairMinutes,
  pooledBreakdownPct,
  pooledDowntime,
  pooledMtbf,
} from "./reliabilityPooled.js";

// Machine 0204, 1 Sep – 6 Oct 2026, as summed by kpi-children agg=sum.
const m0204 = {
  BreakdownMin_m: 3789,
  BreakdownOcc_m: 105,
  OperatingMin_m: 45131,
  ScheduledMin_m: 49810,
};

test("rates rebuild from summed components", () => {
  assert.equal(pooledDowntime(m0204), 3789);
  assert.ok(Math.abs(pooledBreakdownPct(m0204) - 7.6069) < 1e-3);
  assert.ok(Math.abs(pooledMtbf(m0204) - 429.819) < 1e-3);
  assert.ok(Math.abs(meanRepairMinutes(3789, 105) - 36.0857) < 1e-3);
});

test("a scheduled group with no breakdowns reads 0 downtime, null MTBF/MTTR", () => {
  const clean = { OperatingMin_m: 1000, ScheduledMin_m: 1000 };
  assert.equal(pooledDowntime(clean), 0);
  assert.equal(pooledBreakdownPct(clean), 0);
  assert.equal(pooledMtbf(clean), null);
  assert.equal(meanRepairMinutes(0, 0), null);
});

test("missing or zero scheduled time is a gap, not 0", () => {
  assert.equal(pooledDowntime({}), null);
  assert.equal(
    pooledBreakdownPct({ BreakdownMin_m: 10, ScheduledMin_m: 0 }),
    null,
  );
  assert.equal(pooledBreakdownPct(null), null);
  assert.equal(meanRepairMinutes(null, 4), null);
});
