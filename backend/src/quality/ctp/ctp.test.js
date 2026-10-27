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
import { processSummaryQuery, processTrendQuery } from "./queries.js";
import { toProcessSummary, toProcessTrend } from "./transform.js";

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

test("processSummaryQuery: one scoped query for cards + drills", () => {
  const sql = processSummaryQuery({
    goldTyreType: "Both",
    goldGranularity: "MONTH",
    anchor: "2026-09-01",
    sparkFrom: "2026-05-01",
  });
  assert.match(sql, /FROM gold\.ctp_gold/);
  assert.match(sql, /UPPER\(plant\) = 'CHENNAI'/);
  assert.match(sql, /product_type = 'Process Audit'/);
  assert.match(sql, /tyre_type = 'Both'/);
  assert.match(sql, /granularity = 'MONTH'/);
  assert.match(
    sql,
    /kpi_name IN \('PQR', 'Audit_Compliance', 'MQV', 'Audit_Deviation', 'CPC'\) AND date BETWEEN DATE '2026-05-01' AND DATE '2026-09-01'/,
  );
  assert.match(sql, /'CPC_Parameter'\) AND date = DATE '2026-09-01'/);
  assert.doesNotMatch(sql, /ROW_NUMBER/);
});

test("processTrendQuery escapes literals", () => {
  const sql = processTrendQuery({
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
    ["pqr", "audit", "mqv", "ndev", "cpc"],
  );
});

test("toProcessSummary: PQR drill orders processes and zero-fills counts", () => {
  const { drills } = toProcessSummary(ROWS, { anchor: SEP, grain: "MONTH" });
  assert.deepEqual(drills.pqr.processes, [
    {
      process: "RMS",
      rating: 97.46,
      violations: 0,
      scheduled: 0,
      completed: 0,
    },
    {
      process: "Curing",
      rating: 88.15,
      violations: 68,
      scheduled: 60,
      completed: 59,
    },
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

test("toProcessTrend drops empty values", () => {
  assert.deepEqual(
    toProcessTrend([
      { date: "2026-10-01", actual_value: "99" },
      { date: "2026-10-02", actual_value: "" },
    ]),
    { points: [{ date: "2026-10-01", value: 99 }] },
  );
});
