/**
 * Quality Process-tab tests (Backend FRD §1). Pure-unit coverage of the
 * normalize + transformer layers, plus one integration test that runs real
 * SQL against the reference workbook when it is present (skipped otherwise,
 * so CI without the large data file stays green).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { config } from "../config.js";
import {
  resolveGranularity,
  parseDrillDown,
  valueOrNull,
  escapeLiteral,
  processScopePredicate,
} from "./normalize.js";
import {
  toKpiValue,
  toKpiValueBatch,
  toKpiChildren,
  toKpiHistory,
} from "./transformers/process.transformers.js";
import { kpiValueQuery } from "./queries/process.queries.js";

/* -------------------------- normalize -------------------------- */

test("resolveGranularity: shift convenience + explicit + reject malformed", () => {
  assert.equal(resolveGranularity({ shift: "All" }), "DAY");
  assert.equal(resolveGranularity({ shift: "B" }), "SHIFT B");
  assert.equal(resolveGranularity({ granularity: "SHIFT B" }), "SHIFT B");
  assert.equal(resolveGranularity({ granularity: "shiftb" }), "SHIFT B");
  assert.equal(resolveGranularity({ granularity: "MONTH" }), "MONTH");
  assert.equal(resolveGranularity({ granularity: "SHIFT A, B" }), null); // §0.4
  assert.equal(resolveGranularity({}), "DAY");
});

test("parseDrillDown: JSON list, single-quoted, and leaf sentinel (§1.2)", () => {
  assert.deepEqual(parseDrillDown('["Plant_quality_rating_s"]'), {
    is_leaf: false,
    children: ["Plant_quality_rating_s"],
  });
  assert.deepEqual(parseDrillDown("['Plant_quality_rating_m']"), {
    is_leaf: false,
    children: ["Plant_quality_rating_m"],
  });
  assert.deepEqual(parseDrillDown(null), { is_leaf: true, children: [] });
  assert.deepEqual(parseDrillDown("null"), { is_leaf: true, children: [] });
});

test("valueOrNull + escapeLiteral", () => {
  assert.equal(valueOrNull("null"), null);
  assert.equal(valueOrNull(0), 0); // zero is a real value, not empty
  assert.equal(valueOrNull(78.45), 78.45);
  assert.equal(escapeLiteral("O'Brien"), "'O''Brien'");
  assert.equal(escapeLiteral(7), "7");
});

test("processScopePredicate pins department/category/plant (§0.1)", () => {
  const p = processScopePredicate();
  assert.match(p, /LOWER\(department\) = 'quality'/);
  assert.match(p, /category = 'Process Audit'/);
  assert.match(p, /UPPER\(plant\) = 'BTP'/); // Process family → BTP, not BANMORE
});

/* ------------------------- transformers ------------------------ */

test("toKpiValue: value + drill children (§1.2 L0)", () => {
  const out = toKpiValue([
    {
      actual_value: 78.45,
      unit_of_measurement: "%",
      threshold_value: null,
      status: null,
      drill_down_attribute: '["Plant_quality_rating_s"]',
    },
  ]);
  assert.equal(out.actual_value, 78.45);
  assert.equal(out.unit, "%");
  assert.equal(out.threshold_value, null);
  assert.equal(out.drill_down.is_leaf, false);
  assert.deepEqual(out.drill_down.children, ["Plant_quality_rating_s"]);
});

test("toKpiValue: no row → empty-state card (§B.2)", () => {
  const out = toKpiValue([]);
  assert.equal(out.actual_value, null);
  assert.equal(out.drill_down.is_leaf, true);
});

test("toKpiChildren: §0.6 gap rule — counters zero-fill, rates null", () => {
  // Mixing has a rating row but no violation rows → Total 0, Closure_Rate null.
  const rows = [
    {
      section: "Curing",
      kpi_name: "Plant_quality_rating_s",
      actual_value: 68.37,
      drill_down_attribute: '["Plant_quality_rating_m"]',
    },
    {
      section: "Curing",
      kpi_name: "Total_Violations_s",
      actual_value: 6,
      drill_down_attribute: null,
    },
    {
      section: "Mixing",
      kpi_name: "Plant_quality_rating_s",
      actual_value: 95.28,
      drill_down_attribute: '["Plant_quality_rating_m"]',
    },
  ];
  const out = toKpiChildren(rows, {
    kpiNames: [
      "Plant_quality_rating_s",
      "Total_Violations_s",
      "Violation_Closure_Rate_s",
    ],
    groupBy: "section",
  });
  assert.equal(out.group_by, "section");
  const curing = out.rows.find((r) => r.section === "Curing");
  const mixing = out.rows.find((r) => r.section === "Mixing");
  assert.equal(curing.Total_Violations_s, 6);
  assert.equal(mixing.Total_Violations_s, 0); // counter zero-fill
  assert.equal(mixing.Violation_Closure_Rate_s, null); // rate → null
  assert.equal(mixing.Plant_quality_rating_s, 95.28);
  assert.equal(curing.drill_down.is_leaf, false); // from anchor row
});

test("toKpiValueBatch: present values + gap defaults", () => {
  const out = toKpiValueBatch(
    [{ kpi_name: "Total_Violations_o", actual_value: 7 }],
    ["Total_Violations_o", "Closed_Violation_o", "Violation_Closure_Rate_o"],
  );
  assert.equal(out.Total_Violations_o, 7);
  assert.equal(out.Closed_Violation_o, 0); // counter absent → 0
  assert.equal(out.Violation_Closure_Rate_o, null); // rate absent → null
});

test("toKpiHistory: ordered points", () => {
  const out = toKpiHistory([
    { date: "2026-06-09", actual_value: 75.83 },
    { date: "2026-06-10", actual_value: 78.45 },
  ]);
  assert.deepEqual(out.points, [
    { date: "2026-06-09", value: 75.83 },
    { date: "2026-06-10", value: 78.45 },
  ]);
});

/* ------------------- integration (excel source) ---------------- */

test("integration: PQR_o base-date row via alasql over the workbook", async (t) => {
  if (config.quality.dataSource !== "excel") return t.skip("not excel source");
  if (
    !fs.existsSync(config.quality.excelCachePath) &&
    !fs.existsSync(config.quality.excelPath)
  ) {
    return t.skip("reference workbook not present");
  }
  const { runQuery } = await import("./datasource/index.js");
  const sql = kpiValueQuery({
    kpiName: "Plant_quality_rating_o",
    date: "2026-06-10",
    granularity: "DAY",
  });
  const rows = await runQuery(sql);
  assert.equal(rows.length, 1, "exactly one overall PQR row on the base date");
  const out = toKpiValue(rows);
  assert.equal(typeof out.actual_value, "number");
  assert.equal(out.drill_down.is_leaf, false);
  assert.deepEqual(out.drill_down.children, ["Plant_quality_rating_s"]);
});
