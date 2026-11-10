import test from "node:test";
import assert from "node:assert/strict";
import {
  safetyPeriod,
  safetyCard,
  safetyPeriodLabel,
  matchesSafetyContext,
} from "./safety.js";
import { storedCompliancePeriod } from "./compliance.js";
import { resolveEngineeringPeriod } from "./engineeringPeriod.js";

test("Safety independently preserves selected MONTH anchor, DAY and day SHIFT at all levels", () => {
  assert.deepEqual(safetyPeriod({ date: "2026-08-01", granularity: "MONTH" }), {
    date: "2026-08-01",
    granularity: "MONTH",
  });
  assert.equal(
    safetyPeriod({ date: "2026-08-12", granularity: "MONTH" }),
    null,
  );
  for (const shift of ["a", "b", "c"]) {
    const p = safetyPeriod({ date: "2026-08-12", granularity: "DAY" }, shift);
    assert.equal(p.granularity, `SHIFT ${shift.toUpperCase()}`);
    assert.match(safetyPeriodLabel(p), /12 Aug 2026 · Shift/);
  }
  assert.equal(safetyPeriod({ date: "2026-01-01", granularity: "YEAR" }), null);
  assert.equal(
    safetyPeriod({ date: "2026-08-01", granularity: "MONTH" }, "A"),
    null,
  );
});

test("custom DAY ranges remain supported independently of compliance percentages", () => {
  const selected = { from: "2026-08-12", to: "2026-08-15", granularity: "DAY" };
  assert.deepEqual(safetyPeriod(selected), selected);
  assert.equal(storedCompliancePeriod(selected), null);
  assert.equal(safetyPeriod(selected, "B"), null);
  assert.equal(safetyPeriod({ from: "2025-01-01", to: "2026-08-01" }), null);
  const clock = { today: "2026-11-06", currentMonth: "2026-11-01" };
  for (const range of [
    { preset: "today" },
    { preset: "month", month: "2026-08" },
    { from: "2026-08-12", to: "2026-08-15" },
    { from: "2026-08-01", to: "2026-08-31" },
  ]) {
    const selected = resolveEngineeringPeriod(range, clock);
    const p = safetyPeriod(selected);
    assert.ok(p);
    assert.equal(p.granularity, selected.granularity);
  }
});

test("response context guards every period/type/page/plant dimension", () => {
  const request = {
    date: "2026-08-01",
    granularity: "MONTH",
    level: "reports",
    type: "A '& <x>",
    offset: 25,
    limit: 25,
  };
  const context = { plant: "Banmore", ...request };
  assert.equal(matchesSafetyContext(request, context), true);
  for (const [key, value] of Object.entries({
    plant: "BTP",
    date: "2026-09-01",
    from: "2026-08-01",
    granularity: "DAY",
    level: "types",
    type: "other",
    offset: 0,
    limit: 100,
  })) {
    assert.equal(
      matchesSafetyContext(request, { ...context, [key]: value }),
      false,
    );
  }
  assert.equal(matchesSafetyContext(request, null), false);
});

test("neutral NOS card, selected period not as-of, no fabricated target/color/trend", () => {
  const period = { date: "2026-08-01", granularity: "MONTH" };
  const card = safetyCard({ value: 19 }, { period });
  assert.equal(card.v, "19");
  assert.equal(card.u, "NOS");
  assert.equal(card.target, null);
  assert.equal(card.status, null);
  assert.equal(card.presentationTone, "neutral");
  assert.equal(card.showProgress, false);
  assert.equal(card.trendApi, false);
  assert.equal(card.sp, undefined);
  assert.equal(card.periodLabel, "Aug 2026");
  assert.match(safetyCard(null, { period }).emptyReason, /No published/);
  assert.match(
    safetyCard(null, { period, error: new Error("down") }).emptyReason,
    /unavailable/,
  );
  assert.equal(safetyCard(null, { period, isLoading: true }).isLoading, true);
  assert.equal(safetyCard(null, { period: null }).drill, null);
});
