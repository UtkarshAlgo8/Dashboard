/**
 * CTP Quality Process tab: period math, SQL builders and the row → response
 * transformer. Pure units; no upstream calls.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  isCurrentPeriod,
  isIsoDate,
  periodsBack,
  resolvePeriod,
} from "./periods.js";
import { tabSummaryQuery, trendQuery } from "./queries.js";
import {
  toProcessSummary,
  toProcessTrend,
  toProductSummary,
} from "./transform.js";

/* ---------------------------- periods ---------------------------- */

test("resolvePeriod: Day, Shift, Month and Year map to stored grains", () => {
  assert.deepEqual(resolvePeriod({ granularity: "DAY", date: "2026-10-27" }), {
    grain: "DAY",
    goldGranularity: "DAY",
    anchor: "2026-10-27",
    sparkFrom: "2026-10-23",
  });
  assert.equal(
    resolvePeriod({ granularity: "DAY", date: "2026-10-27", shift: "b" })
      .goldGranularity,
    "SHIFT B",
  );
  assert.deepEqual(
    resolvePeriod({ granularity: "MONTH", date: "2026-10-27", shift: "A" }),
    {
      grain: "MONTH",
      goldGranularity: "MONTH",
      anchor: "2026-10-01",
      sparkFrom: "2026-06-01",
    },
  );
  assert.equal(
    resolvePeriod({ granularity: "YEAR", date: "2026-10-27" }).sparkFrom,
    "2022-01-01",
  );
});

test("resolvePeriod: rejects bad grain, date and shift", () => {
  assert.ok(resolvePeriod({ granularity: "WEEK", date: "2026-10-27" }).error);
  assert.ok(resolvePeriod({ granularity: "DAY", date: "2026-02-30" }).error);
  assert.ok(resolvePeriod({ granularity: "DAY", date: "27-10-2026" }).error);
  assert.ok(
    resolvePeriod({ granularity: "DAY", date: "2026-10-27", shift: "D" }).error,
  );
});

test("periodsBack crosses month and year ends", () => {
  assert.equal(periodsBack("2026-03-01", "MONTH", 4), "2025-11-01");
  assert.equal(periodsBack("2026-01-02", "DAY", 4), "2025-12-29");
});

test("isCurrentPeriod: open periods and those ended yesterday use the short TTL", () => {
  assert.equal(isCurrentPeriod("2026-10-01", "MONTH", "2026-10-27"), true);
  assert.equal(isCurrentPeriod("2026-09-01", "MONTH", "2026-10-27"), false);
  assert.equal(isCurrentPeriod("2026-09-01", "MONTH", "2026-10-01"), true);
  assert.equal(isCurrentPeriod("2026-10-26", "DAY", "2026-10-27"), true);
  assert.equal(isCurrentPeriod("2026-10-25", "DAY", "2026-10-27"), false);
  assert.equal(isCurrentPeriod("2026-01-01", "YEAR", "2026-10-27"), true);
  assert.equal(isCurrentPeriod("2025-01-01", "YEAR", "2026-01-01"), true);
  assert.equal(isCurrentPeriod("2025-01-01", "YEAR", "2026-01-02"), false);
});

test("isIsoDate", () => {
  assert.equal(isIsoDate("2026-10-27"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate(undefined), false);
});

/* ----------------------------- queries ----------------------------- */

test("tabSummaryQuery: one scoped query for cards + drills", () => {
  const sql = tabSummaryQuery("process", {
    goldTyreType: "Both",
    goldGranularity: "MONTH",
    anchor: "2026-09-01",
    sparkFrom: "2026-05-01",
  });
  assert.match(sql, /FROM gold\.ctp_gold/);
  assert.match(sql, /UPPER\(plant\) = 'CHENNAI'/);
  assert.match(sql, /department = 'Quality'/);
  assert.match(sql, /category = 'Process'/);
  assert.doesNotMatch(sql, /product_type/);
  assert.match(sql, /tyre_type = 'Both'/);
  assert.match(sql, /granularity = 'MONTH'/);
  assert.match(
    sql,
    /kpi_name IN \('PQR', 'Audit_Compliance', 'MQV', 'Audit_Deviation', 'CPC', 'FTQ', 'SPR', 'Open_CAPA_NC'\) AND date BETWEEN DATE '2026-05-01' AND DATE '2026-09-01'/,
  );
  assert.match(sql, /\('Open_CAPA_NC_Overdue', 'PQR_Process'/);
  assert.match(sql, /'CAPA_NC_Age_Days'\) AND date = DATE '2026-09-01'/);
  assert.doesNotMatch(sql, /ROW_NUMBER/);
});

test("tabSummaryQuery: product tab reads the Product category", () => {
  const sql = tabSummaryQuery("product", {
    goldTyreType: "TBR",
    goldGranularity: "DAY",
    anchor: "2026-10-27",
    sparkFrom: "2026-10-23",
  });
  assert.match(sql, /category = 'Product'/);
  assert.match(sql, /'Uniformity_Yield', 'First_Line_VI_Yield'/);
  assert.match(sql, /'GT_Weight_Within_2pct', 'GT_Weight_Within_3pct'/);
});

test("trendQuery escapes literals", () => {
  const sql = trendQuery({
    kpiName: "PQR",
    goldTyreType: "PCR",
    goldGranularity: "SHIFT A",
    from: "2026-10-01",
    to: "2026-10-27",
  });
  assert.match(sql, /kpi_name = 'PQR'/);
  assert.match(sql, /granularity = 'SHIFT A'/);
  assert.match(sql, /ORDER BY date$/);
});

/* ---------------------------- transform ---------------------------- */

const row = (date, kpi_name, actual_value, extra = {}) => ({
  date,
  kpi_name,
  actual_value: String(actual_value),
  section: "",
  sub_section: "Process Audit",
  machine: "",
  remarks: "",
  ...extra,
});

const SEP = "2026-09-01";
const ROWS = [
  row("2026-08-01", "PQR", 94.1),
  row(SEP, "PQR", 95.04),
  row(SEP, "MQV", 60),
  row(SEP, "PQR_Process", 88.15, { section: "Curing" }),
  row(SEP, "PQR_Process", 97.46, { section: "RMS" }),
  row(SEP, "Audit_Violations_Process", 68, { section: "Curing" }),
  row(SEP, "Audit_Scheduled_Process", 60, { section: "Curing" }),
  row(SEP, "Audit_Completed_Process", 59, { section: "Curing" }),
  row(SEP, "PQR_Failed_Checkpoint", 1, {
    section: "Curing",
    sub_section: "Major",
    machine: "5101",
    remarks: "Bladder pressure",
  }),
  row(SEP, "PQR_Failed_Checkpoint", 3, {
    section: "RMS",
    sub_section: "Minor",
    machine: "1901",
    remarks: "Cooling Unit Temperature",
  }),
  row(SEP, "MQV_Process", 28, { section: "Curing" }),
  row(SEP, "MQV_CAPA_Open_Process", 27, { section: "Curing" }),
  row(SEP, "MQV_CAPA_Closed_Process", 1, { section: "Curing" }),
  row(SEP, "MQV_Violation", 2, {
    section: "Curing",
    sub_section: "Open",
    machine: "5101",
    remarks: "Dirty sidewall",
  }),
  row(SEP, "MQV_Violation", 1, {
    section: "Curing",
    sub_section: "Closed",
    machine: "5102",
    remarks: "Dirty sidewall",
  }),
  row(SEP, "MQV_Violation", 2, {
    section: "Curing",
    sub_section: "Open",
    machine: "5103",
    remarks: "Cure time",
  }),
  row(SEP, "Audit_Deviation_Parameter", 2, {
    section: "Mixing",
    sub_section: "Open",
    machine: "2101",
    remarks: "Dump temp",
  }),
  row(SEP, "Audit_Deviation_Parameter", 1, {
    section: "Mixing",
    sub_section: "Closed",
    machine: "2102",
    remarks: "Dump temp",
  }),
  row(SEP, "CPC_Parameter", 100, {
    section: "Mixing",
    machine: "2101",
    remarks: "Mooney",
  }),
  row(SEP, "CPC_Parameter", 96.5, {
    section: "Curing",
    machine: "5101",
    remarks: "Cure temp",
  }),
];

test("toProcessSummary: cards carry value, previous and sparkline", () => {
  const { cards } = toProcessSummary(ROWS, { anchor: SEP, grain: "MONTH" });
  const pqr = cards.find((c) => c.id === "pqr");
  assert.equal(pqr.value, 95.04);
  assert.equal(pqr.previous, 94.1);
  assert.deepEqual(
    pqr.spark.map((p) => p.date),
    ["2026-08-01", SEP],
  );
  const cpc = cards.find((c) => c.id === "cpc");
  assert.equal(cpc.value, null); // no row → not measured, never 0
  assert.deepEqual(
    cards.map((c) => c.id),
    ["pqr", "audit", "mqv", "ndev", "cpc", "ftq", "spr", "capa"],
  );
});

test("toProcessSummary: PQR drill orders processes and zero-fills counts", () => {
  const { drills } = toProcessSummary(ROWS, { anchor: SEP, grain: "MONTH" });
  assert.deepEqual(drills.pqr.processes, [
    { process: "RMS", rating: 97.46, violations: 0 },
    { process: "Curing", rating: 88.15, violations: 68 },
  ]);
  assert.equal(drills.pqr.failedCheckpoints[0].count, 3);
  assert.equal(drills.pqr.failedCheckpoints[0].severity, "Minor");
});

test("toProcessSummary: MQV top violation sums across machines", () => {
  const { drills } = toProcessSummary(ROWS, { anchor: SEP, grain: "MONTH" });
  assert.equal(drills.mqv.processes[0].topViolation, "Dirty sidewall");
  assert.equal(drills.mqv.processes[0].capaOpen, 27);
  assert.equal(drills.mqv.violations.length, 3);
});

test("toProcessSummary: deviations grouped by process, CPC worst first", () => {
  const { drills } = toProcessSummary(ROWS, { anchor: SEP, grain: "MONTH" });
  assert.deepEqual(drills.ndev.processes, [
    { process: "Mixing", deviations: 3, open: 2, closed: 1 },
  ]);
  assert.equal(drills.ndev.details.length, 2);
  assert.deepEqual(
    drills.cpc.parameters.map((p) => p.compliance),
    [96.5, 100],
  );
});

test("toProcessSummary: drill rows ignore spark-window dates", () => {
  const rows = [
    ...ROWS,
    row("2026-08-01", "MQV_Process", 9, { section: "RMS" }),
  ];
  const { drills } = toProcessSummary(rows, { anchor: SEP, grain: "MONTH" });
  assert.equal(
    drills.mqv.processes.some((p) => p.process === "RMS"),
    false,
  );
});

test("toProcessSummary: delta only against the period right before", () => {
  const rows = [row("2026-10-23", "PQR", 90), row("2026-10-26", "PQR", 95)];
  const day = toProcessSummary(rows, { anchor: "2026-10-26", grain: "DAY" });
  assert.equal(day.cards[0].value, 95);
  assert.equal(day.cards[0].previous, null); // 25-Oct has no audits
  const next = toProcessSummary([...rows, row("2026-10-27", "PQR", 97)], {
    anchor: "2026-10-27",
    grain: "DAY",
  });
  assert.equal(next.cards[0].previous, 95);
});

test("toProcessSummary: a null checkpoint never becomes 'null'", () => {
  const rows = [
    row(SEP, "MQV_Process", 3, { section: "Mixing" }),
    row(SEP, "MQV_Violation", 3, {
      section: "Mixing",
      sub_section: "Open",
      machine: "2101",
      remarks: "",
    }),
  ];
  const { drills } = toProcessSummary(rows, { anchor: SEP, grain: "MONTH" });
  assert.equal(drills.mqv.processes[0].topViolation, null);
});

test("toProcessSummary: audit drill pairs compliance with to-date counts", () => {
  const rows = [
    row(SEP, "Audit_Compliance_Process", 82.76, { section: "Calendaring" }),
    row(SEP, "Audit_Scheduled_MTD_Process", 58, { section: "Calendaring" }),
    row(SEP, "Audit_Completed_MTD_Process", 48, { section: "Calendaring" }),
    row(SEP, "Audit_Scheduled_Process", 60, { section: "Calendaring" }),
  ];
  const { drills } = toProcessSummary(rows, { anchor: SEP, grain: "MONTH" });
  assert.deepEqual(drills.audit.processes, [
    {
      process: "Calendaring",
      compliance: 82.76,
      scheduledToDate: 58,
      completedToDate: 48,
      pendingToDate: 0,
      scheduled: 60,
    },
  ]);
});

test("toProcessSummary: FTQ / SPR counts, SKUs worst first, CAPA card extra", () => {
  const rows = [
    row(SEP, "FTQ", 92.72, { section: "Curing" }),
    row(SEP, "FTQ_Inspected", 491485, { section: "Curing" }),
    row(SEP, "FTQ_Rejected", 35763, { section: "Curing" }),
    row(SEP, "FTQ_SKU", 100, { itemcode: "CTCP1326" }),
    row(SEP, "FTQ_SKU", 81.5, { itemcode: "CTCP1700" }),
    row(SEP, "SPR_Production", 491594),
    row(SEP, "Open_CAPA_NC", 145),
    row(SEP, "Open_CAPA_NC_Overdue", 120),
  ];
  const { cards, drills } = toProcessSummary(rows, {
    anchor: SEP,
    grain: "MONTH",
  });
  assert.equal(cards.find((c) => c.id === "ftq").value, 92.72);
  assert.deepEqual(cards.find((c) => c.id === "capa").extra, { overdue: 120 });
  assert.equal(drills.ftq.inspected, 491485);
  assert.deepEqual(
    drills.ftq.skus.map((s) => s.sku),
    ["CTCP1700", "CTCP1326"],
  );
  assert.equal(drills.spr.production, 491594);
  assert.equal(drills.spr.scrap, null);
});

test("toProcessSummary: CAPA items are open NCs, overdue first, then oldest", () => {
  const nc = (no, kpi, v, extra = {}) =>
    row(SEP, kpi, v, {
      itemcode: no,
      section: "Mixing",
      sub_section: "MQV",
      remarks: `Violation ${no}`,
      machine: "883A00CB-OWNER",
      ...extra,
    });
  const rows = [
    nc("NC-1", "CAPA_NC_Open", 1),
    nc("NC-1", "CAPA_NC_Overdue", 0),
    nc("NC-1", "CAPA_NC_Age_Days", 3),
    nc("NC-2", "CAPA_NC_Open", 1),
    nc("NC-2", "CAPA_NC_Overdue", 1),
    nc("NC-2", "CAPA_NC_Age_Days", 20),
    nc("NC-3", "CAPA_NC_Open", 0),
    nc("NC-3", "CAPA_NC_Age_Days", 40),
  ];
  const { drills } = toProcessSummary(rows, { anchor: SEP, grain: "MONTH" });
  assert.deepEqual(drills.capa.items, [
    {
      nc: "NC-2",
      process: "Mixing",
      violation: "Violation NC-2",
      cls: "MQV",
      open: 1,
      overdue: true,
      ageDays: 20,
    },
    {
      nc: "NC-1",
      process: "Mixing",
      violation: "Violation NC-1",
      cls: "MQV",
      open: 1,
      overdue: false,
      ageDays: 3,
    },
  ]);
});

const prow = (kpi_name, actual_value, extra = {}) =>
  row(SEP, kpi_name, actual_value, {
    sub_section: "Product Quality",
    ...extra,
  });

test("toProductSummary: cards, GT companions and waiting KPIs", () => {
  const rows = [
    row("2026-08-01", "Uniformity_Yield", 92.5),
    prow("Uniformity_Yield", 93.62),
    prow("GT_Weight_Within_1pct", 64.65),
    prow("GT_Weight_Within_2pct", 91.97),
    prow("GT_Weight_Within_3pct", 98.14),
  ];
  const { cards } = toProductSummary(rows, { anchor: SEP, grain: "MONTH" });
  assert.deepEqual(
    cards.map((c) => c.id),
    ["uy", "fvi", "sl", "eg", "sc", "gtw", "dbm", "dy", "oe", "bay"],
  );
  const uy = cards.find((c) => c.id === "uy");
  assert.equal(uy.value, 93.62);
  assert.equal(uy.previous, 92.5);
  assert.deepEqual(cards.find((c) => c.id === "gtw").extra, {
    within2: 91.97,
    within3: 98.14,
  });
  const dbm = cards.find((c) => c.id === "dbm");
  assert.equal(dbm.value, null);
  assert.deepEqual(dbm.spark, []); // waiting for silver: no rows at all
});

test("toProductSummary: machine and SKU drills", () => {
  const rows = [
    prow("Uniformity_Yield_Machine", 95.21, { machine: "30-349" }),
    prow("Uniformity_Tested_Machine", 74759, { machine: "30-349" }),
    prow("Uniformity_Yield_Machine", 99.5, { machine: "TBRTUO" }),
    prow("E_Grade_Machine_SKU", 1302, { machine: "30-350", itemcode: "1503" }),
    prow("E_Grade_Machine_SKU", 853, { machine: "30-350", itemcode: "1513" }),
    prow("E_Grade_Machine_SKU", 401, { machine: "30-349", itemcode: "1513" }),
    prow("Second_Line_Defect", 5966, {
      sub_section: "Downgrade",
      itemcode: "CTCP1325",
      remarks: "TREADLIGHTNESS\r\n",
    }),
    prow("Product_Scrap_Pct_SKU", 0.2, { itemcode: "A" }),
    prow("Product_Scrap_Pct_SKU", 1.4, { itemcode: "B" }),
    prow("GT_Weight_SKU", 97.5, { itemcode: "GT-1" }),
    prow("GT_Weighed_SKU", 120, { itemcode: "GT-1" }),
  ];
  const { drills } = toProductSummary(rows, { anchor: SEP, grain: "MONTH" });
  assert.deepEqual(drills.uy.machines[0], {
    machine: "30-349",
    yield: 95.21,
    tested: 74759,
    passed: 0,
  });
  assert.deepEqual(drills.eg.machines, [
    { machine: "30-350", count: 2155, sizes: 2 },
    { machine: "30-349", count: 401, sizes: 1 },
  ]);
  assert.equal(drills.sl.defects[0].defect, "TREADLIGHTNESS");
  assert.deepEqual(
    drills.sc.skus.map((s) => s.sku),
    ["B", "A"],
  );
  assert.deepEqual(drills.gtw.skus, [
    { sku: "GT-1", weighed: 120, within1: 97.5, within2: null, within3: null },
  ]);
});

test("toProcessTrend drops empty values", () => {
  assert.deepEqual(
    toProcessTrend([
      { date: "2026-10-01", actual_value: "99" },
      { date: "2026-10-02", actual_value: "" },
    ]),
    { points: [{ date: "2026-10-01", value: 99 }] },
  );
});
