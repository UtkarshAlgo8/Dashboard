import assert from "node:assert/strict";
import test from "node:test";
import {
  complianceCard,
  formatCompliancePeriod,
  storedCompliancePeriod,
} from "./compliance.js";

const period = { date: "2026-11-01", granularity: "MONTH" };

for (const id of ["pm", "daily", "critical"]) {
  test(`${id}: brand presentation never invents a RAG status, target or percentage`, () => {
    for (const value of [0, 1.744186046511628, 12.34, 100]) {
      const card = complianceCard(id, { value }, { period });
      assert.equal(card.presentationTone, "brand");
      assert.equal(card.v, String(value));
      assert.equal(card.status, null);
      assert.equal(card.target, null);
      assert.equal(card.drill, id);
      assert.ok(card.ragInfo.some((line) => line.includes("not a pass/fail")));
    }
  });

  test(`${id}: connected cards remain available to render for empty, loading and error periods`, () => {
    for (const state of [
      {},
      { isLoading: true },
      { error: new Error("upstream unavailable") },
    ]) {
      const card = complianceCard(id, null, { period, ...state });
      assert.equal(card.na, false);
      assert.equal(card.live, true);
      assert.equal(card.v, "—");
      assert.equal(card.drill, id);
      assert.ok(card.emptyReason);
    }
  });
}

test("captions describe valid stored periods, not freshness or invalid anchors", () => {
  assert.equal(formatCompliancePeriod(period), "Nov 2026");
  assert.equal(
    formatCompliancePeriod({ date: "2026-01-01", granularity: "YEAR" }),
    "2026",
  );
  assert.equal(
    formatCompliancePeriod({ date: "2026-11-03", granularity: "DAY" }),
    "03 Nov 2026",
  );
  assert.equal(
    formatCompliancePeriod({ date: "2026-11-03", granularity: "SHIFT B" }),
    "03 Nov 2026 · Shift B",
  );
  for (const bad of [
    null,
    { date: "2026-02-30", granularity: "DAY" },
    { date: "2026-11-03", granularity: "MONTH" },
    { date: "2026-02-01", granularity: "YEAR" },
    { date: "2026-11-03", granularity: "OTHER" },
  ])
    assert.equal(formatCompliancePeriod(bad), null);
  for (const state of [{}, { isLoading: true }, { error: new Error("down") }]) {
    const card = complianceCard("pm", null, { period, ...state });
    assert.equal(card.periodLabel, "Nov 2026");
    assert.doesNotMatch(card.periodLabel, /as of/i);
  }
  assert.equal(
    complianceCard("critical", null, { period: null }).periodLabel,
    null,
  );
});

test("Critical Parameter remains a lower-is-better raw violation percentage", () => {
  const card = complianceCard(
    "critical",
    { value: 1.744186046511628 },
    { period },
  );
  assert.equal(card.lowerIsBetter, true);
  assert.equal(card.v, "1.744186046511628");
});

test("stored period and shift matching remain unchanged", () => {
  assert.deepEqual(storedCompliancePeriod({ date: "2026-11-05", shift: "b" }), {
    date: "2026-11-05",
    granularity: "SHIFT B",
  });
  assert.deepEqual(
    storedCompliancePeriod({ from: "2026-11-01", to: "2026-11-30" }),
    period,
  );
  assert.deepEqual(
    storedCompliancePeriod({ from: "2026-01-01", to: "2026-12-31" }),
    {
      date: "2026-01-01",
      granularity: "YEAR",
    },
  );
  assert.equal(
    storedCompliancePeriod({ from: "2026-11-01", to: "2026-11-04" }),
    null,
  );
  const card = complianceCard("daily", null, { period: null });
  assert.equal(card.na, false);
  assert.equal(card.drill, null);
  assert.match(card.emptyReason, /Custom-range percentages/);
});
