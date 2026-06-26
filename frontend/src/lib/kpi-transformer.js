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

// realdata.md §13: the real data only ships Production_m_sku; the dummy's
// Production_sku_m view is aliased to it (serve the same rows, never two
// views, never error on either name).
const KPI_ALIASES = { Production_sku_m: "Production_m_sku" };
export function aliasKpiName(name) {
  return typeof name === "string" ? KPI_ALIASES[name] ?? name : name;
}

/**
 * Tolerant drill_down_attribute parser (realdata.md §6).
 *
 * The real data stores a Python-style list with SINGLE quotes:
 *   ['Production_m', 'Production_sku']
 * A strict JSON.parse fails on that → drilldowns die. Accept single OR
 * double quotes and ALWAYS return a real array of child KPI names (or null
 * for a leaf). Aliases Production_sku_m → Production_m_sku. Never throws.
 */
export function parseDrillAttribute(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return normAttr(raw);
  if (typeof raw !== "string") return null;

  const t = raw.trim();
  if (t === "" || t === NAN || t === "[]") return null;

  // 1. Strict JSON (double-quoted dummy form).
  try {
    const p = JSON.parse(t);
    if (Array.isArray(p)) return normAttr(p);
  } catch {
    /* fall through */
  }
  // 2. Single-quoted Python list → swap quotes, parse.
  if (t.startsWith("[") && t.endsWith("]")) {
    try {
      const p = JSON.parse(t.replace(/'/g, '"'));
      if (Array.isArray(p)) return normAttr(p);
    } catch {
      // 3. Last resort: hand-split on commas, strip quotes.
      const inner = t.slice(1, -1).trim();
      if (inner === "") return null;
      const items = inner
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, "").trim())
        .filter(Boolean);
      return items.length ? normAttr(items) : null;
    }
  }
  // A bare child name → single-element array.
  return normAttr([t]);
}

function normAttr(arr) {
  const out = arr
    .filter((x) => typeof x === "string" && x.trim() !== "")
    .map((x) => aliasKpiName(x.trim()));
  return out.length ? out : null;
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
// realdata.md §10/§19.4: the OEE drill children. Components (overall + per
// machine) plus the REAL availability-loss reasons (No Schedule, Power
// Failure, Preventive Maintenance, Setup & Change, Operations/Material/
// Manpower, Breakdown) — these replace the dummy's Breakdown/Setup/Startup/…
// and the old Downtime KPI. Production_sku_m is aliased to Production_m_sku.
const OEE_DRILL_TARGETS = [
  "Availability_o",
  "Performance_o",
  "Quality_o",
  "OEE_m",
  "Availability_m",
  "Performance_m",
  "Quality_m",
  "Breakdown",
  "No Schedule",
  "Power Failure",
  "Preventive Maintenance",
  "Setup & Change",
  "Operations/Material/Manpower",
];

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
      // realdata.md §10: OEE loss reasons are the real names (No Schedule,
      // Power Failure, …). Downtime is removed (§15) — its drill is gone.
      { id: "oee", name: "OEE_o", agg: "AVG", drillType: "mixOEE", drillTargets: OEE_DRILL_TARGETS },
      // realdata.md §7: Production unit is read from data (Mixing = KG), not
      // hardcoded. Mixing has no Production_product / Production_s level.
      { id: "prod", name: "Production", agg: "SUM", drillType: "mixProd", drillTargets: ["Production_m", "Production_sku", "Production_m_sku"] },
      // Plan Compliance: no data yet → null card (§15).
      { id: "comp", name: "Plan_Compliance", agg: "AVG", drillType: null, drillTargets: null },
    ],
    Q: [
      // realdata.md §15: FTQ has no data yet → null card. Units are read from
      // the data (realdata.md §7), not hardcoded — Scrap/Rework = NOS, NCM
      // follows the row (NOS/KG/M, or (unset)→blank).
      { id: "ftq", name: "FTQ", unit: "%", agg: "AVG", drillType: "table", drillTargets: ["FTQ_m"] },
      { id: "scrap", name: "Scrap", agg: "SUM", drillType: "qScrapRework", drillTargets: ["Scrap_s", "Scrap_reason", "Scrap_m", "Scrap_sku", "Scrap_m_sku"] },
      { id: "rw", name: "Rework", agg: "SUM", drillType: "qScrapRework", drillTargets: ["Rework_s", "Rework_reason", "Rework_m", "Rework_sku", "Rework_m_sku"] },
      { id: "ncm", name: "NCM_Hold", agg: "SNAP", drillType: "table", drillTargets: ["NCM_Hold_sku"] },
    ],
    C: [
      { id: "spc", name: "Specific_Power", unit: "kWh/MT", agg: "AVG", drillType: "table", drillTargets: ["Specific_Power_m"] },
      { id: "scrc", name: "Scrap_Cost", unit: "₹L", agg: "SUM", drillType: null, drillTargets: null },
      { id: "bud", name: "Budget_Util", unit: "%", agg: "AVG", drillType: "budget", drillTargets: null },
    ],
    M: [
      // Absenteeism is plant-level (section=NULL/"nan") per spec §6 — shown on every
      // section's Morale tab. plantLevel flag tells the section filter to skip it.
      { id: "ab", name: "Absenteeism", unit: "%", agg: "AVG", plantLevel: true, drillType: "table", drillTargets: ["Absenteeism_section"] },
      { id: "tq", name: "TQM_Score", unit: "/5", agg: "AVG", drillType: "table", drillTargets: ["TQM_pillar"] },
      { id: "sg", name: "Suggestions", unit: "/person", agg: "AVG", drillType: "table", drillTargets: ["Suggestions_category"] },
      { id: "tr", name: "Training", unit: "hrs/m", agg: "AVG", drillType: "table", drillTargets: ["Training_area"] },
    ],
    S: [
      { id: "ri", name: "Reportable", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["Reportable_log"] },
      { id: "fa", name: "First_Aid", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["First_Aid_log"] },
      { id: "nm", name: "Near_Miss", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["Near_Miss_category"] },
      { id: "sa", name: "Safety_Audit", unit: "%", agg: "AVG", drillType: "table", drillTargets: ["Audit_area"] },
    ],
  },
  TBM: {
    P: [
      // realdata.md §18.2/§15: TBM has no overall OEE_o/OEE_s → null card now;
      // press-level OEE_m still appears in the drill. Fills in when TBM
      // overall-OEE data arrives.
      { id: "oee", name: "OEE_o", agg: "AVG", drillType: "mixOEE", drillTargets: OEE_DRILL_TARGETS },
      // realdata.md §6a: TBM Production starts with Production_product (by
      // product type), then machine/SKU. Unit (NOS) read from data.
      { id: "prod", name: "Production", agg: "SUM", drillType: "tbmProd", drillTargets: ["Production_product", "Production_m", "Production_sku", "Production_m_sku"] },
      { id: "comp", name: "Plan_Compliance", agg: "AVG", drillType: null, drillTargets: null },
    ],
    Q: [
      // realdata.md §15: FTQ has no data yet → null card. Units are read from
      // the data (realdata.md §7), not hardcoded — Scrap/Rework = NOS, NCM
      // follows the row (NOS/KG/M, or (unset)→blank).
      { id: "ftq", name: "FTQ", unit: "%", agg: "AVG", drillType: "table", drillTargets: ["FTQ_m"] },
      { id: "scrap", name: "Scrap", agg: "SUM", drillType: "qScrapRework", drillTargets: ["Scrap_s", "Scrap_reason", "Scrap_m", "Scrap_sku", "Scrap_m_sku"] },
      { id: "rw", name: "Rework", agg: "SUM", drillType: "qScrapRework", drillTargets: ["Rework_s", "Rework_reason", "Rework_m", "Rework_sku", "Rework_m_sku"] },
      { id: "ncm", name: "NCM_Hold", agg: "SNAP", drillType: "table", drillTargets: ["NCM_Hold_sku"] },
    ],
    C: [
      { id: "spc", name: "Specific_Power", unit: "kWh/MT", agg: "AVG", drillType: "table", drillTargets: ["Specific_Power_m"] },
      { id: "scrc", name: "Scrap_Cost", unit: "₹L", agg: "SUM", drillType: null, drillTargets: null },
      { id: "bud", name: "Budget_Util", unit: "%", agg: "AVG", drillType: "budget", drillTargets: null },
    ],
    M: [
      // Absenteeism is plant-level (section=NULL/"nan") per spec §6 — shown on every
      // section's Morale tab. plantLevel flag tells the section filter to skip it.
      { id: "ab", name: "Absenteeism", unit: "%", agg: "AVG", plantLevel: true, drillType: "table", drillTargets: ["Absenteeism_section"] },
      { id: "tq", name: "TQM_Score", unit: "/5", agg: "AVG", drillType: "table", drillTargets: ["TQM_pillar"] },
      { id: "sg", name: "Suggestions", unit: "/person", agg: "AVG", drillType: "table", drillTargets: ["Suggestions_category"] },
      { id: "tr", name: "Training", unit: "hrs/m", agg: "AVG", drillType: "table", drillTargets: ["Training_area"] },
    ],
    S: [
      { id: "ri", name: "Reportable", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["Reportable_log"] },
      { id: "fa", name: "First_Aid", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["First_Aid_log"] },
      { id: "nm", name: "Near_Miss", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["Near_Miss_category"] },
      { id: "sa", name: "Safety_Audit", unit: "%", agg: "AVG", drillType: "table", drillTargets: ["Audit_area"] },
    ],
  },
  Curing: {
    P: [
      // realdata.md §14: Curing has overall OEE_o (sub_section NULL) and
      // drills to press (OEE_m), NOT trench — the trench-level OEE_s is
      // deferred (no data yet). Use the generic OEE chain (mixOEE), not the
      // dummy's curOEE trench tier.
      { id: "oee", name: "OEE_o", agg: "AVG", drillType: "mixOEE", drillTargets: OEE_DRILL_TARGETS },
      // realdata.md §6a/§17.1: Curing Production is the fullest chain —
      // Production_product (by product type) → Production_s (by trench, leaf)
      // → Production_m → Production_sku → Production_m_sku. Production_sku_m is
      // aliased to Production_m_sku (§13). Unit (NOS) read from data.
      { id: "prod", name: "Production", agg: "SUM", drillType: "curProd", drillTargets: ["Production_product", "Production_s", "Production_m", "Production_sku", "Production_m_sku"] },
      { id: "comp", name: "Plan_Compliance", agg: "AVG", drillType: null, drillTargets: null },
    ],
    Q: [
      // realdata.md §15: FTQ has no data yet → null card. Units are read from
      // the data (realdata.md §7), not hardcoded — Scrap/Rework = NOS, NCM
      // follows the row (NOS/KG/M, or (unset)→blank).
      { id: "ftq", name: "FTQ", unit: "%", agg: "AVG", drillType: "table", drillTargets: ["FTQ_m"] },
      { id: "scrap", name: "Scrap", agg: "SUM", drillType: "qScrapRework", drillTargets: ["Scrap_s", "Scrap_reason", "Scrap_m", "Scrap_sku", "Scrap_m_sku"] },
      { id: "rw", name: "Rework", agg: "SUM", drillType: "qScrapRework", drillTargets: ["Rework_s", "Rework_reason", "Rework_m", "Rework_sku", "Rework_m_sku"] },
      { id: "ncm", name: "NCM_Hold", agg: "SNAP", drillType: "table", drillTargets: ["NCM_Hold_sku"] },
    ],
    C: [
      { id: "spc", name: "Specific_Power", unit: "kWh/MT", agg: "AVG", drillType: "table", drillTargets: ["Specific_Power_m"] },
      { id: "scrc", name: "Scrap_Cost", unit: "₹L", agg: "SUM", drillType: null, drillTargets: null },
      { id: "bud", name: "Budget_Util", unit: "%", agg: "AVG", drillType: "budget", drillTargets: null },
    ],
    M: [
      // Absenteeism is plant-level (section=NULL/"nan") per spec §6 — shown on every
      // section's Morale tab. plantLevel flag tells the section filter to skip it.
      { id: "ab", name: "Absenteeism", unit: "%", agg: "AVG", plantLevel: true, drillType: "table", drillTargets: ["Absenteeism_section"] },
      { id: "tq", name: "TQM_Score", unit: "/5", agg: "AVG", drillType: "table", drillTargets: ["TQM_pillar"] },
      { id: "sg", name: "Suggestions", unit: "/person", agg: "AVG", drillType: "table", drillTargets: ["Suggestions_category"] },
      { id: "tr", name: "Training", unit: "hrs/m", agg: "AVG", drillType: "table", drillTargets: ["Training_area"] },
    ],
    S: [
      { id: "ri", name: "Reportable", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["Reportable_log"] },
      { id: "fa", name: "First_Aid", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["First_Aid_log"] },
      { id: "nm", name: "Near_Miss", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["Near_Miss_category"] },
      { id: "sa", name: "Safety_Audit", unit: "%", agg: "AVG", drillType: "table", drillTargets: ["Audit_area"] },
    ],
  },
  Stock: {
    P: [
      // realdata.md §18.2/§19.4a: Stock has NO overall OEE_o — its OEE is
      // OEE_s per subsection, and OEE_s nests by sub_section → press (OEE_m).
      { id: "oee", name: "OEE_s", agg: "AVG", drillType: "mixOEE", drillTargets: ["OEE_m", "Availability_s", "Performance_s", "Quality_s", "Availability_m", "Performance_m", "Quality_m", "Breakdown", "No Schedule", "Power Failure", "Preventive Maintenance", "Setup & Change", "Operations/Material/Manpower"] },
      // realdata.md §18.1: Stock has no overall Production — the card pins
      // sub_section + product. No Production_product/Production_s level. Unit
      // (M/NOS) read from data.
      { id: "prod", name: "Production", agg: "SUM", drillType: "stkProd", drillTargets: ["Production_m", "Production_sku", "Production_m_sku"] },
      { id: "comp", name: "Plan_Compliance", agg: "AVG", drillType: null, drillTargets: null },
    ],
    Q: [
      // realdata.md §15: FTQ has no data yet → null card. Units are read from
      // the data (realdata.md §7), not hardcoded — Scrap/Rework = NOS, NCM
      // follows the row (NOS/KG/M, or (unset)→blank).
      { id: "ftq", name: "FTQ", unit: "%", agg: "AVG", drillType: "table", drillTargets: ["FTQ_m"] },
      { id: "scrap", name: "Scrap", agg: "SUM", drillType: "qScrapRework", drillTargets: ["Scrap_s", "Scrap_reason", "Scrap_m", "Scrap_sku", "Scrap_m_sku"] },
      { id: "rw", name: "Rework", agg: "SUM", drillType: "qScrapRework", drillTargets: ["Rework_s", "Rework_reason", "Rework_m", "Rework_sku", "Rework_m_sku"] },
      { id: "ncm", name: "NCM_Hold", agg: "SNAP", drillType: "table", drillTargets: ["NCM_Hold_sku"] },
    ],
    C: [
      { id: "spc", name: "Specific_Power", unit: "kWh/MT", agg: "AVG", drillType: "table", drillTargets: ["Specific_Power_m"] },
      { id: "scrc", name: "Scrap_Cost", unit: "₹L", agg: "SUM", drillType: null, drillTargets: null },
      { id: "bud", name: "Budget_Util", unit: "%", agg: "AVG", drillType: "budget", drillTargets: null },
    ],
    M: [
      // Absenteeism is plant-level (section=NULL/"nan") per spec §6 — shown on every
      // section's Morale tab. plantLevel flag tells the section filter to skip it.
      { id: "ab", name: "Absenteeism", unit: "%", agg: "AVG", plantLevel: true, drillType: "table", drillTargets: ["Absenteeism_section"] },
      { id: "tq", name: "TQM_Score", unit: "/5", agg: "AVG", drillType: "table", drillTargets: ["TQM_pillar"] },
      { id: "sg", name: "Suggestions", unit: "/person", agg: "AVG", drillType: "table", drillTargets: ["Suggestions_category"] },
      { id: "tr", name: "Training", unit: "hrs/m", agg: "AVG", drillType: "table", drillTargets: ["Training_area"] },
    ],
    S: [
      { id: "ri", name: "Reportable", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["Reportable_log"] },
      { id: "fa", name: "First_Aid", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["First_Aid_log"] },
      { id: "nm", name: "Near_Miss", unit: "nos", agg: "SUM", drillType: "table", drillTargets: ["Near_Miss_category"] },
      { id: "sa", name: "Safety_Audit", unit: "%", agg: "AVG", drillType: "table", drillTargets: ["Audit_area"] },
    ],
  },
};

/** Build a lookup: kpi_name → artifact KPI descriptor */
/* ---------- display name map: kpi_name → artifact card label ----------
 * Matches artifact display names exactly.
 */
const DISPLAY_NAME = {
  OEE_o: "OEE",
  OEE_s: "OEE",
  OEE_m: "OEE",
  Availability_o: "Availability",
  Performance_o: "Performance",
  Quality_o: "Quality",
  Availability_s: "Availability",
  Performance_s: "Performance",
  Quality_s: "Quality",
  Production: "Production",
  // realdata.md §6a: new Production drill levels.
  Production_product: "By Product Type",
  Production_s: "By Subsection",
  Production_m: "By Machine",
  Production_sku: "By SKU",
  Production_m_sku: "By Machine + SKU",
  Plan_Compliance: "Plan Compliance",
  FTQ: "FTQ",
  Defect_Scrap: "Defect + Scrap",
  Scrap_Rate: "Scrap Rate",
  Scrap: "Scrap",
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
 * A no-data placeholder card so a KPI keeps its fixed slot in the grid
 * even when the current view has no rows for it. Stable positions avoid
 * the confusion of cards reordering / disappearing when data changes.
 */
function placeholderCard(kpiDef) {
  return {
    id: kpiDef.id,
    name: DISPLAY_NAME[kpiDef.name] ?? kpiDef.name,
    rawName: kpiDef.name,
    value: "—",
    unit: kpiDef.unit ?? null,
    spark: [],
    trend: null,
    trendFavourable: true,
    drillable: false,
    drillType: null,
    drillTargets: null,
    status: null,
    target: null,
  };
}

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
  {
    section = "MIX",
    category = "P",
    sparkLength = 8,
    granularity = "DAY",
    mode = "snapshot",
    productType = null,
  } = {},
) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Two execution modes:
  //   "snapshot"  — use the LATEST row at `granularity` and take
  //                 actual_value verbatim. The right choice for the
  //                 Today/Month/Year presets which back onto the
  //                 pre-aggregated Daily/MTD/YTD rows the spec calls
  //                 out in §9. Authoritative; safe under the upstream
  //                 5000-row cap; correctly handles MULT (OEE) and
  //                 SNAP (NCM_Hold) which aren't re-derivable from Daily.
  //   "aggregate" — sum / avg / etc over the date range per the spec
  //                 §9 rule for that KPI. Used for custom from/to
  //                 ranges where no single pre-agg row matches.
  const isSnapshot = mode === "snapshot";

  // Get allowed KPI names for this (section, category) combo only.
  const allowedKpis = ALLOWED_KPIS[section]?.[category] ?? [];
  const allowedNames = new Set(allowedKpis.map((k) => k.name));
  const plantLevelNames = new Set(
    allowedKpis.filter((k) => k.plantLevel).map((k) => k.name),
  );

  // Filter rows to this section/category AND only spec KPI names.
  // sub_section + product_type are already filtered SERVER-SIDE (the
  // selection is sent in the fetch context), so we only need the
  // section/KPI-name narrowing here. Plant-level KPIs (e.g. Absenteeism,
  // spec §6) come back with section="nan"; they bypass the section check.
  const filtered = rows.filter((r) => {
    if (!allowedNames.has(r.kpi_name)) return false;
    if (plantLevelNames.has(r.kpi_name)) return true;
    return r.section === section;
  });
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
  // Iterate in the FIXED spec order (allowedKpis) — NEVER in data-arrival
  // order — so each KPI always occupies the same slot (e.g. OEE,
  // Production, Downtime, Plan Compliance). A KPI with no data for the
  // current view gets a placeholder card, so the grid never reflows.
  for (const kpiDef of allowedKpis) {
    const name = kpiDef.name;
    let groupDesc = groups.get(name) ?? [];

    // Equipment-level KPIs (OEE, Downtime, …) are exempted from the
    // server-side product_type filter (see PRODUCT_AGNOSTIC_KPIS in the
    // backend), so a group may carry rows for several product types.
    // PREFER rows matching the selected product type when they exist —
    // Mixing genuinely records OEE per-compound (Master vs Final) — and
    // fall back to the line-level rows otherwise: TBM records OEE only
    // under "Green Tyre", Curing/Stock under a NULL section row, so
    // selecting a secondary product type must still show the line value
    // instead of an empty card. Product-specific KPIs (Production, etc.)
    // are already narrowed server-side, so the match keeps all of them
    // (no-op) and they never fall back to a different product.
    if (productType) {
      const matching = groupDesc.filter(
        (r) => denan(r.product_type) === productType,
      );
      if (matching.length > 0) groupDesc = matching;
    }

    // Some KPIs (Production) are recorded in MULTIPLE units in the same
    // period (e.g. MT *and* Batches), as separate rows. That makes the
    // "latest row" ambiguous. When a KPI declares a canonical `unit` and
    // the group carries more than one, keep only the canonical-unit rows.
    if (
      kpiDef.unit &&
      new Set(groupDesc.map((r) => r.unit_of_measurement)).size > 1
    ) {
      groupDesc = groupDesc.filter(
        (r) => r.unit_of_measurement === kpiDef.unit,
      );
    }

    // Snapshot path: pick the LATEST row at the active granularity
    // and read actual_value verbatim. Works for Today (Daily), Month
    // (MTD), Year (YTD) — gold_dummy already stored the right
    // pre-aggregated value, no client roll-up needed.
    if (isSnapshot) {
      const preRows = groupDesc
        .filter((r) => r.granularity === granularity)
        .sort((a, b) => (b.date > a.date ? 1 : -1));
      if (preRows.length === 0) {
        result.push(placeholderCard(kpiDef));
        continue;
      }

      const kpi = kpiByName.get(name);
      const numericVals = preRows
        .map((r) => numberOrNull(r.actual_value))
        .filter((v) => v !== null);
      if (numericVals.length === 0) {
        result.push(placeholderCard(kpiDef));
        continue;
      }

      const value = Math.round(numericVals[0] * 100) / 100; // newest
      const sparkVals = numericVals.slice(0, sparkLength).reverse();

      // Within-window trend: compare newest snapshot vs the oldest
      // one in the trailing window. For MTD/YTD this shows whether the
      // month-/year-to-date moved over the last few days of snapshots;
      // for Daily it shows the actual day-over-day movement.
      let trend = null;
      if (numericVals.length >= 2) {
        const newer = numericVals[0];
        const older = numericVals[numericVals.length - 1];
        if (older !== 0) {
          trend = Math.round(((newer - older) / Math.abs(older)) * 1000) / 10;
        }
      }

      const latest = preRows[0];
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
      continue;
    }

    // Aggregate path — sum / avg per spec §9 over the active range.
    // Use the active granularity (Daily by default; Shift A/B/C when
    // the user picked a specific shift), sort newest-first.
    const dailyRows = groupDesc
      .filter((r) => r.granularity === granularity)
      .sort((a, b) => (b.date > a.date ? 1 : -1));

    if (dailyRows.length === 0) {
      result.push(placeholderCard(kpiDef));
      continue;
    }

    const numericVals = dailyRows
      .map((r) => numberOrNull(r.actual_value))
      .filter((v) => v !== null);

    if (numericVals.length === 0) {
      result.push(placeholderCard(kpiDef));
      continue;
    }

    const kpi = kpiByName.get(name);
    const agg = kpi.agg ?? "AVG";

    // Per spec section 9: SUM = totals over the period, AVG = mean,
    // COUNT = entry count, SNAP = latest, MULT = OEE multiplicative
    // (approximated as AVG of pre-stored OEE rows — the spec explicitly
    // allows this small gap).
    let value;
    if (agg === "SUM") {
      value = numericVals.reduce((s, v) => s + v, 0);
    } else if (agg === "COUNT") {
      value = numericVals.length;
    } else if (agg === "SNAP") {
      value = numericVals[0];
    } else {
      // AVG and MULT
      value = numericVals.reduce((s, v) => s + v, 0) / numericVals.length;
    }
    value = Math.round(value * 100) / 100;

    // Sparkline: up to N most-recent Daily values, oldest→newest so the
    // chart reads left-to-right.
    const sparkVals = numericVals.slice(0, sparkLength).reverse();

    // Within-period trend: agg(recent half) vs agg(older half).
    // More meaningful than day-over-day when the value itself is a
    // multi-day aggregate.
    let trend = null;
    if (numericVals.length >= 2) {
      const half = Math.floor(numericVals.length / 2);
      const recent = numericVals.slice(0, half); // newest half
      const older = numericVals.slice(half, half * 2);
      const aggSlice = (arr) =>
        agg === "SUM"
          ? arr.reduce((s, v) => s + v, 0)
          : arr.reduce((s, v) => s + v, 0) / arr.length;
      const recentAgg = aggSlice(recent);
      const olderAgg = aggSlice(older);
      if (olderAgg !== 0) {
        trend =
          Math.round(((recentAgg - olderAgg) / Math.abs(olderAgg)) * 1000) /
          10;
      }
    }

    const latest = dailyRows[0];
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
    section: r.section,
    subSection: denan(r.sub_section),
    machine: denan(r.machine),
    itemCode: denan(r.itemcode),
    productType: denan(r.product_type),
    actual: numberOrNull(r.actual_value),
    threshold: numberOrNull(r.threshold_value),
    unit: denan(r.unit_of_measurement),
    date: r.date,
    granularity: r.granularity,
    status: mapStatus(denan(r.status)),
    remarks: denan(r.remarks),
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
