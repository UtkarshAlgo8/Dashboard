/**
 * v2 KPI grid transformer — maps raw gold_dummy rows to the
 * frontend KpiCard shape.
 *
 * IMPORTANT: This file mirrors docs/artifact.jsx exactly.
 * KPI IDs, names, drillTypes, section keys all match the artifact.
 * Only the VALUES come from gold_dummy — the UI structure is identical.
 *
 * v2 data shape (confirmed live 2026-05-27):
 *   - dates are ISO yyyy-mm-dd strings
 *   - status carries "Green"/"Yellow"/"Red" per row
 *   - kpi_names are verbatim: "OEE_o", "Availability_o", "Downtime", etc.
 *   - machine="nan" for landing rows
 *
 * NULL sentinel: "nan" is treated as null throughout.
 */

const NAN = "nan";

function denan(v) {
  return v === NAN ? null : v;
}

export function parseDrillAttribute(raw) {
  if (raw == null || raw === "" || raw === NAN) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/* ---------- KPI allow-list per (section, tab) ----------
 *
 * Keys match artifact SEC ids: MIX, TBM, CUR, STK
 * Tab ids: P, Q, C, M, S
 *
 * Shape: { [sectionId]: { [tabId]: { id, name, unit?, drillType }[] } }
 *   id        = artifact KPI id (slug)
 *   name      = actual gold_dummy kpi_name
 *   unit      = optional unit_of_measurement override
 *   drillType = artifact drillType: "mixOEE" | "mixProd" | "tbmProd" |
 *               "stkProd" | "downtime" | "compliance" | "budget" |
 *               "table" | null (card only)
 */
const ALLOWED_KPIS = {
  // Section keys match gold_dummy section values (Mixing, TBM, Curing, Stock).
  // Tab keys match artifact tab ids (P, Q, C, M, S).
  // KPI names match gold_dummy kpi_name values.
  //
  // Per artifact buildKpis() — each category shows different KPIs:
  //   P: oee, prod, dt, comp
  //   Q: ftq, ds, rw, ncm
  //   C: spc, scrc, bud
  //   M: ab, tq, sg, tr
  //   S: ri, fa, nm, sa
  Mixing: {
    P: [
      { id: "oee", name: "OEE_o", drillType: "mixOEE", drillTargets: ["Availability_o", "Performance_o", "Quality_o", "OEE_m"] },
      { id: "prod", name: "Production", drillType: "mixProd", drillTargets: ["Production_m", "Production_sku", "Production_m_sku"] },
      { id: "dt", name: "Downtime", drillType: "downtime", drillTargets: ["Downtime_category"] },
      { id: "comp", name: "Plan_Compliance", drillType: "compliance", drillTargets: null },
    ],
    Q: [
      { id: "ftq", name: "FTQ", unit: "%", drillType: "table", drillTargets: ["FTQ_m"] },
      { id: "ds", name: "Defect_Scrap", unit: "nos", drillType: "table", drillTargets: ["Defect_Scrap_m", "Defect_Scrap_sku"] },
      { id: "rw", name: "Rework", drillType: "table", drillTargets: null },
      { id: "ncm", name: "NCM_Hold", unit: "batches", drillType: "table", drillTargets: ["NCM_Hold_sku"] },
    ],
    C: [
      { id: "spc", name: "Specific_Power", unit: "kWh/MT", drillType: "table", drillTargets: ["Specific_Power_m"] },
      { id: "scrc", name: "Scrap_Cost", drillType: null, drillTargets: null },
      { id: "bud", name: "Budget_Util", drillType: "budget", drillTargets: null },
    ],
    M: [
      { id: "ab", name: "Absenteeism", unit: "%", drillType: "table", drillTargets: null },
      { id: "tq", name: "TQM_Score", unit: "/5", drillType: "table", drillTargets: null },
      { id: "sg", name: "Suggestions", unit: "/person", drillType: "table", drillTargets: null },
      { id: "tr", name: "Training", unit: "hrs/m", drillType: "table", drillTargets: null },
    ],
    S: [
      { id: "ri", name: "Reportable", unit: "nos", drillType: "table", drillTargets: null },
      { id: "fa", name: "First_Aid", unit: "nos", drillType: "table", drillTargets: null },
      { id: "nm", name: "Near_Miss", unit: "nos", drillType: "table", drillTargets: null },
      { id: "sa", name: "Safety_Audit", unit: "%", drillType: "table", drillTargets: null },
    ],
  },
  TBM: {
    P: [
      { id: "oee", name: "OEE_o", drillType: "mixOEE", drillTargets: ["Availability_o", "Performance_o", "Quality_o", "OEE_m"] },
      { id: "prod", name: "Production", drillType: "tbmProd", drillTargets: ["Production_m", "Production_sku", "Production_m_sku"] },
      { id: "dt", name: "Downtime", drillType: "downtime", drillTargets: ["Downtime_category"] },
      { id: "comp", name: "Plan_Compliance", drillType: "compliance", drillTargets: null },
    ],
    Q: [
      { id: "ftq", name: "FTQ", unit: "%", drillType: "table", drillTargets: ["FTQ_m"] },
      { id: "ds", name: "Defect_Scrap", unit: "nos", drillType: "table", drillTargets: ["Defect_Scrap_m", "Defect_Scrap_sku"] },
      { id: "rw", name: "Rework", drillType: "table", drillTargets: null },
      { id: "ncm", name: "NCM_Hold", unit: "batches", drillType: "table", drillTargets: ["NCM_Hold_sku"] },
    ],
    C: [
      { id: "spc", name: "Specific_Power", unit: "kWh/MT", drillType: "table", drillTargets: ["Specific_Power_m"] },
      { id: "scrc", name: "Scrap_Cost", drillType: null, drillTargets: null },
      { id: "bud", name: "Budget_Util", drillType: "budget", drillTargets: null },
    ],
    M: [
      { id: "ab", name: "Absenteeism", unit: "%", drillType: "table", drillTargets: null },
      { id: "tq", name: "TQM_Score", unit: "/5", drillType: "table", drillTargets: null },
      { id: "sg", name: "Suggestions", unit: "/person", drillType: "table", drillTargets: null },
      { id: "tr", name: "Training", unit: "hrs/m", drillType: "table", drillTargets: null },
    ],
    S: [
      { id: "ri", name: "Reportable", unit: "nos", drillType: "table", drillTargets: null },
      { id: "fa", name: "First_Aid", unit: "nos", drillType: "table", drillTargets: null },
      { id: "nm", name: "Near_Miss", unit: "nos", drillType: "table", drillTargets: null },
      { id: "sa", name: "Safety_Audit", unit: "%", drillType: "table", drillTargets: null },
    ],
  },
  Curing: {
    P: [
      { id: "oee", name: "OEE_o", drillType: "mixOEE", drillTargets: ["Availability_o", "Performance_o", "Quality_o", "OEE_m"] },
      { id: "prod", name: "Production", drillType: "tbmProd", drillTargets: ["Production_m", "Production_sku", "Production_m_sku"] },
      { id: "dt", name: "Downtime", drillType: "downtime", drillTargets: ["Downtime_category"] },
      { id: "comp", name: "Plan_Compliance", drillType: "compliance", drillTargets: null },
    ],
    Q: [
      { id: "ftq", name: "FTQ", unit: "%", drillType: "table", drillTargets: ["FTQ_m"] },
      { id: "ds", name: "Defect_Scrap", unit: "nos", drillType: "table", drillTargets: ["Defect_Scrap_m", "Defect_Scrap_sku"] },
      { id: "rw", name: "Rework", drillType: "table", drillTargets: null },
      { id: "ncm", name: "NCM_Hold", unit: "batches", drillType: "table", drillTargets: ["NCM_Hold_sku"] },
    ],
    C: [
      { id: "spc", name: "Specific_Power", unit: "kWh/MT", drillType: "table", drillTargets: ["Specific_Power_m"] },
      { id: "scrc", name: "Scrap_Cost", drillType: null, drillTargets: null },
      { id: "bud", name: "Budget_Util", drillType: "budget", drillTargets: null },
    ],
    M: [
      { id: "ab", name: "Absenteeism", unit: "%", drillType: "table", drillTargets: null },
      { id: "tq", name: "TQM_Score", unit: "/5", drillType: "table", drillTargets: null },
      { id: "sg", name: "Suggestions", unit: "/person", drillType: "table", drillTargets: null },
      { id: "tr", name: "Training", unit: "hrs/m", drillType: "table", drillTargets: null },
    ],
    S: [
      { id: "ri", name: "Reportable", unit: "nos", drillType: "table", drillTargets: null },
      { id: "fa", name: "First_Aid", unit: "nos", drillType: "table", drillTargets: null },
      { id: "nm", name: "Near_Miss", unit: "nos", drillType: "table", drillTargets: null },
      { id: "sa", name: "Safety_Audit", unit: "%", drillType: "table", drillTargets: null },
    ],
  },
  Stock: {
    P: [
      { id: "oee", name: "OEE_o", drillType: "mixOEE", drillTargets: ["Availability_o", "Performance_o", "Quality_o", "OEE_m"] },
      { id: "prod", name: "Production", drillType: "stkProd", drillTargets: ["Production_m", "Production_sku", "Production_m_sku"] },
      { id: "dt", name: "Downtime", drillType: "downtime", drillTargets: ["Downtime_category"] },
      { id: "comp", name: "Plan_Compliance", drillType: "compliance", drillTargets: null },
    ],
    Q: [
      { id: "ftq", name: "FTQ", unit: "%", drillType: "table", drillTargets: ["FTQ_m"] },
      { id: "ds", name: "Defect_Scrap", unit: "nos", drillType: "table", drillTargets: ["Defect_Scrap_m", "Defect_Scrap_sku"] },
      { id: "rw", name: "Rework", drillType: "table", drillTargets: null },
      { id: "ncm", name: "NCM_Hold", unit: "batches", drillType: "table", drillTargets: ["NCM_Hold_sku"] },
    ],
    C: [
      { id: "spc", name: "Specific_Power", unit: "kWh/MT", drillType: "table", drillTargets: ["Specific_Power_m"] },
      { id: "scrc", name: "Scrap_Cost", drillType: null, drillTargets: null },
      { id: "bud", name: "Budget_Util", drillType: "budget", drillTargets: null },
    ],
    M: [
      { id: "ab", name: "Absenteeism", unit: "%", drillType: "table", drillTargets: null },
      { id: "tq", name: "TQM_Score", unit: "/5", drillType: "table", drillTargets: null },
      { id: "sg", name: "Suggestions", unit: "/person", drillType: "table", drillTargets: null },
      { id: "tr", name: "Training", unit: "hrs/m", drillType: "table", drillTargets: null },
    ],
    S: [
      { id: "ri", name: "Reportable", unit: "nos", drillType: "table", drillTargets: null },
      { id: "fa", name: "First_Aid", unit: "nos", drillType: "table", drillTargets: null },
      { id: "nm", name: "Near_Miss", unit: "nos", drillType: "table", drillTargets: null },
      { id: "sa", name: "Safety_Audit", unit: "%", drillType: "table", drillTargets: null },
    ],
  },
};

/** Build a lookup: kpi_name → artifact KPI descriptor */
/* ---------- display name map: kpi_name → artifact card label ----------
 * Matches artifact display names exactly.
 */
const DISPLAY_NAME = {
  OEE_o: "OEE",
  Availability_o: "Availability",
  Performance_o: "Performance",
  Quality_o: "Quality",
  Production: "Production",
  Downtime: "Downtime",
  Plan_Compliance: "Plan Compliance",
  FTQ: "FTQ",
  Defect_Scrap: "Scrap",
  Rework: "Rework",
  NCM_Hold: "NCM Hold",
  Specific_Power: "Specific Power",
  Scrap_Cost: "Scrap Cost",
  Budget_Util: "Budget Util.",
  Absenteeism: "Absenteeism",
  TQM_Score: "TQM Score",
  Suggestions: "Suggestions",
  Training: "Training",
  Reportable: "Reportable",
  First_Aid: "First Aid",
  Near_Miss: "Near Miss",
  Safety_Audit: "Safety Audit",
};

/* ---------- public API ---------- */

/**
 * KPI card shape (matches KpiCard.jsx props):
 *   id, name, value, unit, spark[], trend, trendFavourable,
 *   drillable, drillType, drillTargets, status, target
 *
 * @param {object[]} rows         raw gold_dummy rows
 * @param {{ section: string, category: string, sparkLength?: number }} opts
 *   section = artifact section id (MIX/TBM/CUR/STK)
 *   category = artifact tab id (P/Q/C/M/S)
 */
export function toKpiGrid(
  rows,
  { section = "MIX", category = "P", sparkLength = 8 } = {},
) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Get allowed KPI names for this (section, category) combo only.
  const allowedKpis = ALLOWED_KPIS[section]?.[category] ?? [];
  const allowedNames = new Set(allowedKpis.map((k) => k.name));

  // Filter rows to this section/category AND only artifact KPI names.
  const filtered = rows.filter(
    (r) => r.section === section && allowedNames.has(r.kpi_name),
  );
  if (filtered.length === 0) return [];

  // Build lookup for this section/category only.
  const kpiByName = new Map(allowedKpis.map((k) => [k.name, k]));

  // Group by kpi_name.
  const groups = new Map();
  for (const r of filtered) {
    const name = r.kpi_name;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(r);
  }

  const result = [];
  for (const [name, groupDesc] of groups) {
    // Sort newest-first by date (ISO string — lexicographic works for yyyy-mm-dd).
    const desc = [...groupDesc].sort((a, b) => (b.date > a.date ? 1 : -1));

    const sparkVals = desc
      .slice(0, sparkLength)
      .map((r) => numberOrNull(r.actual_value))
      .filter((v) => v !== null);

    if (sparkVals.length === 0) continue;

    const latest = desc[0];
    const value = numberOrNull(latest.actual_value);
    const previous =
      desc.length >= 2 ? numberOrNull(desc[1].actual_value) : null;
    const trend =
      value !== null && previous !== null && previous !== 0
        ? Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10
        : null;

    const kpi = kpiByName.get(name);
    result.push({
      id: kpi.id,
      name: DISPLAY_NAME[name] ?? name,
      rawName: name,
      value,
      unit: kpi.unit ?? denan(latest.unit_of_measurement) ?? null,
      spark: sparkVals,
      trend,
      trendFavourable: trendFavourable(DISPLAY_NAME[name] ?? name, trend),
      drillable: kpi.drillType != null,
      drillType: kpi.drillType,
      drillTargets: kpi.drillTargets ?? null,
      status: mapStatus(denan(latest.status)),
      target: numberOrNull(latest.threshold_value),
    });
  }
  return result;
}

/**
 * Drill payload — raw gold_dummy rows for a drill panel.
 * Maps each row to a flat object the panels can iterate.
 */
export function toDrillRows(rows) {
  return (rows ?? []).map((r) => ({
    kpiName: r.kpi_name,
    machine: denan(r.machine),
    itemCode: denan(r.itemcode),
    productType: denan(r.product_type),
    actual: numberOrNull(r.actual_value),
    date: r.date,
    status: mapStatus(denan(r.status)),
    drillDown: parseDrillAttribute(r.drill_down_attribute),
    drillLevel: r.drill_down_level,
  }));
}

/**
 * Convert flat drillRows to GenericDrillPanel {type, cols, rows} shape.
 * Groups by machine + date. Columns: Machine | Actual | Date | Status
 */
export function toGenericDrill(rows, { title } = {}) {
  const mapped = (rows ?? []).map((r) => [
    r.machine ?? "—",
    r.actual != null ? r.actual : "—",
    r.date ?? "—",
    r.status ?? "—",
  ]);
  return {
    type: "table",
    title: title ?? "Drill-down",
    cols: ["Machine", "Actual", "Date", "Status"],
    rows: mapped,
  };
}

/* ---------- helpers ---------- */

function numberOrNull(v) {
  if (v == null || v === "" || v === NAN) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Trend favourable: "higher-is-better" KPIs tick up = good.
 * Lower-is-better (downtime/scrap/reject/...) tick down = good.
 * Neutral when trend is null.
 */
const LOWER_IS_BETTER = [
  "downtime",
  "scrap",
  "reject",
  "loss",
  "defect",
  "absent",
  "hold",
  "ncm",
  "ftc",
  "stoppage",
  "breakdown",
  "complaint",
  "anomaly",
  "anomalies",
];

function higherBetter(kpiName) {
  if (!kpiName) return true;
  const lower = kpiName.toLowerCase();
  return !LOWER_IS_BETTER.some((kw) => lower.includes(kw));
}

function trendFavourable(kpiName, trend) {
  if (trend === null) return true;
  return higherBetter(kpiName) ? trend >= 0 : trend <= 0;
}

/** Map gold_dummy status string to front-end chip shape. */
function mapStatus(s) {
  if (s === "Green" || s === "Red" || s === "Yellow") return s;
  return null;
}
