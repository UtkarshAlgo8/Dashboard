import { test } from "node:test";
import assert from "node:assert/strict";
import { toKpiGrid } from "./kpi-transformer.js";

const row = (kpi_name, date, value, extra = {}) => ({
  date,
  section: "Mixing",
  sub_section: "",
  machine: "",
  product_type: "",
  itemcode: "",
  granularity: "DAY",
  category: "Productivity",
  kpi_name,
  unit_of_measurement: "NOS",
  actual_value: value,
  ...extra,
});

test("DAY snapshot reads D-1 from baselineRows when trailing window has only today", () => {
  const today = row("Production", "2026-10-01", 500);
  const yesterday = row("Production", "2026-09-30", 400);
  const card = toKpiGrid([today], {
    section: "Mixing",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    headlineDate: "2026-10-01",
    baselineRows: [yesterday],
    baselineWindow: { date: "2026-09-30" },
  }).find((k) => k.rawName === "Production");
  assert.equal(card.value, 500);
  assert.ok(card.trend != null, "trend should be set from baseline");
  assert.match(card.trendBaseline, /vs/);
});

test("DAY snapshot falls back to in-window D-1 when baseline is absent", () => {
  const today = row("Production", "2026-10-01", 500);
  const yest = row("Production", "2026-09-30", 400);
  const card = toKpiGrid([today, yest], {
    section: "Mixing",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
  }).find((k) => k.rawName === "Production");
  assert.equal(card.value, 500);
  assert.ok(card.trend != null);
});

test("DAY snapshot uses baseline when trailing window holds only today", () => {
  const today = row("Production", "2026-10-01", 500);
  const yesterday = row("Production", "2026-09-30", 400);
  const card = toKpiGrid([today], {
    section: "Mixing",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    baselineRows: [yesterday],
    baselineWindow: { date: "2026-09-30" },
  }).find((k) => k.rawName === "Production");
  assert.equal(card.value, 500);
  assert.ok(card.trend != null);
});
