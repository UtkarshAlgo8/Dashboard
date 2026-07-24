/**
 * Quality SPC tests (Backend FRD §2–§13).
 *
 * Nelson rules are covered with synthetic, spec-defined series (cl=0, ucl=3 ⇒
 * σ=1, so z equals the value) — the shipped workbook's plot points are the
 * deviated set (§B.1), so its exact rule ranges are data, not contract. The
 * integration tests then confirm the robust FRD fixtures reproduce (Belt 2
 * Splice single alert; summary 234-count reconciliation).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { config } from "../config.js";
import {
  parseKpiName,
  headlineStatus,
  evaluateNelson,
  deriveAlerts,
  alertSlug,
  groupCombos,
} from "./spc/engine.js";
import {
  toSpcSummary,
  toSpcWidgets,
  toSpcDetail,
} from "./transformers/spc.transformers.js";
import { spcDetailRowsQuery } from "./queries/spc.queries.js";

/* ---------------------------- engine ---------------------------- */

test("parseKpiName: last-token metric, remainder parameter (§2.1)", () => {
  assert.deepEqual(parseKpiName("Tread Length Cpk"), {
    parameter: "Tread Length",
    metric: "Cpk",
  });
  assert.deepEqual(parseKpiName("PLY1 Length Cp"), {
    parameter: "PLY1 Length",
    metric: "Cp",
  });
  assert.equal(parseKpiName("Belt 2 Length Random").metric, null);
});

test("headlineStatus rule (§2.1)", () => {
  assert.equal(headlineStatus(["Healthy", "Warning", "Critical", "Critical"]), "Critical");
  assert.equal(headlineStatus(["Healthy", "Healthy", "Healthy", "Healthy"]), "Healthy");
  assert.equal(
    headlineStatus(["Insufficient Data", "Insufficient Data", "Critical", "Critical"]),
    "Critical",
  );
  assert.equal(
    headlineStatus(["Insufficient Data", "Insufficient Data", "Insufficient Data", "Insufficient Data"]),
    "Insufficient Data",
  );
  assert.equal(headlineStatus(["Insufficient Data", "Warning", "Healthy", "Insufficient Data"]), "Warning");
});

test("evaluateNelson: sigma + rule 1 (one point beyond 3σ)", () => {
  const v = [0, 0.5, -0.5, 4, 0.2, -0.3, 0.1]; // z=value; #4 beyond +3σ
  const { sigma, rules, pointRules } = evaluateNelson(v, 0, 3);
  assert.equal(sigma, 1);
  const r1 = rules.find((r) => r.rule === 1);
  assert.deepEqual(r1.point_indexes, [4]);
  assert.deepEqual(pointRules.get(4), [1]);
});

test("evaluateNelson: rule 2 (9 same side of CL)", () => {
  const v = Array(9).fill(0.5); // all above CL, none beyond 1σ
  const r2 = evaluateNelson(v, 0, 3).rules.find((r) => r.rule === 2);
  assert.deepEqual(r2.point_indexes, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("evaluateNelson: rule 5 (2 of 3 beyond 2σ same side) flags only qualifiers", () => {
  const v = [2.5, 0, 2.5]; // 2 of 3 beyond +2σ
  const r5 = evaluateNelson(v, 0, 3).rules.find((r) => r.rule === 5);
  assert.deepEqual(r5.point_indexes, [1, 3]);
});

test("deriveAlerts: one alert per contiguous run; ids + severity (§12)", () => {
  const rules = [
    { rule: 1, hit: true, point_indexes: [1, 3] }, // non-contiguous → 2 alerts
    { rule: 6, hit: true, point_indexes: [5, 6, 7] }, // contiguous → 1 alert
  ];
  const alerts = deriveAlerts(rules, {
    machine: "VMI_MAXX_1",
    parameter: "Belt 2 Splice",
    recipe: "R",
    chart: "X",
    snapshot: "2026-06-10",
    times: Array.from({ length: 8 }, (_, i) => `t${i + 1}`),
  });
  assert.equal(alerts.length, 3);
  assert.equal(alerts[0].alert_id, "AL-VMIMAXX1-BELT2SPLICE-R1-X-1-1-20260610");
  assert.equal(alerts[0].severity, "Out of Control");
  assert.equal(alerts[1].alert_id, "AL-VMIMAXX1-BELT2SPLICE-R1-X-3-3-20260610");
  assert.equal(alerts[2].alert_id, "AL-VMIMAXX1-BELT2SPLICE-R6-X-5-7-20260610");
  assert.equal(alerts[2].severity, "Warning");
  assert.deepEqual(alerts[2].time, { first: "t5", last: "t7" });
});

test("alertSlug strips non-alphanumerics (§12)", () => {
  assert.equal(alertSlug("VMI_MAXX_1"), "VMIMAXX1");
  assert.equal(alertSlug("Belt 2 Splice"), "BELT2SPLICE");
});

/* -------------------------- transformers ------------------------ */

const mkRow = (machine, itemcode, param, statuses, values, plot) =>
  ["Cp", "Cpk", "Pp", "Ppk"].map((m, i) => ({
    machine,
    itemcode,
    kpi_name: `${param} ${m}`,
    status: statuses[i],
    actual_value: values[i],
    plot_data: plot,
  }));

test("toSpcSummary: counts reconcile to combo total (§2.2)", () => {
  const rows = [
    ...mkRow("M", "R", "Healthy P", ["Healthy", "Healthy", "Healthy", "Healthy"], [3, 3, 3, 3]),
    ...mkRow("M", "R", "Warn P", ["Warning", "Healthy", "Healthy", "Healthy"], [1, 1, 1, 1]),
    ...mkRow("M", "R", "Crit P", ["Critical", "Warning", "Healthy", "Healthy"], [0.5, 0.5, 0.5, 0.5]),
    ...mkRow("M", "R", "Ins P", ["Insufficient Data", "Insufficient Data", "Insufficient Data", "Insufficient Data"], [null, null, null, null]),
  ];
  const s = toSpcSummary(rows);
  assert.equal(s.total_parameters, 4);
  assert.equal(s.out_of_specification, 1);
  assert.equal(s.not_capable, 1);
  assert.equal(s.capable, 1);
  assert.equal(s.insufficient_data, 1);
  assert.equal(
    s.out_of_specification + s.not_capable + s.capable + s.insufficient_data,
    s.total_parameters,
  );
});

test("toSpcWidgets: worst-first sort, insufficient gets sample_size not chart", () => {
  const plot = JSON.stringify({
    x_chart: { values: [1], time: ["t"], ucl: 3, cl: 0, lcl: -3 },
    histogram: { counts: [2, 3] },
  });
  const insPlot = JSON.stringify({ histogram: { counts: [] } });
  const rows = [
    ...mkRow("M", "R", "HealthyP", ["Healthy", "Healthy", "Healthy", "Healthy"], [3, 2.5, 3, 2.5], plot),
    ...mkRow("M", "R", "CritP", ["Critical", "Critical", "Critical", "Critical"], [1, 0.5, 1, 0.5], plot),
    ...mkRow("M", "R", "InsP", ["Insufficient Data", "Insufficient Data", "Insufficient Data", "Insufficient Data"], [null, null, null, null], insPlot),
  ];
  const { count, widgets } = toSpcWidgets(rows);
  assert.equal(count, 3);
  assert.equal(widgets[0].headline_status, "Critical"); // worst first
  assert.equal(widgets[2].headline_status, "Insufficient Data"); // last
  assert.ok(widgets[0].control_chart, "capable/critical widget has a chart");
  assert.deepEqual(widgets[2].insufficient, { sample_size: 0 });
});

/* ------------------- integration (excel source) ---------------- */

const hasWorkbook =
  config.quality.dataSource === "excel" &&
  (fs.existsSync(config.quality.excelCachePath) || fs.existsSync(config.quality.excelPath));

test("integration: summary reconciles 234 combos on base date (§2.2)", async (t) => {
  if (!hasWorkbook) return t.skip("workbook not present");
  const { runQuery } = await import("./datasource/index.js");
  const { spcSummaryRowsQuery } = await import("./queries/spc.queries.js");
  const rows = await runQuery(spcSummaryRowsQuery({ snapshot: "2026-06-10" }));
  const s = toSpcSummary(rows);
  assert.equal(s.total_parameters, 234);
  assert.equal(
    s.out_of_specification + s.not_capable + s.capable + s.insufficient_data,
    234,
  );
});

test("integration: Belt 2 Splice detail — Healthy capability, one X alert on #18 (§6/§12)", async (t) => {
  if (!hasWorkbook) return t.skip("workbook not present");
  const { runQuery } = await import("./datasource/index.js");
  const rows = await runQuery(
    spcDetailRowsQuery({
      snapshot: "2026-06-10",
      machine: "VMI_MAXX_1",
      recipe: "165/70R14-UXTOURING-81S-TL-VMIMAXX",
      parameter: "Belt 2 Splice",
    }),
  );
  const detail = toSpcDetail(rows, { snapshot: "2026-06-10" });
  assert.equal(detail.capability.headline_status, "Healthy");
  assert.equal(detail.x_chart.cl, 0.3496);
  assert.equal(detail.x_chart.ucl, 0.6323);
  const p18 = detail.x_chart.points.find((p) => p.index === 18);
  assert.deepEqual(p18.rules, [1]);
  assert.equal(p18.z, 3.32);
  const xAlerts = detail.x_chart.alerts;
  assert.equal(xAlerts.length, 1);
  assert.equal(
    xAlerts[0].alert_id,
    "AL-VMIMAXX1-BELT2SPLICE-R1-X-18-18-20260610",
  );
});

test("integration: insufficient combo → capability nulls, no chart datasets (§4/§5)", async (t) => {
  if (!hasWorkbook) return t.skip("workbook not present");
  const { runQuery } = await import("./datasource/index.js");
  const rows = await runQuery(
    spcDetailRowsQuery({
      snapshot: "2026-06-10",
      machine: "VMI_MAXX_1",
      recipe: "175/65R14-TAXIMAX-82T-TL-VMIMAXX",
      parameter: "Tread Length",
    }),
  );
  const detail = toSpcDetail(rows, { snapshot: "2026-06-10" });
  assert.equal(detail.capability.headline_status, "Insufficient Data");
  assert.equal(detail.capability.cp.value, null);
  assert.deepEqual(detail.insufficient, { sample_size: 0 });
  assert.equal(detail.x_chart, undefined);
});
