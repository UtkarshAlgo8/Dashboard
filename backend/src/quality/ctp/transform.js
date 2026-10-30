/**
 * Row → response transformers for the CTP Quality Process and Product tabs.
 *
 * Values are echoed as stored in gold; nothing is re-aggregated except sums
 * of counts (violations, deviations, E-grade tyres), which are additive. A
 * missing count row means zero events; a missing % row means "not measured"
 * and stays null. Column meanings per KPI follow the handoff's "Drill Down
 * Map" (e.g. for SKU tables `itemcode` is the SKU).
 */
import { periodsBack } from "./periods.js";
import { CTP_QUALITY_TABS, PROCESS_ORDER } from "./registry.js";

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Gold text cells can carry stray whitespace (e.g. "TREADLIGHTNESS\r\n").
const blank = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

function processRank(name) {
  const i = PROCESS_ORDER.indexOf(name);
  return i === -1 ? PROCESS_ORDER.length : i;
}

const byProcess = (a, b) =>
  processRank(a.process) - processRank(b.process) ||
  String(a.process).localeCompare(String(b.process));

/** Sort by `field`, lowest first (worst yield first); nulls last. */
const ascBy = (field) => (a, b) =>
  (a[field] ?? Infinity) - (b[field] ?? Infinity);

/** Sort by `field`, highest first (most scrap / defects first). */
const descBy = (field) => (a, b) =>
  (b[field] ?? -Infinity) - (a[field] ?? -Infinity);

/**
 * kpi_name → rows, for the selected period only. Dated KPIs keep every row:
 * the query already limits them to the period, one row per violation date.
 */
function groupAtAnchor(rows, anchor, dated = []) {
  const out = new Map();
  for (const r of rows) {
    if (r.date !== anchor && !dated.includes(r.kpi_name)) continue;
    if (!out.has(r.kpi_name)) out.set(r.kpi_name, []);
    out.get(r.kpi_name).push(r);
  }
  return out;
}

const rowsOf = (groups, kpiName) => groups.get(kpiName) ?? [];

/** Value of a KPI that has one row per period (no dimension). */
const scalar = (groups, kpiName) =>
  num(rowsOf(groups, kpiName)[0]?.actual_value);

/**
 * Join several KPIs that share a dimension into one table.
 *
 * @param {Map} groups
 * @param {Record<string, string>} columns output field → kpi_name
 * @param {(r: object) => object|null} identity the row's key fields, or null
 *   to skip the row; rows with equal identities are merged.
 * @param {string[]} counts fields that default to 0 instead of null
 */
function joinKpis(groups, columns, identity, counts = []) {
  const out = new Map();
  for (const [field, kpiName] of Object.entries(columns)) {
    for (const r of rowsOf(groups, kpiName)) {
      const id = identity(r);
      if (!id) continue;
      const key = JSON.stringify(id);
      if (!out.has(key)) out.set(key, { ...id });
      out.get(key)[field] = num(r.actual_value);
    }
  }
  return [...out.values()].map((row) => {
    for (const field of Object.keys(columns)) {
      if (row[field] === undefined)
        row[field] = counts.includes(field) ? 0 : null;
    }
    return row;
  });
}

const bySection = (r) =>
  blank(r.section) ? { process: blank(r.section) } : null;
const bySku = (r) => (blank(r.itemcode) ? { sku: blank(r.itemcode) } : null);
const byMachine = (r) =>
  blank(r.machine) ? { machine: blank(r.machine) } : null;

function processTable(groups, columns, counts) {
  return joinKpis(groups, columns, bySection, counts).sort(byProcess);
}

/** One-KPI SKU table, worst value first. */
function skuTable(groups, kpiName, field, sort = ascBy) {
  return joinKpis(groups, { [field]: kpiName }, bySku).sort(sort(field));
}

/** Logbook violation rows (MQV / deviation / failed checkpoint). */
function detailRows(groups, kpiName, subKey) {
  return rowsOf(groups, kpiName)
    .map((r) => ({
      process: blank(r.section),
      machine: blank(r.machine),
      machineName: blank(r.itemcode),
      checkpoint: blank(r.remarks),
      [subKey]: blank(r.sub_section),
      count: num(r.actual_value) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || byProcess(a, b));
}

/** Dated violation rows (one per violation date), latest first. */
function datedDetailRows(groups, kpiName, subKey) {
  return rowsOf(groups, kpiName)
    .map((r) => ({
      date: r.date,
      process: blank(r.section),
      machine: blank(r.machine),
      machineName: blank(r.itemcode),
      checkpoint: blank(r.remarks),
      [subKey]: blank(r.sub_section),
      count: num(r.actual_value) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.count - a.count || byProcess(a, b),
    );
}

function cardsFrom(rows, groups, { anchor, grain }, tab) {
  const { cards, companions } = CTP_QUALITY_TABS[tab];
  // The delta is "vs previous period", so only the period right before the
  // anchor counts; a gap (no audits that day) means no delta, not an older one.
  const prevDate = periodsBack(anchor, grain, 1);
  return Object.entries(cards).map(([id, kpiName]) => {
    const points = rows
      .filter((r) => r.kpi_name === kpiName)
      .map((r) => ({ date: r.date, value: num(r.actual_value) }))
      .filter((p) => p.value != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    const current = points.find((p) => p.date === anchor);
    const previous = points.find((p) => p.date === prevDate);
    const card = {
      id,
      kpiName,
      value: current ? current.value : null,
      previous: previous ? previous.value : null,
      spark: points,
    };
    if (companions[id]) {
      card.extra = Object.fromEntries(
        Object.entries(companions[id]).map(([key, name]) => [
          key,
          scalar(groups, name),
        ]),
      );
    }
    return card;
  });
}

/** Process → top MQV checkpoint (summed across machines). */
function topViolations(violations) {
  const perCheckpoint = new Map();
  for (const v of violations) {
    if (v.checkpoint == null) continue;
    const byCheckpoint = perCheckpoint.get(v.process) ?? new Map();
    byCheckpoint.set(
      v.checkpoint,
      (byCheckpoint.get(v.checkpoint) ?? 0) + v.count,
    );
    perCheckpoint.set(v.process, byCheckpoint);
  }
  const top = new Map();
  for (const [process, byCheckpoint] of perCheckpoint) {
    let best = null;
    for (const [checkpoint, n] of byCheckpoint) {
      if (!best || n > best.count) best = { checkpoint, count: n };
    }
    top.set(process, best);
  }
  return top;
}

/** Open CAPA / NC items: one row per NC, overdue first, then oldest. */
function capaItems(groups) {
  return joinKpis(
    groups,
    {
      open: "CAPA_NC_Open",
      overdue: "CAPA_NC_Overdue",
      ageDays: "CAPA_NC_Age_Days",
    },
    (r) =>
      blank(r.itemcode)
        ? {
            nc: blank(r.itemcode),
            process: blank(r.section),
            violation: blank(r.remarks),
            cls: blank(r.sub_section),
          }
        : null,
    ["open", "overdue"],
  )
    .filter((item) => item.open > 0)
    .map((item) => ({ ...item, overdue: item.overdue > 0 }))
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (b.ageDays ?? 0) - (a.ageDays ?? 0),
    );
}

/**
 * @param {Array<Record<string, string>>} rows Rows from tabSummaryQuery.
 * @param {{ anchor: string, grain: string }} period
 */
export function toProcessSummary(rows, period) {
  const groups = groupAtAnchor(
    rows,
    period.anchor,
    CTP_QUALITY_TABS.process.dated,
  );

  const mqvViolations = datedDetailRows(groups, "MQV_Violation", "capa");
  const topByProcess = topViolations(mqvViolations);

  const deviations = datedDetailRows(
    groups,
    "Audit_Deviation_Parameter",
    "status",
  );
  const devByProcess = new Map();
  for (const d of deviations) {
    const row = devByProcess.get(d.process) ?? {
      process: d.process,
      deviations: 0,
      open: 0,
      closed: 0,
    };
    row.deviations += d.count;
    if (d.status === "Open") row.open += d.count;
    if (d.status === "Closed") row.closed += d.count;
    devByProcess.set(d.process, row);
  }

  return {
    cards: cardsFrom(rows, groups, period, "process"),
    drills: {
      pqr: {
        processes: processTable(
          groups,
          // v2 audit schedule counts are per logbook section, not per
          // process group, so they live in the Audit Compliance drill only.
          { rating: "PQR_Process", violations: "Audit_Violations_Process" },
          ["violations"],
        ),
        failedCheckpoints: detailRows(
          groups,
          "PQR_Failed_Checkpoint",
          "severity",
        ),
      },
      audit: {
        // Compliance % is completed / scheduled up to today ("to date"), so
        // the to-date counts sit next to it; `scheduled` is the whole period.
        processes: processTable(
          groups,
          {
            compliance: "Audit_Compliance_Process",
            scheduledToDate: "Audit_Scheduled_MTD_Process",
            completedToDate: "Audit_Completed_MTD_Process",
            pendingToDate: "Audit_Pending_MTD_Process",
            scheduled: "Audit_Scheduled_Process",
          },
          ["scheduledToDate", "completedToDate", "pendingToDate", "scheduled"],
        ),
      },
      mqv: {
        processes: processTable(
          groups,
          {
            mqv: "MQV_Process",
            capaOpen: "MQV_CAPA_Open_Process",
            capaClosed: "MQV_CAPA_Closed_Process",
          },
          ["mqv", "capaOpen", "capaClosed"],
        ).map((row) => ({
          ...row,
          topViolation: topByProcess.get(row.process)?.checkpoint ?? null,
        })),
        violations: mqvViolations,
      },
      ndev: {
        processes: [...devByProcess.values()].sort(byProcess),
        details: deviations,
      },
      cpc: {
        parameters: rowsOf(groups, "CPC_Parameter")
          .map((r) => ({
            process: blank(r.section),
            machine: blank(r.machine),
            parameter: blank(r.remarks),
            compliance: num(r.actual_value),
          }))
          .sort((a, b) => ascBy("compliance")(a, b) || byProcess(a, b)),
      },
      ftq: {
        inspected: scalar(groups, "FTQ_Inspected"),
        rejected: scalar(groups, "FTQ_Rejected"),
        skus: skuTable(groups, "FTQ_SKU", "ftq"),
      },
      spr: {
        production: scalar(groups, "SPR_Production"),
        scrap: scalar(groups, "SPR_Scrap"),
        rework: scalar(groups, "SPR_Rework"),
        skus: skuTable(groups, "SPR_SKU", "spr"),
      },
      capa: { items: capaItems(groups) },
    },
  };
}

/**
 * @param {Array<Record<string, string>>} rows Rows from tabSummaryQuery.
 * @param {{ anchor: string, grain: string }} period
 */
export function toProductSummary(rows, period) {
  const groups = groupAtAnchor(rows, period.anchor);

  const eGradeCells = joinKpis(
    groups,
    { count: "E_Grade_Machine_SKU" },
    (r) =>
      blank(r.machine)
        ? { machine: blank(r.machine), sku: blank(r.itemcode) }
        : null,
    ["count"],
  ).sort(descBy("count"));
  const eGradeMachines = new Map();
  for (const c of eGradeCells) {
    const m = eGradeMachines.get(c.machine) ?? {
      machine: c.machine,
      count: 0,
      sizes: 0,
    };
    m.count += c.count;
    m.sizes += 1;
    eGradeMachines.set(c.machine, m);
  }

  // DBM yield is a % per machine × size; a machine-level % cannot be
  // rebuilt from it, so the machine row shows its weakest size instead.
  const dbmCells = joinKpis(groups, { yield: "DBM_Yield_Machine_SKU" }, (r) =>
    blank(r.machine)
      ? { machine: blank(r.machine), sku: blank(r.itemcode) }
      : null,
  ).sort(ascBy("yield"));
  const dbmMachines = new Map();
  for (const c of dbmCells) {
    const m = dbmMachines.get(c.machine) ?? {
      machine: c.machine,
      sizes: 0,
      lowest: null,
    };
    m.sizes += 1;
    if (c.yield != null && (m.lowest == null || c.yield < m.lowest)) {
      m.lowest = c.yield;
    }
    dbmMachines.set(c.machine, m);
  }

  return {
    cards: cardsFrom(rows, groups, period, "product"),
    drills: {
      uy: {
        machines: joinKpis(
          groups,
          {
            yield: "Uniformity_Yield_Machine",
            tested: "Uniformity_Tested_Machine",
            passed: "Uniformity_Passed_Machine",
          },
          byMachine,
          ["tested", "passed"],
        ).sort(ascBy("yield")),
        skus: skuTable(groups, "Uniformity_Yield_SKU", "yield"),
      },
      fvi: { skus: skuTable(groups, "First_Line_VI_Yield_SKU", "yield") },
      sl: {
        skus: joinKpis(
          groups,
          {
            yield: "Second_Line_Yield_SKU",
            inspected: "Second_Line_Inspected_SKU",
          },
          bySku,
          ["inspected"],
        ).sort(ascBy("yield")),
        defects: rowsOf(groups, "Second_Line_Defect")
          .map((r) => ({
            category: blank(r.sub_section),
            sku: blank(r.itemcode),
            defect: blank(r.remarks),
            count: num(r.actual_value) ?? 0,
          }))
          .sort(descBy("count")),
      },
      eg: {
        machines: [...eGradeMachines.values()].sort(descBy("count")),
        cells: eGradeCells,
      },
      sc: {
        skus: skuTable(groups, "Product_Scrap_Pct_SKU", "scrapPct", descBy),
        defects: rowsOf(groups, "Product_Scrap_Defect")
          .map((r) => ({
            sku: blank(r.itemcode),
            defectArea: blank(r.sub_section),
            press: blank(r.machine),
            defect: blank(r.remarks),
            count: num(r.actual_value) ?? 0,
          }))
          .sort(descBy("count")),
      },
      gtw: {
        machines: joinKpis(
          groups,
          {
            within1: "GT_Weight_Machine",
            within2: "GT_Weight_Within_2pct_Machine",
            within3: "GT_Weight_Within_3pct_Machine",
          },
          byMachine,
        ).sort(ascBy("within1")),
        skus: joinKpis(
          groups,
          {
            weighed: "GT_Weighed_SKU",
            within1: "GT_Weight_SKU",
            within2: "GT_Weight_Within_2pct_SKU",
            within3: "GT_Weight_Within_3pct_SKU",
          },
          bySku,
          ["weighed"],
        ).sort(ascBy("within1")),
      },
      dbm: {
        machines: [...dbmMachines.values()].sort(ascBy("lowest")),
        cells: dbmCells,
      },
      dy: { skus: skuTable(groups, "Dispatch_Yield_SKU", "yield") },
      oe: {
        skus: joinKpis(
          groups,
          {
            yield: "OE_Yield_SKU",
            graded: "OE_Graded_SKU",
            passed: "OE_Passed_SKU",
          },
          (r) =>
            blank(r.itemcode)
              ? { sku: blank(r.itemcode), oem: blank(r.remarks) }
              : null,
          ["graded", "passed"],
        ).sort(ascBy("yield")),
        oems: joinKpis(groups, { yield: "OE_Yield_OEM" }, (r) =>
          blank(r.sub_section) ? { oem: blank(r.sub_section) } : null,
        ).sort(ascBy("yield")),
      },
      bay: {
        lines: joinKpis(
          groups,
          {
            checked: "Bay_Area_Checked",
            rejections: "Bay_Area_Rejections",
            dispatched: "Bay_Area_Dispatched",
          },
          (r) => (blank(r.machine) ? { line: blank(r.machine) } : null),
          ["checked", "rejections", "dispatched"],
        ),
        reasons: rowsOf(groups, "Bay_Area_Rejection_Reason")
          .map((r) => ({
            category: blank(r.sub_section),
            line: blank(r.machine),
            reason: blank(r.remarks),
            count: num(r.actual_value) ?? 0,
          }))
          .sort(descBy("count")),
      },
    },
  };
}

export const TAB_TRANSFORMS = Object.freeze({
  process: toProcessSummary,
  product: toProductSummary,
});

/** Trend rows → `{ points: [{ date, value }] }` for the trend pop-up. */
export function toProcessTrend(rows) {
  return {
    points: rows
      .map((r) => ({ date: r.date, value: num(r.actual_value) }))
      .filter((p) => p.value != null),
  };
}
