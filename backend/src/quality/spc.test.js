/**
 * Quality SPC tests (Backend FRD §2–§13; Gold_to_Silver_Mapping Sheet1).
 *
 * Nelson rules are covered with synthetic, spec-defined series (cl=0, ucl=3 ⇒
 * σ=1, so z equals the value).
 *
 * Everything here is a unit test over explicit fixtures. The old integration
 * tests read `plot_data` from the reference workbook; that column is empty in
 * the live gold table and is no longer read at all — charts are now assembled
 * from silver readings plus gold baseline limits, so the assembly itself is
 * what the fixtures exercise. Live Athena behaviour is verified out-of-band.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  parseKpiName,
  headlineStatus,
  statusForValue,
  evaluateNelson,
  deriveAlerts,
  alertSlug,
  groupCombos,
  subgroups,
  rChartLimits,
  modeSetpoint,
  buildDistribution,
  validateLimits,
  pickBaseline,
  normalizeTime,
  toNumber,
} from "./spc/engine.js";
import {
  toSpcSummary,
  toSpcWidgets,
  toSpcDetail,
} from "./transformers/spc.transformers.js";
import {
  spcGranularity,
  spcCapabilityRowsQuery,
  spcCapabilityRangeQuery,
  spcDetailRangeQuery,
  spcCapabilityTrendQuery,
  spcLimitsQuery,
  GRAN_BASELINE,
} from "./queries/spc.queries.js";
import {
  shiftHours,
  resolveSilver,
  sourceForMachine,
  paramsForSource,
} from "./spc/mapping.js";
import {
  silverBoardQuery,
  silverMonthsQuery,
  silverPointsQuery,
} from "./queries/silver.queries.js";

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
  // Major sits between Critical and Warning. Before it was ranked it fell
  // through to Healthy, reporting thousands of marginal processes as capable.
  assert.equal(headlineStatus(["Healthy", "Major", "Warning", "Healthy"]), "Major");
  assert.equal(headlineStatus(["Major", "Critical", "Healthy", "Healthy"]), "Critical");
  // A token nobody has ranked is surfaced as-is rather than being silently
  // upgraded to Healthy. Any *known* severity still outranks it.
  assert.equal(
    headlineStatus(["Insufficient Data", "Bogus", "Insufficient Data", "Insufficient Data"]),
    "Bogus",
  );
  assert.equal(headlineStatus(["Healthy", "Bogus", "Healthy", "Healthy"]), "Healthy");
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

const mkRow = (machine, itemcode, param, statuses, values) =>
  ["Cp", "Cpk", "Pp", "Ppk"].map((m, i) => ({
    machine,
    itemcode,
    kpi_name: `${param} ${m}`,
    status: statuses[i],
    actual_value: values[i],
  }));

test("toSpcSummary: counts reconcile to combo total (§2.2)", () => {
  const rows = [
    ...mkRow("M", "R", "Healthy P", ["Healthy", "Healthy", "Healthy", "Healthy"], [3, 3, 3, 3]),
    ...mkRow("M", "R", "Warn P", ["Warning", "Healthy", "Healthy", "Healthy"], [1, 1, 1, 1]),
    ...mkRow("M", "R", "Crit P", ["Critical", "Warning", "Healthy", "Healthy"], [0.5, 0.5, 0.5, 0.5]),
    ...mkRow("M", "R", "Major P", ["Major", "Healthy", "Healthy", "Healthy"], [1.4, 1.4, 1.4, 1.4]),
    ...mkRow("M", "R", "Ins P", ["Insufficient Data", "Insufficient Data", "Insufficient Data", "Insufficient Data"], [null, null, null, null]),
  ];
  const s = toSpcSummary(rows);
  assert.equal(s.total_parameters, 5);
  assert.equal(s.out_of_specification, 1);
  assert.equal(s.marginal, 1);
  assert.equal(s.not_capable, 1);
  assert.equal(s.capable, 1);
  assert.equal(s.insufficient_data, 1);
  assert.equal(
    s.out_of_specification + s.marginal + s.not_capable + s.capable + s.insufficient_data,
    s.total_parameters,
  );
});

test("toSpcWidgets: worst-first sort, series from the silver board index", () => {
  const rows = [
    ...mkRow("M", "R", "HealthyP", ["Healthy", "Healthy", "Healthy", "Healthy"], [3, 2.5, 3, 2.5]),
    ...mkRow("M", "R", "CritP", ["Critical", "Critical", "Critical", "Critical"], [1, 0.5, 1, 0.5]),
    ...mkRow("M", "R", "MajorP", ["Major", "Healthy", "Healthy", "Healthy"], [1.4, 1.4, 1.4, 1.4]),
    ...mkRow("M", "R", "InsP", ["Insufficient Data", "Insufficient Data", "Insufficient Data", "Insufficient Data"], [null, null, null, null]),
  ];
  const limitsIndex = new Map([
    ["M|||CritP", { ucl: 12, lcl: 8, baseline_date: "2026-09-09", on_or_before: false }],
    ["M|||HealthyP", { ucl: 12, lcl: 8, baseline_date: "2026-09-09", on_or_before: true }],
    ["M|||MajorP", { ucl: 12, lcl: 8, baseline_date: "2026-09-09", on_or_before: true }],
  ]);
  const series = { means: [10, 10.5], times: ["t1", "t2"], readings: 10, subgroups_total: 2 };
  const seriesIndex = new Map([
    ["M|||R|||CritP", series],
    ["M|||R|||HealthyP", series],
    ["M|||R|||MajorP", series],
  ]);
  const { count, widgets } = toSpcWidgets(rows, { limitsIndex, seriesIndex });
  assert.equal(count, 4);
  assert.deepEqual(
    widgets.map((w) => w.headline_status),
    ["Critical", "Major", "Healthy", "Insufficient Data"],
  );
  assert.deepEqual(widgets[0].control_chart.values, [10, 10.5]);
  assert.equal(widgets[0].control_chart.cl, 10); // (12 + 8) / 2
  assert.equal(widgets[0].control_chart.limits_valid, true);
  // Readings back the chart; `subgroups` is the computed count, not the
  // thinned point count the sparkline draws.
  assert.equal(widgets[0].sample_size, 10);
  assert.equal(widgets[0].subgroups, 2);
});

test("toSpcWidgets: no silver readings → insufficient with a reason, not an empty axis", () => {
  const rows = mkRow("M", "R", "P", ["Healthy", "Healthy", "Healthy", "Healthy"], [2, 2, 2, 2]);
  const { widgets } = toSpcWidgets(rows, { limitsIndex: new Map(), seriesIndex: new Map() });
  assert.equal(widgets[0].control_chart, undefined);
  assert.equal(widgets[0].insufficient.sample_size, 0);
  assert.match(widgets[0].insufficient.reason, /no silver measurements/);
});

/* --------------- silver assembly: engine primitives -------------- */

test("subgroups: means/ranges of 5, plotted at the last timestamp, tail dropped", () => {
  const pts = [1, 2, 3, 4, 5, 10, 10, 10, 10, 20, 7, 7].map((v, i) => ({
    value: v,
    event_time: `2026-09-01 00:0${i}:00`,
  }));
  const sg = subgroups(pts, 5);
  assert.deepEqual(sg.means, [3, 12]); // (1..5)/5, (10,10,10,10,20)/5
  assert.deepEqual(sg.ranges, [4, 10]);
  assert.deepEqual(sg.times, ["2026-09-01 00:04:00", "2026-09-01 00:09:00"]);
  assert.equal(sg.used, 10); // the trailing 2 readings are discarded
});

test("subgroups: fewer readings than one subgroup → nothing plotted", () => {
  const sg = subgroups([{ value: 1, event_time: "t" }], 5);
  assert.deepEqual(sg.means, []);
  assert.equal(sg.used, 0);
});

test("rChartLimits: n=5 ⇒ D3=0, D4=2.114 applied to R-bar", () => {
  const r = rChartLimits([2, 4], 5);
  assert.equal(r.cl, 3);
  assert.equal(r.lcl, 0);
  assert.ok(Math.abs(r.ucl - 6.342) < 1e-9);
  assert.deepEqual(rChartLimits([], 5), { cl: null, ucl: null, lcl: null });
});

test("modeSetpoint: modal positive value; zeros are the idle marker, not a target", () => {
  assert.equal(modeSetpoint([1850, 1850, 2048]), 1850);
  assert.equal(modeSetpoint([0, 0, 0, 1850]), 1850);
  assert.equal(modeSetpoint([0, 0, null, ""]), null);
});

test("buildDistribution: Freedman-Diaconis bins, counts reconcile, spec window respected", () => {
  const values = Array.from({ length: 64 }, (_, i) => 100 + (i % 8));
  const d = buildDistribution(values, { target: 103, usl: 106, lsl: 100 });
  assert.equal(d.sample_size, 64);
  assert.equal(d.bins.reduce((a, b) => a + b.count, 0), 64);
  assert.ok(d.bins.length >= 8 && d.bins.length <= 60);
  assert.equal(d.target, 103);
  assert.equal(d.out_of_spec.count, 8); // the eight readings at 107
  assert.equal(d.curve.x.length, d.curve.y.length);
});

test("buildDistribution: a single repeated reading has zero spread and no curve", () => {
  const d = buildDistribution([5, 5, 5, 5]);
  assert.equal(d.std, 0);
  assert.equal(d.mean, 5);
  assert.equal(d.bins.reduce((a, b) => a + b.count, 0), 4);
});

test("validateLimits: rejects an inverted pair rather than swapping it", () => {
  const ok = validateLimits(12, 8);
  assert.deepEqual(ok, { valid: true, ucl: 12, cl: 10, lcl: 8, reason: null });
  // 29 of 119 gold pairs are inverted. Which of the two is wrong is not
  // knowable, so the pair is dropped and the reason surfaced.
  const bad = validateLimits(1857.218, 2278.178);
  assert.equal(bad.valid, false);
  assert.equal(bad.cl, null);
  assert.match(bad.reason, /not above LCL/);
  assert.match(validateLimits(null, 8).reason, /no baseline limits/);
});

test("pickBaseline: newest on or before the date, else earliest with a flag", () => {
  const rows = [
    { baseline_date: "2026-08-01", kpi_name: "P UCL", actual_value: 1 },
    { baseline_date: "2026-09-09", kpi_name: "P UCL", actual_value: 2 },
  ];
  const on = pickBaseline(rows, "2026-09-30");
  assert.equal(on.baseline_date, "2026-09-09");
  assert.equal(on.on_or_before, true);
  // Every baseline post-dates the chart: use the earliest and say so.
  const after = pickBaseline(rows, "2026-07-01");
  assert.equal(after.baseline_date, "2026-08-01");
  assert.equal(after.on_or_before, false);
  assert.deepEqual(pickBaseline([], "2026-09-01"), {
    rows: [],
    baseline_date: null,
    on_or_before: false,
  });
});

test("toNumber / normalizeTime: Athena's string numerics and timestamp suffix", () => {
  assert.equal(toNumber("1.5"), 1.5);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber(null), null);
  assert.equal(normalizeTime("2026-09-01 04:22:14.000 UTC"), "2026-09-01 04:22:14");
  assert.equal(normalizeTime(null), null);
});

/* ------------------------ shift + mapping ------------------------ */

test("shiftHours: A/B/C clock hours, C wraps midnight", () => {
  assert.deepEqual(shiftHours("A"), { from: 7, to: 15 });
  assert.deepEqual(shiftHours("B"), { from: 15, to: 23 });
  assert.deepEqual(shiftHours("C"), { from: 23, to: 7 });
  assert.deepEqual(shiftHours(" b "), { from: 15, to: 23 });
});

test("shiftHours: All, missing or unknown shift narrows nothing", () => {
  assert.equal(shiftHours("All"), null);
  assert.equal(shiftHours(undefined), null);
  assert.equal(shiftHours("Z"), null);
});

test("resolveSilver: maps a machine+parameter to its table and column", () => {
  const src = resolveSilver("VMI_MAXX_01", "Belt 1 Length");
  assert.equal(src.table, "silver.fct_production_data_vmi_maxx");
  assert.equal(src.valueColumn, "belt1_length");
  assert.equal(src.tolerance, 5);
  assert.equal(src.provenance, "documented");
  // Splices carry no documented tolerance — no spec window is invented.
  assert.equal(resolveSilver("VMI_MAXX_01", "Belt 1 Splice").tolerance, null);
  assert.equal(resolveSilver("NOT_A_MACHINE", "Belt 1 Length"), null);
});

/* --------------------------- SQL scoping ------------------------ */

test("spcGranularity: a shift selects the shift row, not the day row", () => {
  assert.equal(spcGranularity("A"), "Shift A");
  assert.equal(spcGranularity("C"), "Shift C");
  assert.equal(spcGranularity("All"), "Day");
  assert.equal(spcGranularity(undefined), "Day");
});

test("spcCapabilityRowsQuery: scoped to one granularity, Baseline excluded", () => {
  const sql = spcCapabilityRowsQuery({ snapshot: "2026-09-01", granularity: "Shift A" });
  // Without this filter one date returns Day + all three shifts + Baseline
  // and a combo's four metric rows overwrite each other.
  assert.match(sql, /granularity\s*=\s*'Shift A'/);
  assert.ok(!sql.includes("plot_data"), "plot_data is empty upstream and no longer read");
});

test("spcCapabilityRangeQuery: averages the range's days per combo+metric", () => {
  const sql = spcCapabilityRangeQuery({
    from: "2026-08-01",
    to: "2026-08-31",
    granularity: "Day",
    machine: "VMIEXXIUM02",
  });
  assert.match(sql, /AVG\(actual_value\) AS actual_value/);
  assert.match(sql, /COUNT\(actual_value\) AS days/);
  assert.match(sql, /GROUP BY machine, itemcode, product_type, kpi_name/);
  assert.match(sql, /granularity\s*=\s*'Day'/);
  assert.match(sql, />=\s*'20260801'/);
  assert.match(sql, /<=\s*'20260831'/);
  // A per-day status must not ride along with an average of many days.
  assert.ok(!/SELECT[^]*?\bstatus\b[^]*?FROM/.test(sql), "status is derived, not selected");
});

test("spcDetailRangeQuery: one combo, its four metrics, averaged", () => {
  const sql = spcDetailRangeQuery({
    from: "2026-08-01",
    to: "2026-08-31",
    granularity: "Day",
    machine: "VMIEXXIUM02",
    recipe: "185/65R15",
    parameter: "PLY1 Splice",
  });
  assert.match(sql, /kpi_name IN \('PLY1 Splice Cp', 'PLY1 Splice Cpk', 'PLY1 Splice Pp', 'PLY1 Splice Ppk'\)/);
  assert.match(sql, /AVG\(actual_value\) AS actual_value/);
  assert.match(sql, /itemcode = '185\/65R15'/);
});

test("spcDetailRangeQuery: the empty recipe stays the null/empty sentinel, not a value", () => {
  const sql = spcDetailRangeQuery({
    from: "2026-08-01",
    to: "2026-08-31",
    granularity: "Day",
    machine: "VMIEXXIUM02",
    recipe: "",
    parameter: "PLY1 Splice",
  });
  assert.match(sql, /\(itemcode IS NULL OR itemcode = ''\)/);
});

test("spcCapabilityTrendQuery: scopes daily history to one capability metric", () => {
  const sql = spcCapabilityTrendQuery({
    from: "2026-09-01",
    to: "2026-09-25",
    granularity: "Day",
    machine: "VMIEXXIUM03",
    recipe: "215/60R17",
    parameter: "PLY2 Splice",
    metric: "Cpk",
  });
  assert.match(sql, /SELECT date, actual_value, status/);
  assert.match(sql, /kpi_name\s*=\s*'PLY2 Splice Cpk'/);
  assert.match(sql, /machine\s*=\s*'VMIEXXIUM03'/);
  assert.match(sql, /itemcode\s*=\s*'215\/60R17'/);
  assert.match(sql, />=\s*'20260901'/);
  assert.match(sql, /<=\s*'20260925'/);
  assert.match(sql, /ORDER BY date/);
});

test("statusForValue: grades an average in the bands gold uses per metric", () => {
  // Cp/Cpk: Major from 1.00, Warning from 1.33, Healthy from 1.67.
  assert.equal(statusForValue("Cp", 0.99), "Critical");
  assert.equal(statusForValue("Cpk", 1.0), "Major");
  assert.equal(statusForValue("Cp", 1.33), "Warning");
  assert.equal(statusForValue("Cpk", 1.67), "Healthy");
  // Pp/Ppk sit a band lower: Warning from 1.20, Healthy from 1.50.
  assert.equal(statusForValue("Pp", 1.25), "Warning");
  assert.equal(statusForValue("Ppk", 1.5), "Healthy");
  // Cp at the same 1.25 is still only Major — the bands differ by metric.
  assert.equal(statusForValue("Cp", 1.25), "Major");
});

test("statusForValue: no value, or an unknown metric, is Insufficient Data", () => {
  assert.equal(statusForValue("Cp", null), "Insufficient Data");
  assert.equal(statusForValue("Cp", ""), "Insufficient Data");
  assert.equal(statusForValue("Cp", "not a number"), "Insufficient Data");
  assert.equal(statusForValue("Nope", 1.5), "Insufficient Data");
});

test("spcLimitsQuery: baseline granularity, keyed on machine+parameter only", () => {
  const sql = spcLimitsQuery({ machine: "VMI_MAXX_01", parameter: "Belt 1 Length" });
  assert.match(sql, new RegExp(`granularity\\s*=\\s*'${GRAN_BASELINE}'`));
  // The UCL and LCL of one parameter carry different itemcodes upstream, so
  // filtering on recipe would drop half of every pair. `itemcode` may still
  // appear as a SELECTED column — the gold/gold_daily UNION ALL subquery
  // projects all 27 gold columns — so assert on the PREDICATE, not the name.
  assert.ok(
    !/itemcode\s*(=|IN|IS)/i.test(sql),
    "limits must not be filtered by recipe",
  );
});

/* ------------------------- detail assembly ---------------------- */

const DETAIL_SCOPE = { dates: "all", shift: "All" };
const SELECTION = {
  machine: "VMI_MAXX_01",
  recipe: "205/65R15 UX TOURING 94V TL-VMIMAXX",
  parameter: "Belt 1 Length",
};

/** 30 readings around a 1850 setpoint ⇒ 6 whole subgroups of 5. */
const silverPoints = () =>
  Array.from({ length: 30 }, (_, i) => ({
    event_time: `2026-09-01 0${Math.floor(i / 10)}:${String(i % 10).padStart(2, "0")}:00.000 UTC`,
    value: 1850 + ((i % 5) - 2) * 0.4,
    setpoint: 1850,
  }));

test("toSpcDetail: gold capability verbatim, silver dots, derived R limits", () => {
  const rows = mkRow(
    SELECTION.machine,
    SELECTION.recipe,
    SELECTION.parameter,
    ["Critical", "Critical", "Healthy", "Healthy"],
    [1.0830672074217869, 0.9145214309002352, 1.0340517887149276, 0.8987983585554516],
  );
  const detail = toSpcDetail(rows, {
    points: silverPoints(),
    limits: { valid: true, ucl: 1852, cl: 1850, lcl: 1848, reason: null, baseline_date: "2026-09-09", baseline_on_or_before: false },
    snapshot: "2026-09-01",
    scope: DETAIL_SCOPE,
    selection: SELECTION,
  });
  // Gold is served as stored: Pp does not reproduce from these points and is
  // never recomputed from them.
  assert.equal(detail.capability.pp.value, 1.0340517887149276);
  assert.equal(detail.capability.headline_status, "Critical");

  assert.equal(detail.measurement.source, "silver.fct_production_data_vmi_maxx");
  assert.equal(detail.measurement.value_column, "belt1_length");
  assert.equal(detail.measurement.readings, 30);
  assert.equal(detail.measurement.subgroups, 6);
  assert.equal(detail.measurement.subgroup_size, 5);
  assert.deepEqual(detail.measurement.scope, DETAIL_SCOPE);

  assert.equal(detail.x_chart.points.length, 6);
  assert.equal(detail.x_chart.cl, 1850);
  assert.equal(detail.x_chart.limits_source, "gold baseline");
  assert.equal(detail.x_chart.baseline_on_or_before, false);
  assert.equal(detail.x_chart.subgroup_size, 5);
  // Athena's ".000 UTC" suffix is trimmed on the way out.
  assert.equal(detail.x_chart.points[0].time, "2026-09-01 00:04:00");

  assert.equal(detail.r_chart.points.length, 6);
  assert.equal(detail.r_chart.limits_source, "derived (D3/D4 from R-bar)");
  assert.equal(detail.r_chart.lcl, 0);

  // Belt 1 Length is the one documented tolerance: 1850 ± 5.
  assert.equal(detail.histogram.spec_limits_available, true);
  assert.equal(detail.histogram.usl, 1855);
  assert.equal(detail.histogram.lsl, 1845);
  assert.equal(detail.histogram.tolerance_provenance, "documented");
  assert.equal(detail.histogram.spec_note, null);
});

test("toSpcDetail: invalid gold limit pair → points plot, Nelson skipped", () => {
  const rows = mkRow(SELECTION.machine, SELECTION.recipe, SELECTION.parameter, ["Critical", "Critical", "Critical", "Critical"], [1, 1, 1, 1]);
  const detail = toSpcDetail(rows, {
    points: silverPoints(),
    limits: validateLimits(1857.218, 2278.178),
    snapshot: "2026-09-01",
    scope: DETAIL_SCOPE,
    selection: SELECTION,
  });
  assert.equal(detail.x_chart.limits_valid, false);
  assert.equal(detail.x_chart.points.length, 6, "the dots still plot");
  assert.equal(detail.x_chart.points[0].z, null, "no centre ⇒ no z");
  assert.deepEqual(detail.x_chart.nelson, []);
  assert.deepEqual(detail.x_chart.alerts, []);
  assert.match(detail.x_chart.limits_note, /not above LCL/);
  // The R chart is self-contained, so it still evaluates.
  assert.equal(detail.r_chart.limits_valid, true);
});

test("toSpcDetail: a parameter with no tolerance draws no spec window", () => {
  const sel = { ...SELECTION, parameter: "Belt 1 Splice" };
  const rows = mkRow(sel.machine, sel.recipe, sel.parameter, ["Healthy", "Healthy", "Healthy", "Healthy"], [2, 2, 2, 2]);
  const detail = toSpcDetail(rows, {
    points: silverPoints(),
    limits: validateLimits(12, 8),
    snapshot: "2026-09-01",
    scope: DETAIL_SCOPE,
    selection: sel,
  });
  assert.equal(detail.histogram.spec_limits_available, false);
  assert.equal(detail.histogram.usl, null);
  assert.match(detail.histogram.spec_note, /spec limits not drawn/);
});

test("toSpcDetail: no silver readings for the combo → insufficient, no charts", () => {
  const rows = mkRow(SELECTION.machine, SELECTION.recipe, SELECTION.parameter, ["Healthy", "Healthy", "Healthy", "Healthy"], [2, 2, 2, 2]);
  const detail = toSpcDetail(rows, {
    points: [],
    limits: validateLimits(12, 8),
    snapshot: "2026-09-01",
    scope: DETAIL_SCOPE,
    selection: SELECTION,
  });
  assert.equal(detail.x_chart, undefined);
  assert.equal(detail.capability.sample_size, 0);
  assert.match(detail.insufficient.reason, /no silver measurements/);
});

test("toSpcDetail: an unmapped machine says so rather than charting nothing", () => {
  const sel = { machine: "NOT_A_MACHINE", recipe: "R", parameter: "Belt 1 Length" };
  const detail = toSpcDetail([], {
    points: [],
    limits: validateLimits(12, 8),
    snapshot: "2026-09-01",
    scope: DETAIL_SCOPE,
    selection: sel,
  });
  assert.equal(detail.measurement.source, null);
  assert.match(detail.insufficient.reason, /not mapped to a silver source/);
  assert.equal(detail.capability.headline_status, "Insufficient Data");
});

/* ----------------------- silver board query ---------------------- */

const BOARD_SRC = sourceForMachine("VMIEXXIUM02");
const BOARD_PARAMS = paramsForSource(BOARD_SRC);
const BOARD_SCOPE = { size: 5, points: 60 };

test("silverBoardQuery: thins to `points` per machine+recipe, in SQL", () => {
  // A month of untouched subgroups is ~10 MB per table — past the upstream
  // response ceiling, which came back as one error and blanked every card
  // on the board. The stride has to be applied before the wire, not after.
  const sql = silverBoardQuery(BOARD_SRC, BOARD_PARAMS, BOARD_SCOPE);
  assert.match(
    sql,
    /WHERE \(rn2 - 1\) % GREATEST\(CAST\(CEIL\(n_subgroups \/ 60\.0\) AS BIGINT\), 1\) = 0 OR rn2 = n_subgroups/,
  );
  // Whole subgroups only.
  assert.match(sql, /HAVING COUNT\(\*\) = 5/);
});

test("silverBoardQuery: whole history — no date, partition or time window", () => {
  // Gold keeps ~90 days of combos; a one-day silver window left 1,756 of
  // 2,018 cards (2026-10-07) with Cp/Cpk and no chart.
  const sql = silverBoardQuery(BOARD_SRC, BOARD_PARAMS, BOARD_SCOPE);
  assert.equal(/\byear\s*=|\bday\s*=|TIMESTAMP '/.test(sql), false);
  assert.equal(sql.includes("HOUR("), false);
});

test("silverBoardQuery: shift narrows to its clock hours on every date", () => {
  const a = silverBoardQuery(BOARD_SRC, BOARD_PARAMS, { ...BOARD_SCOPE, shift: "A" });
  assert.match(a, /HOUR\(event_time\) >= 7 AND HOUR\(event_time\) < 15/);
  const c = silverBoardQuery(BOARD_SRC, BOARD_PARAMS, { ...BOARD_SCOPE, shift: "C" });
  assert.match(c, /\(HOUR\(event_time\) >= 23 OR HOUR\(event_time\) < 7\)/);
});

test("silverBoardQuery: the untouched totals ride along, per parameter", () => {
  // Thinned rows cannot be counted for the card's "N subgroups · M
  // readings" — a parameter that is null in some subgroups has its own
  // total, so one shared count would overstate it.
  const sql = silverBoardQuery(BOARD_SRC, BOARD_PARAMS, BOARD_SCOPE);
  assert.match(
    sql,
    /COUNT\(\*\) OVER \(PARTITION BY machine, recipe\) AS n_subgroups/,
  );
  for (const p of Object.values(BOARD_PARAMS)) {
    assert.match(
      sql,
      new RegExp(
        `COUNT\\(${p.valueColumn}\\) OVER \\(PARTITION BY machine, recipe\\) AS n_${p.valueColumn}`,
      ),
      `missing window count for ${p.valueColumn}`,
    );
  }
});

test("silverBoardQuery: a single-subgroup group is kept, not divided by zero", () => {
  // CEIL(1 / 60.0) is 1, but GREATEST(..., 1) is what stops a stride of 0
  // throwing for any `points` a caller passes.
  const sql = silverBoardQuery(BOARD_SRC, BOARD_PARAMS, {
    ...BOARD_SCOPE,
    points: 0,
  });
  assert.match(sql, /GREATEST\(CAST\(CEIL\(n_subgroups \/ 0\.0\) AS BIGINT\), 1\)/);
  // The last subgroup is kept whatever the stride, so the sparkline ends
  // at the newest reading.
  assert.match(sql, /OR rn2 = n_subgroups/);
});

test('silverBoardQuery: "All" is the absence of a recipe filter, not a value', () => {
  const all = silverBoardQuery(BOARD_SRC, BOARD_PARAMS, {
    ...BOARD_SCOPE,
    recipe: "All",
  });
  assert.equal(all.includes("item_code = 'All'"), false);
  const one = silverBoardQuery(BOARD_SRC, BOARD_PARAMS, {
    ...BOARD_SCOPE,
    recipe: "185/65R15-TAXIMAX-88H-TL-VMIMAXX",
  });
  assert.match(one, /item_code = '185\/65R15-TAXIMAX-88H-TL-VMIMAXX'/);
});

/* --------------------- silver detail readings -------------------- */

const POINTS_SRC = resolveSilver("VMI_MAXX_02", "Tread Length");
const POINTS_SCOPE = {
  machine: "VMI_MAXX_02",
  recipe: "165/70R14-TAXIMAX-81S-TL-VMIMAXX",
};

test("silverMonthsQuery: lists the combo's month partitions, oldest first", () => {
  const sql = silverMonthsQuery(POINTS_SRC, POINTS_SCOPE);
  assert.match(sql, /^SELECT DISTINCT year, month FROM silver\.fct_production_data_vmi_maxx /);
  assert.match(sql, /UPPER\(machine_no\) = 'VMI_MAXX_02'/);
  assert.match(sql, /item_code = '165\/70R14-TAXIMAX-81S-TL-VMIMAXX'/);
  assert.match(sql, /tread_length IS NOT NULL/);
  assert.match(sql, /ORDER BY year, month$/);
});

test("silverPointsQuery: one month partition, ordered, no day or time window", () => {
  // Whole history in one call is past the upstream response ceiling for the
  // largest combos (~120k readings); one month (≤ ~40k) fits.
  const sql = silverPointsQuery(POINTS_SRC, { ...POINTS_SCOPE, year: 2026, month: 9 });
  assert.match(sql, /WHERE year = 2026 AND month = 9 AND /);
  assert.equal(/\bday\s*=|TIMESTAMP '/.test(sql), false);
  assert.match(sql, /ORDER BY event_time$/);
});

test("silverPointsQuery: shift C wraps midnight; All adds no hour filter", () => {
  const c = silverPointsQuery(POINTS_SRC, { ...POINTS_SCOPE, shift: "C", year: 2026, month: 9 });
  assert.match(c, /\(HOUR\(event_time\) >= 23 OR HOUR\(event_time\) < 7\)/);
  const all = silverPointsQuery(POINTS_SRC, { ...POINTS_SCOPE, shift: "All", year: 2026, month: 9 });
  assert.equal(all.includes("HOUR("), false);
});

test("silverPointsQuery: partition values are coerced to numbers, not injected", () => {
  const sql = silverPointsQuery(POINTS_SRC, { ...POINTS_SCOPE, year: "2026", month: "9; DROP" });
  assert.match(sql, /WHERE year = 2026 AND month = NaN AND /);
  assert.equal(sql.includes("DROP"), false);
});

test("buildDistribution: a whole-history combo (150k readings) does not overflow the stack", () => {
  // Math.min(...values) threw "Maximum call stack size exceeded" on the
  // largest combo (~120k readings) once silver stopped being windowed.
  const values = Array.from({ length: 150_000 }, (_, i) => 10 + (i % 100) / 100);
  const dist = buildDistribution(values, {});
  assert.equal(dist.bins.reduce((s, b) => s + b.count, 0), values.length);
  assert.equal(dist.bins[0].from, 10);
});
