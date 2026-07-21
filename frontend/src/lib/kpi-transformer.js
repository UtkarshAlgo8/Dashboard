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

// changes.md §0: missing-value sentinels are the literal strings "nan"
// AND "null" (not JS null), plus "". Treat all as empty everywhere.
const EMPTY_TOKENS = new Set(["", "nan", "null"]);

function isEmptyToken(v) {
  return v == null || EMPTY_TOKENS.has(String(v).trim().toLowerCase());
}

function denan(v) {
  return isEmptyToken(v) ? null : v;
}

// changes.md §6: canonicalize product_type on read so SideWall/Sidewall
// merge to one value/bar. Empty sentinels collapse to null first.
const PRODUCT_TYPE_CANONICAL = new Map([["sidewall", "SideWall"]]);
function canonicalizeProductType(v) {
  const d = denan(v);
  if (d == null) return null;
  const t = String(d).trim();
  return PRODUCT_TYPE_CANONICAL.get(t.toLowerCase()) ?? t;
}

// new_change.md C9: 'Meters' and 'M' (and 'NUM'/'NOS') are the SAME unit
// spelled two ways; apply the alias map to BOTH the filter value and the
// row value so a pin actually matches. "(unset)"/"null"/"nan"/"" all mean
// "no unit" and render blank, never the literal "(unset)".
const UNIT_ALIASES = new Map([
  ["METERS", "M"],
  ["NUM", "NOS"],
]);
export function canonicalUnit(raw) {
  const d = denan(raw);
  if (d == null) return null;
  const u = String(d).trim();
  if (u === "" || u === "(unset)") return null;
  const upper = u.toUpperCase();
  return UNIT_ALIASES.get(upper) ?? upper;
}

// changes.md §8/§10: granularity comparisons must be spelling-tolerant.
// Old callers still pass "Daily"/"Monthly" while the real rows carry
// "DAY"/"MONTH"; a raw === compare silently matched nothing (custom-range
// bug). Normalize both the row value and the requested value first.
const GRAN_SYNONYMS = new Map([
  ["daily", "DAY"],
  ["day", "DAY"],
  ["today", "DAY"],
  ["mtd", "MONTH"],
  ["month", "MONTH"],
  ["monthly", "MONTH"],
  ["shift a", "SHIFT A"],
  ["shift b", "SHIFT B"],
  ["shift c", "SHIFT C"],
]);

function normGran(v) {
  if (v == null) return null;
  const k = String(v).trim().toLowerCase().replace(/\s+/g, " ");
  return GRAN_SYNONYMS.get(k) ?? String(v).trim().toUpperCase();
}

function sameGran(rowGran, wantGran) {
  return normGran(rowGran) === normGran(wantGran);
}

/* ---------- new_change.md C5: range aggregation class ----------
 * SUM for additive (flow) KPIs, AVERAGE for rate/ratio KPIs, LATEST for
 * stock LEVELS. The lists are EXPLICIT and keyed on kpi_name — never a
 * substring match, so a future KPI can't silently inherit a class.
 */
const RATE_KPIS = new Set([
  "OEE_o",
  "OEE_s",
  "OEE_m",
  "OEE_p",
  "Availability_o",
  "Availability_s",
  "Availability_m",
  "Performance_o",
  "Performance_s",
  "Performance_m",
  "Quality_o",
  "Quality_s",
  "Quality_m",
  "FTQ",
  "Plan_Compliance",
]);
const LEVEL_KPIS = new Set(["Inventory", "Inventory_item"]);

/** new_change.md C5 → "SUM" | "AVERAGE" | "LATEST" for a kpi_name. */
export function classifyKpiAggregation(kpiName) {
  if (RATE_KPIS.has(kpiName)) return "AVERAGE";
  if (LEVEL_KPIS.has(kpiName)) return "LATEST";
  return "SUM";
}

/**
 * new_change.md C5: aggregate one pinned series over a date range.
 * `values` are the numeric actual_value of the DAY rows, NEWEST FIRST,
 * with missing/empty days ALREADY dropped — an average must never count a
 * missing day as 0. Returns null when the range holds no value at all.
 * Applies to cards, drills and the shift box identically.
 */
export function aggregateForRange(values, kpiName) {
  if (!Array.isArray(values) || values.length === 0) return null;
  switch (classifyKpiAggregation(kpiName)) {
    case "AVERAGE":
      return values.reduce((s, v) => s + v, 0) / values.length;
    case "LATEST":
      return values[0]; // newest-first ⇒ the most recent in-range day
    default:
      return values.reduce((s, v) => s + v, 0);
  }
}

/* ---------- new_change.md C7: TBM / Curing product-wise Production ----------
 * `Production` rows in TBM and Curing carry ONLY the overall row
 * (product_type = the literal "null"), so a product selection matches
 * nothing and silently falls back to the overall value. The product-wise
 * view must read `Production_product` and pin product_type to the
 * selection, or to the section's AGGREGATE product for "Overall".
 * Mixing / Stock have no Production_product level — they keep `Production`
 * with their own pins (compound + unit / sub-section + product + unit).
 */
export const AGGREGATE_PRODUCT = { Curing: "Cured Tyre", TBM: "Green Tyre" };

export function resolveProductionKpi(section, selectedProduct) {
  if (section === "TBM" || section === "Curing") {
    return {
      kpiName: "Production_product",
      productPin: denan(selectedProduct) ?? AGGREGATE_PRODUCT[section],
    };
  }
  return { kpiName: "Production", productPin: denan(selectedProduct) };
}

// realdata.md §13: the real data only ships Production_m_sku; the dummy's
// Production_sku_m view is aliased to it (serve the same rows, never two
// views, never error on either name).
const KPI_ALIASES = { Production_sku_m: "Production_m_sku" };
export function aliasKpiName(name) {
  return typeof name === "string" ? (KPI_ALIASES[name] ?? name) : name;
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
  // changes.md §0/§1: "null"/"nan" are missing sentinels → leaf (no
  // children), never a fake child KPI named "null".
  if (t === "[]" || isEmptyToken(t)) return null;

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
        .map((s) =>
          s
            .trim()
            .replace(/^['"]|['"]$/g, "")
            .trim(),
        )
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
      {
        id: "oee",
        name: "OEE_o",
        agg: "AVG",
        drillType: "mixOEE",
        drillTargets: OEE_DRILL_TARGETS,
      },
      // realdata.md §7: Production unit is read from data (Mixing = KG), not
      // hardcoded. Mixing has no Production_product / Production_s level.
      {
        id: "prod",
        name: "Production",
        agg: "SUM",
        drillType: "mixProd",
        drillTargets: ["Production_m", "Production_sku", "Production_m_sku"],
      },
      // Plan Compliance: no data yet → null card (§15).
      {
        id: "comp",
        name: "Plan_Compliance",
        agg: "AVG",
        drillType: null,
        drillTargets: null,
      },
    ],
    Q: [
      // realdata.md §15: FTQ has no data yet → null card. Units are read from
      // the data (realdata.md §7), not hardcoded — Scrap/Rework = NOS, NCM
      // follows the row (NOS/KG/M, or (unset)→blank).
      {
        id: "ftq",
        name: "FTQ",
        unit: "%",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["FTQ_m"],
      },
      {
        id: "scrap",
        name: "Scrap",
        agg: "SUM",
        drillType: "qScrapRework",
        drillTargets: [
          "Scrap_s",
          "Scrap_reason",
          "Scrap_m",
          "Scrap_sku",
          "Scrap_m_sku",
        ],
      },
      {
        id: "rw",
        name: "Rework",
        agg: "SUM",
        drillType: "qScrapRework",
        drillTargets: [
          "Rework_s",
          "Rework_reason",
          "Rework_m",
          "Rework_sku",
          "Rework_m_sku",
        ],
      },
      {
        id: "ncm",
        name: "NCM_Hold",
        agg: "SNAP",
        drillType: "table",
        drillTargets: ["NCM_Hold_sku"],
      },
    ],
    C: [
      {
        id: "spc",
        name: "Specific_Power",
        unit: "kWh/MT",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Specific_Power_m"],
      },
      {
        id: "scrc",
        name: "Scrap_Cost",
        unit: "₹L",
        agg: "SUM",
        drillType: null,
        drillTargets: null,
      },
      {
        id: "bud",
        name: "Budget_Util",
        unit: "%",
        agg: "AVG",
        drillType: "budget",
        drillTargets: null,
      },
    ],
    M: [
      // Absenteeism is plant-level (section=NULL/"nan") per spec §6 — shown on every
      // section's Morale tab. plantLevel flag tells the section filter to skip it.
      {
        id: "ab",
        name: "Absenteeism",
        unit: "%",
        agg: "AVG",
        plantLevel: true,
        drillType: "table",
        drillTargets: ["Absenteeism_section"],
      },
      {
        id: "tq",
        name: "TQM_Score",
        unit: "/5",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["TQM_pillar"],
      },
      {
        id: "sg",
        name: "Suggestions",
        unit: "/person",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Suggestions_category"],
      },
      {
        id: "tr",
        name: "Training",
        unit: "hrs/m",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Training_area"],
      },
    ],
    S: [
      {
        id: "ri",
        name: "Reportable",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["Reportable_log"],
      },
      {
        id: "fa",
        name: "First_Aid",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["First_Aid_log"],
      },
      {
        id: "nm",
        name: "Near_Miss",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["Near_Miss_category"],
      },
      {
        id: "sa",
        name: "Safety_Audit",
        unit: "%",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Audit_area"],
      },
    ],
  },
  TBM: {
    P: [
      // realdata.md §18.2/§15: TBM has no overall OEE_o/OEE_s → null card now;
      // press-level OEE_m still appears in the drill. Fills in when TBM
      // overall-OEE data arrives.
      {
        id: "oee",
        name: "OEE_o",
        agg: "AVG",
        drillType: "mixOEE",
        drillTargets: OEE_DRILL_TARGETS,
      },
      // realdata.md §6a: TBM Production starts with Production_product (by
      // product type), then machine/SKU. Unit (NOS) read from data.
      {
        id: "prod",
        name: "Production",
        agg: "SUM",
        drillType: "tbmProd",
        drillTargets: [
          "Production_product",
          "Production_m",
          "Production_sku",
          "Production_m_sku",
        ],
      },
      {
        id: "comp",
        name: "Plan_Compliance",
        agg: "AVG",
        drillType: null,
        drillTargets: null,
      },
    ],
    Q: [
      // realdata.md §15: FTQ has no data yet → null card. Units are read from
      // the data (realdata.md §7), not hardcoded — Scrap/Rework = NOS, NCM
      // follows the row (NOS/KG/M, or (unset)→blank).
      {
        id: "ftq",
        name: "FTQ",
        unit: "%",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["FTQ_m"],
      },
      {
        id: "scrap",
        name: "Scrap",
        agg: "SUM",
        drillType: "qScrapRework",
        drillTargets: [
          "Scrap_s",
          "Scrap_reason",
          "Scrap_m",
          "Scrap_sku",
          "Scrap_m_sku",
        ],
      },
      {
        id: "rw",
        name: "Rework",
        agg: "SUM",
        drillType: "qScrapRework",
        drillTargets: [
          "Rework_s",
          "Rework_reason",
          "Rework_m",
          "Rework_sku",
          "Rework_m_sku",
        ],
      },
      {
        id: "ncm",
        name: "NCM_Hold",
        agg: "SNAP",
        drillType: "table",
        drillTargets: ["NCM_Hold_sku"],
      },
    ],
    C: [
      {
        id: "spc",
        name: "Specific_Power",
        unit: "kWh/MT",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Specific_Power_m"],
      },
      {
        id: "scrc",
        name: "Scrap_Cost",
        unit: "₹L",
        agg: "SUM",
        drillType: null,
        drillTargets: null,
      },
      {
        id: "bud",
        name: "Budget_Util",
        unit: "%",
        agg: "AVG",
        drillType: "budget",
        drillTargets: null,
      },
    ],
    M: [
      // Absenteeism is plant-level (section=NULL/"nan") per spec §6 — shown on every
      // section's Morale tab. plantLevel flag tells the section filter to skip it.
      {
        id: "ab",
        name: "Absenteeism",
        unit: "%",
        agg: "AVG",
        plantLevel: true,
        drillType: "table",
        drillTargets: ["Absenteeism_section"],
      },
      {
        id: "tq",
        name: "TQM_Score",
        unit: "/5",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["TQM_pillar"],
      },
      {
        id: "sg",
        name: "Suggestions",
        unit: "/person",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Suggestions_category"],
      },
      {
        id: "tr",
        name: "Training",
        unit: "hrs/m",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Training_area"],
      },
    ],
    S: [
      {
        id: "ri",
        name: "Reportable",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["Reportable_log"],
      },
      {
        id: "fa",
        name: "First_Aid",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["First_Aid_log"],
      },
      {
        id: "nm",
        name: "Near_Miss",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["Near_Miss_category"],
      },
      {
        id: "sa",
        name: "Safety_Audit",
        unit: "%",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Audit_area"],
      },
    ],
  },
  Curing: {
    P: [
      // realdata.md §14: Curing has overall OEE_o (sub_section NULL) and
      // drills to press (OEE_m), NOT trench — the trench-level OEE_s is
      // deferred (no data yet). Use the generic OEE chain (mixOEE), not the
      // dummy's curOEE trench tier.
      {
        id: "oee",
        name: "OEE_o",
        agg: "AVG",
        drillType: "mixOEE",
        drillTargets: OEE_DRILL_TARGETS,
      },
      // realdata.md §6a/§17.1: Curing Production is the fullest chain —
      // Production_product (by product type) → Production_s (by trench, leaf)
      // → Production_m → Production_sku → Production_m_sku. Production_sku_m is
      // aliased to Production_m_sku (§13). Unit (NOS) read from data.
      {
        id: "prod",
        name: "Production",
        agg: "SUM",
        drillType: "curProd",
        drillTargets: [
          "Production_product",
          "Production_s",
          "Production_m",
          "Production_sku",
          "Production_m_sku",
        ],
      },
      {
        id: "comp",
        name: "Plan_Compliance",
        agg: "AVG",
        drillType: null,
        drillTargets: null,
      },
    ],
    Q: [
      // realdata.md §15: FTQ has no data yet → null card. Units are read from
      // the data (realdata.md §7), not hardcoded — Scrap/Rework = NOS, NCM
      // follows the row (NOS/KG/M, or (unset)→blank).
      {
        id: "ftq",
        name: "FTQ",
        unit: "%",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["FTQ_m"],
      },
      {
        id: "scrap",
        name: "Scrap",
        agg: "SUM",
        drillType: "qScrapRework",
        drillTargets: [
          "Scrap_s",
          "Scrap_reason",
          "Scrap_m",
          "Scrap_sku",
          "Scrap_m_sku",
        ],
      },
      {
        id: "rw",
        name: "Rework",
        agg: "SUM",
        drillType: "qScrapRework",
        drillTargets: [
          "Rework_s",
          "Rework_reason",
          "Rework_m",
          "Rework_sku",
          "Rework_m_sku",
        ],
      },
      {
        id: "ncm",
        name: "NCM_Hold",
        agg: "SNAP",
        drillType: "table",
        drillTargets: ["NCM_Hold_sku"],
      },
    ],
    C: [
      {
        id: "spc",
        name: "Specific_Power",
        unit: "kWh/MT",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Specific_Power_m"],
      },
      {
        id: "scrc",
        name: "Scrap_Cost",
        unit: "₹L",
        agg: "SUM",
        drillType: null,
        drillTargets: null,
      },
      {
        id: "bud",
        name: "Budget_Util",
        unit: "%",
        agg: "AVG",
        drillType: "budget",
        drillTargets: null,
      },
    ],
    M: [
      // Absenteeism is plant-level (section=NULL/"nan") per spec §6 — shown on every
      // section's Morale tab. plantLevel flag tells the section filter to skip it.
      {
        id: "ab",
        name: "Absenteeism",
        unit: "%",
        agg: "AVG",
        plantLevel: true,
        drillType: "table",
        drillTargets: ["Absenteeism_section"],
      },
      {
        id: "tq",
        name: "TQM_Score",
        unit: "/5",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["TQM_pillar"],
      },
      {
        id: "sg",
        name: "Suggestions",
        unit: "/person",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Suggestions_category"],
      },
      {
        id: "tr",
        name: "Training",
        unit: "hrs/m",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Training_area"],
      },
    ],
    S: [
      {
        id: "ri",
        name: "Reportable",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["Reportable_log"],
      },
      {
        id: "fa",
        name: "First_Aid",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["First_Aid_log"],
      },
      {
        id: "nm",
        name: "Near_Miss",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["Near_Miss_category"],
      },
      {
        id: "sa",
        name: "Safety_Audit",
        unit: "%",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Audit_area"],
      },
    ],
  },
  Stock: {
    P: [
      // realdata.md §18.2/§19.4a: Stock has NO overall OEE_o — its OEE is
      // OEE_s per subsection, and OEE_s nests by sub_section → press (OEE_m).
      {
        id: "oee",
        name: "OEE_s",
        agg: "AVG",
        drillType: "mixOEE",
        drillTargets: [
          "OEE_m",
          "Availability_s",
          "Performance_s",
          "Quality_s",
          "Availability_m",
          "Performance_m",
          "Quality_m",
          "Breakdown",
          "No Schedule",
          "Power Failure",
          "Preventive Maintenance",
          "Setup & Change",
          "Operations/Material/Manpower",
        ],
      },
      // realdata.md §18.1: Stock has no overall Production — the card pins
      // sub_section + product. No Production_product/Production_s level. Unit
      // (M/NOS) read from data.
      {
        id: "prod",
        name: "Production",
        agg: "SUM",
        drillType: "stkProd",
        drillTargets: ["Production_m", "Production_sku", "Production_m_sku"],
      },
      {
        id: "comp",
        name: "Plan_Compliance",
        agg: "AVG",
        drillType: null,
        drillTargets: null,
      },
    ],
    Q: [
      // realdata.md §15: FTQ has no data yet → null card. Units are read from
      // the data (realdata.md §7), not hardcoded — Scrap/Rework = NOS, NCM
      // follows the row (NOS/KG/M, or (unset)→blank).
      {
        id: "ftq",
        name: "FTQ",
        unit: "%",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["FTQ_m"],
      },
      {
        id: "scrap",
        name: "Scrap",
        agg: "SUM",
        drillType: "qScrapRework",
        drillTargets: [
          "Scrap_s",
          "Scrap_reason",
          "Scrap_m",
          "Scrap_sku",
          "Scrap_m_sku",
        ],
      },
      {
        id: "rw",
        name: "Rework",
        agg: "SUM",
        drillType: "qScrapRework",
        drillTargets: [
          "Rework_s",
          "Rework_reason",
          "Rework_m",
          "Rework_sku",
          "Rework_m_sku",
        ],
      },
      {
        id: "ncm",
        name: "NCM_Hold",
        agg: "SNAP",
        drillType: "table",
        drillTargets: ["NCM_Hold_sku"],
      },
    ],
    C: [
      {
        id: "spc",
        name: "Specific_Power",
        unit: "kWh/MT",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Specific_Power_m"],
      },
      {
        id: "scrc",
        name: "Scrap_Cost",
        unit: "₹L",
        agg: "SUM",
        drillType: null,
        drillTargets: null,
      },
      {
        id: "bud",
        name: "Budget_Util",
        unit: "%",
        agg: "AVG",
        drillType: "budget",
        drillTargets: null,
      },
    ],
    M: [
      // Absenteeism is plant-level (section=NULL/"nan") per spec §6 — shown on every
      // section's Morale tab. plantLevel flag tells the section filter to skip it.
      {
        id: "ab",
        name: "Absenteeism",
        unit: "%",
        agg: "AVG",
        plantLevel: true,
        drillType: "table",
        drillTargets: ["Absenteeism_section"],
      },
      {
        id: "tq",
        name: "TQM_Score",
        unit: "/5",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["TQM_pillar"],
      },
      {
        id: "sg",
        name: "Suggestions",
        unit: "/person",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Suggestions_category"],
      },
      {
        id: "tr",
        name: "Training",
        unit: "hrs/m",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Training_area"],
      },
    ],
    S: [
      {
        id: "ri",
        name: "Reportable",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["Reportable_log"],
      },
      {
        id: "fa",
        name: "First_Aid",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["First_Aid_log"],
      },
      {
        id: "nm",
        name: "Near_Miss",
        unit: "nos",
        agg: "SUM",
        drillType: "table",
        drillTargets: ["Near_Miss_category"],
      },
      {
        id: "sa",
        name: "Safety_Audit",
        unit: "%",
        agg: "AVG",
        drillType: "table",
        drillTargets: ["Audit_area"],
      },
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
    trendBaseline: null,
    trendFavourable: true,
    drillable: false,
    drillType: null,
    drillTargets: null,
    status: null,
    target: null,
    // new_change.md C6/C10/C14: no rows ⇒ no resolved date, nothing to label.
    resolvedDate: null,
    asOfDate: null,
    partialDay: false,
    truncated: false,
  };
}

/**
 * Group the fetched rows by kpi_name for ONE (section, category) view.
 * Plant-level KPIs (Absenteeism, spec §6) arrive with section="nan" and
 * bypass the section check. Extracted so the CURRENT window and the C15
 * BASELINE window are narrowed through exactly the same code path (C16 —
 * only the date window may differ between them).
 */
function buildKpiGroups(rows, { section, allowedNames, plantLevelNames }) {
  const groups = new Map();
  for (const r of rows ?? []) {
    if (!allowedNames.has(r.kpi_name)) continue;
    if (!plantLevelNames.has(r.kpi_name) && r.section !== section) continue;
    if (!groups.has(r.kpi_name)) groups.set(r.kpi_name, []);
    groups.get(r.kpi_name).push(r);
  }
  return groups;
}

/**
 * Narrow one KPI's rows down to the single pinned series the card renders:
 * one kpi_name, one product_type, one unit_of_measurement. Returns the
 * (possibly re-pointed) kpi_name alongside the rows — the TBM/Curing
 * Production card reads `Production_product` (C7).
 */
function selectSeries(
  groups,
  kpiDef,
  { section, productType, unitOfMeasurement, drilledKpiId },
) {
  let name = kpiDef.name;
  let groupDesc = groups.get(name) ?? [];

  // new_change.md C7: the TBM/Curing Production card is product-wise —
  // read Production_product and pin product_type to the selection (or the
  // section aggregate Cured Tyre / Green Tyre for "Overall"). Never leave
  // it unpinned: an unpinned read sums the aggregate WITH its children
  // (2×, C4). Falls back to the plain Production rows when the band
  // carries no Production_product row, so the card never blanks.
  let strictProductPin = null;
  if (
    kpiDef.name === "Production" &&
    (section === "TBM" || section === "Curing")
  ) {
    const { kpiName, productPin } = resolveProductionKpi(section, productType);
    const productRows = groups.get(kpiName) ?? [];
    if (productRows.length > 0) {
      name = kpiName;
      strictProductPin = productPin;
      groupDesc = productRows.filter(
        (r) =>
          canonicalizeProductType(r.product_type) ===
          canonicalizeProductType(productPin),
      );
    }
  }

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
  // new_change.md C7/C4: a strictly pinned series is already narrowed to
  // exactly one product_type — the soft "prefer, else fall back" rule
  // below would re-admit the aggregate row alongside its children.
  if (productType && !strictProductPin) {
    // changes.md §6: compare canonically so "Sidewall" rows match a
    // "SideWall" selection (and vice-versa) instead of splitting.
    const wantPt = canonicalizeProductType(productType);
    const matching = groupDesc.filter(
      (r) => canonicalizeProductType(r.product_type) === wantPt,
    );
    if (matching.length > 0) groupDesc = matching;
  }

  // new_change.md C8/C9: pin the selected unit when this series really
  // carries several (Stock Extruder / 3 Roll / Bead, Mixing KG vs Batch).
  // A no-match leaves the group alone rather than blanking the card.
  if (unitOfMeasurement) {
    const unitRows = groupDesc.filter(
      (r) =>
        canonicalUnit(r.unit_of_measurement) ===
        canonicalUnit(unitOfMeasurement),
    );
    if (unitRows.length > 0) groupDesc = unitRows;
  }

  // Some KPIs (Production) are recorded in MULTIPLE units in the same
  // period (e.g. MT *and* Batches), as separate rows. That makes the
  // "latest row" ambiguous. When a KPI declares a canonical `unit` and
  // the group carries more than one, keep only the canonical-unit rows.
  if (
    kpiDef.unit &&
    new Set(groupDesc.map((r) => r.unit_of_measurement)).size > 1
  ) {
    groupDesc = groupDesc.filter((r) => r.unit_of_measurement === kpiDef.unit);
  }

  // Production is recorded in BOTH a count unit ("Batch") and a mass unit
  // ("KG"/"MT") as separate rows, and declares no canonical `unit`. Without
  // a rule the headline shows whichever row sorts first — non-deterministic
  // (it flips Batch↔KG between renders). Rule: show "Batch" on the card
  // normally, and switch to the mass unit WHILE this card's drill is open
  // (matches the drill table, which reads mass units). Applies only when the
  // group actually carries a "Batch" row alongside another unit.
  if (!kpiDef.unit) {
    const units = new Set(groupDesc.map((r) => r.unit_of_measurement));
    if (units.size > 1 && units.has("Batch")) {
      const isDrilled = drilledKpiId != null && kpiDef.id === drilledKpiId;
      const wantUnit = isDrilled
        ? [...units].find((u) => u !== "Batch") // mass unit (KG / MT)
        : "Batch";
      if (wantUnit) {
        groupDesc = groupDesc.filter((r) => r.unit_of_measurement === wantUnit);
      }
    }
  }

  return { name, rows: groupDesc };
}

/** Rows at ONE granularity, newest date first. */
function atGranularity(rows, granularity) {
  return rows
    .filter((r) => sameGran(r.granularity, granularity))
    .sort((a, b) => (b.date > a.date ? 1 : -1));
}

/**
 * new_change.md C15/C16/C17: aggregate the BASELINE window with the same
 * pins and the same C5 class as the current window — additive KPIs summed,
 * rates averaged, levels latest. Returns null (⇒ blank spike, never "0 %",
 * "∞" or "−100 %") when the preceding window holds no value.
 */
function baselineAggregate(baselineGroups, kpiDef, narrowOpts, granularity) {
  if (!baselineGroups) return null;
  const { name, rows } = selectSeries(baselineGroups, kpiDef, narrowOpts);
  const values = atGranularity(rows, granularity)
    .map((r) => numberOrNull(r.actual_value))
    .filter((v) => v !== null);
  if (values.length === 0) return null;
  return aggregateForRange(values, name);
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
    // new_change.md C8/C9: the pinned unit_of_measurement. Applied only
    // where the series actually carries several units, so unit-less KPIs
    // (OEE, Plan Compliance) are untouched.
    unitOfMeasurement = null,
    // id of the card whose drill is currently open (null when none). Used
    // to switch a multi-unit KPI's headline unit while it is drilled.
    drilledKpiId = null,
    // new_change.md C6: { "<section>|<kpi_name>": "yyyy-mm-dd" } — each
    // KPI's OWN newest DAY date. Applied only when the user supplied no
    // explicit date/range (`useAnchors`); an explicit window always wins.
    anchors = null,
    useAnchors = false,
    // new_change.md C14: { "<section>|<yyyy-mm-dd>": shiftCount } — the
    // section's latest day while its shifts are still incomplete.
    partialDays = null,
    // new_change.md C15: the preceding comparison window, queried with the
    // IDENTICAL pins (C16) — only the date window moved.
    baselineRows = null,
    baselineWindow = null,
    // new_change.md C10: the row cap was hit, so any total is INCOMPLETE.
    truncated = false,
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
  // new_change.md C7: in TBM/Curing the Production CARD reads
  // Production_product, so those rows must survive the allow-list filter.
  if (section === "TBM" || section === "Curing") {
    allowedNames.add("Production_product");
  }
  const plantLevelNames = new Set(
    allowedKpis.filter((k) => k.plantLevel).map((k) => k.name),
  );

  // Filter rows to this section/category AND only spec KPI names.
  // sub_section + product_type are already filtered SERVER-SIDE (the
  // selection is sent in the fetch context), so we only need the
  // section/KPI-name narrowing here. Plant-level KPIs (e.g. Absenteeism,
  // spec §6) come back with section="nan"; they bypass the section check.
  const groupOpts = { section, allowedNames, plantLevelNames };
  const groups = buildKpiGroups(rows, groupOpts);
  if (groups.size === 0) return [];
  // C16: the baseline rows go through the SAME grouping + narrowing, so the
  // only difference between the two windows is the date.
  const baselineGroups = Array.isArray(baselineRows)
    ? buildKpiGroups(baselineRows, groupOpts)
    : null;
  const narrowOpts = { section, productType, unitOfMeasurement, drilledKpiId };

  // Build lookup for this section/category only.
  const kpiByName = new Map(allowedKpis.map((k) => [k.name, k]));

  // new_change.md C6: the newest anchor IN THIS SECTION. A KPI whose own
  // anchor is older than this one lags, and the card says so ("as of …").
  const sectionNewestAnchor = anchors
    ? Object.entries(anchors).reduce(
        (max, [k, v]) =>
          k.startsWith(`${section}|`) && typeof v === "string" && v > max
            ? v
            : max,
        "",
      )
    : "";

  const result = [];
  // Iterate in the FIXED spec order (allowedKpis) — NEVER in data-arrival
  // order — so each KPI always occupies the same slot (e.g. OEE,
  // Production, Downtime, Plan Compliance). A KPI with no data for the
  // current view gets a placeholder card, so the grid never reflows.
  for (const kpiDef of allowedKpis) {
    // Narrow to the ONE pinned series this card renders (kpi_name,
    // product_type, unit_of_measurement) — the same function the baseline
    // window goes through, so only the date differs between them (C16).
    const { name, rows: groupDesc } = selectSeries(groups, kpiDef, narrowOpts);

    // Snapshot path: pick the LATEST row at the active granularity
    // and read actual_value verbatim. Works for Today (Daily), Month
    // (MTD), Year (YTD) — gold_dummy already stored the right
    // pre-aggregated value, no client roll-up needed.
    if (isSnapshot) {
      let preRows = atGranularity(groupDesc, granularity);
      if (preRows.length === 0) {
        result.push(placeholderCard(kpiDef));
        continue;
      }

      // new_change.md C6: anchor the card to THIS KPI's own newest DAY
      // date, not one global latest date. Curing OEE_o ends 2026-07-16
      // while Production runs to 07-20, so a global anchor asks for a day
      // with zero OEE rows — blank card, dead drill. Only when the user
      // supplied no explicit date/range: an explicit window always wins
      // (C1/C6 "Interaction with C1"). The anchor is applied only if the
      // fetched window actually reaches it; otherwise we keep the newest
      // row in the window rather than blanking the card.
      let resolvedDate = null;
      const anchor =
        useAnchors && anchors ? anchors[`${section}|${name}`] : null;
      if (anchor) {
        const upToAnchor = preRows.filter((r) => isoDate(r.date) <= anchor);
        if (upToAnchor.length > 0 && isoDate(upToAnchor[0].date) === anchor) {
          preRows = upToAnchor;
          resolvedDate = anchor;
        }
      }
      if (!resolvedDate) resolvedDate = isoDate(preRows[0].date) || null;

      const kpi = kpiByName.get(name) ?? kpiDef;
      const numericVals = preRows
        .map((r) => numberOrNull(r.actual_value))
        .filter((v) => v !== null);
      if (numericVals.length === 0) {
        result.push(placeholderCard(kpiDef));
        continue;
      }

      const value = Math.round(numericVals[0] * 100) / 100; // newest
      const sparkVals = numericVals.slice(0, sparkLength).reverse();

      // new_change.md C14 / spike defect S-3: the section's latest day is
      // still IN PROGRESS (its shifts are incomplete). Comparing a part-day
      // against a full previous day reads as a catastrophic drop (~-75 %)
      // but is a pure artefact, so the spike is suppressed entirely and the
      // card says the day is still running.
      const partialDay = Boolean(
        partialDays &&
        resolvedDate &&
        partialDays[`${section}|${resolvedDate}`],
      );

      // new_change.md C15/C16: the spike baseline is a DEFINED previous
      // period of the IDENTICAL pinned series — only the date window moves.
      // Day-wise / a shift on date D -> the same shift on D-1, read from
      // the rows already in hand. MONTH-wise -> the previous COMPLETE
      // month, which only the backend baseline window carries.
      const latest = preRows[0];
      let trend = null;
      let trendBaseline = null;
      if (partialDay) {
        // suppressed — blank, never "0 %", "∞" or "−100 %" (C18)
      } else if (normGran(granularity) === "MONTH") {
        trend = spikePct(
          value,
          baselineAggregate(baselineGroups, kpiDef, narrowOpts, granularity),
        );
        if (trend != null) {
          trendBaseline = formatBaselineWindow(baselineWindow, granularity);
        }
      } else {
        const wantPrev = prevDayIso(resolvedDate);
        const prevRow = preRows.find((r) => isoDate(r.date) === wantPrev);
        trend = spikePct(
          value,
          prevRow ? numberOrNull(prevRow.actual_value) : null,
        );
        if (trend != null) trendBaseline = `vs ${fmtDayLabel(wantPrev)}`;
      }

      result.push({
        id: kpi.id,
        name: DISPLAY_NAME[kpiDef.name] ?? kpiDef.name,
        rawName: name,
        value,
        unit: kpi.unit ?? denan(latest.unit_of_measurement) ?? null,
        spark: sparkVals,
        trend,
        trendBaseline,
        trendFavourable: trendFavourable(kpiDef.name, trend),
        drillable: kpi.drillType != null,
        drillType: kpi.drillType,
        drillTargets: kpi.drillTargets ?? null,
        status: mapStatus(denan(latest.status)),
        target: numberOrNull(latest.threshold_value),
        // C3/C6: the drill inherits THIS date — it never resolves its own.
        resolvedDate,
        // C6: only labelled when this KPI actually lags the section's
        // newest anchor; the up-to-date cards stay unadorned.
        asOfDate:
          sectionNewestAnchor &&
          resolvedDate &&
          resolvedDate < sectionNewestAnchor
            ? resolvedDate
            : null,
        partialDay,
        // C10: a hit row cap means this total is INCOMPLETE.
        truncated,
      });
      continue;
    }

    // Aggregate path — sum / avg per spec §9 over the active range.
    // Use the active granularity (Daily by default; Shift A/B/C when
    // the user picked a specific shift), sort newest-first.
    const dailyRows = atGranularity(groupDesc, granularity);

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

    const kpi = kpiByName.get(name) ?? kpiDef;

    // new_change.md C5: the range aggregation class comes from the KPI's
    // own name — SUM for additive flows, AVERAGE for rates (missing days
    // are skipped by the numericVals filter above, never counted as 0),
    // LATEST-in-range for Inventory levels. NCM_Hold's SNAP snapshot agg
    // still sums over a custom range (changes.md §8.2), which is exactly
    // what the additive default gives it.
    let value = aggregateForRange(numericVals, name);
    value = Math.round(value * 100) / 100;

    // Sparkline: up to N most-recent Daily values, oldest→newest so the
    // chart reads left-to-right.
    const sparkVals = numericVals.slice(0, sparkLength).reverse();

    // new_change.md C15 (Q4) + C17: a custom range compares with the
    // immediately preceding window of EQUAL length (1-16 Jul -> 15-30 Jun),
    // fetched by the backend with the identical pins (C16) and aggregated
    // here with the SAME C5 class as the current window. A within-window
    // day-over-day fallback would be a different, wrong comparison (defect
    // S-2), so a missing/zero baseline still renders BLANK.
    const trend = spikePct(
      value,
      baselineAggregate(baselineGroups, kpiDef, narrowOpts, granularity),
    );
    const trendBaseline =
      trend != null ? formatBaselineWindow(baselineWindow, granularity) : null;

    const latest = dailyRows[0];
    result.push({
      id: kpi.id,
      name: DISPLAY_NAME[kpiDef.name] ?? kpiDef.name,
      rawName: name,
      value,
      unit: kpi.unit ?? denan(latest.unit_of_measurement) ?? null,
      spark: sparkVals,
      trend,
      trendBaseline,
      trendFavourable: trendFavourable(kpiDef.name, trend),
      drillable: kpi.drillType != null,
      drillType: kpi.drillType,
      drillTargets: kpi.drillTargets ?? null,
      status: mapStatus(denan(latest.status)),
      target: numberOrNull(latest.threshold_value),
      // C3: an explicit range card hands its window down, not a single date.
      resolvedDate: null,
      asOfDate: null,
      partialDay: false,
      // C10: never present a capped range total as if it were complete.
      truncated,
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
    productType: canonicalizeProductType(r.product_type),
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
  if (isEmptyToken(v)) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/* ---------- new_change.md C18: spike direction ----------
 * An EXPLICIT table keyed on kpi_name — never a substring match (defect
 * S-5: any future KPI whose name merely contains "scrap"/"hold"/"loss"
 * would flip its arrow). Unlisted KPIs default to higher-is-better, so
 * adding a lower-is-better KPI requires an explicit entry here.
 */
const LOWER_IS_BETTER = new Set([
  "Scrap",
  "Scrap_s",
  "Scrap_reason",
  "Scrap_m",
  "Scrap_sku",
  "Scrap_m_sku",
  "Scrap_Cost",
  "Scrap_Rate",
  "Rework",
  "Rework_s",
  "Rework_reason",
  "Rework_m",
  "Rework_sku",
  "Rework_m_sku",
  "NCM_Hold",
  "NCM_Hold_sku",
  "Defect_Scrap",
  "Absenteeism",
  // the six OEE loss reasons (durations, in minutes)
  "Breakdown",
  "No Schedule",
  "Power Failure",
  "Preventive Maintenance",
  "Setup & Change",
  "Operations/Material/Manpower",
  // safety incident counts
  "Reportable",
  "First_Aid",
  "Near_Miss",
]);

export function isLowerBetterKpi(kpiName) {
  return LOWER_IS_BETTER.has(kpiName);
}

/** new_change.md C18: neutral when there is no spike to judge. */
function trendFavourable(kpiName, trend) {
  if (trend === null || trend === undefined) return true;
  return isLowerBetterKpi(kpiName) ? trend <= 0 : trend >= 0;
}

/* ---------- new_change.md C15/C18: spike helpers ---------- */

/**
 * Spike %, rounded to ONE decimal. Blank (null) whenever the baseline is
 * missing or zero — never "0 %", never ∞, never a −100 % artefact.
 */
function spikePct(current, baseline) {
  if (current == null || baseline == null || baseline === 0) return null;
  return Math.round(((current - baseline) / Math.abs(baseline)) * 1000) / 10;
}

/** Row date (ISO yyyy-mm-dd or dd-mm-yyyy) → ISO yyyy-mm-dd. */
function isoDate(d) {
  if (typeof d !== "string") return "";
  const s = d.length > 10 ? d.slice(0, 10) : d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** The calendar day before an ISO date ("" when unparseable). */
function prevDayIso(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() - 1);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-07-18" → "18 Jul" — the baseline period shown on hover (C18). */
function fmtDayLabel(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTH_ABBR[Number(m) - 1]}`;
}

/**
 * new_change.md C15/C18: name the baseline period so the comparison is
 * auditable on hover. `window` is the backend's `baselineWindow`:
 *   day-wise   { date: "2026-07-18" }        -> "vs 18 Jul"
 *   range      { from, to }                  -> "vs 15–30 Jun"
 *   whole month{ from: 1st, to: last }       -> "vs Jun"
 *   open-ended / undefinable  null           -> null (no label, no spike)
 */
export function formatBaselineWindow(window, granularity = null) {
  if (!window) return null;
  const date = isoDate(window.date ?? "");
  if (date) return `vs ${fmtDayLabel(date)}`;
  const from = isoDate(window.from ?? "");
  const to = isoDate(window.to ?? "");
  if (!from || !to) return null;
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  // A whole calendar month (MONTH granularity, 1st → last day) reads as the
  // month name — "vs Jun", not "vs 1–30 Jun".
  if (sameMonth && from.endsWith("-01") && isLastDayOfMonth(to)) {
    return `vs ${MONTH_ABBR[Number(from.slice(5, 7)) - 1]}`;
  }
  void granularity;
  if (sameMonth) {
    return `vs ${Number(from.slice(8))}–${fmtDayLabel(to)}`;
  }
  return `vs ${fmtDayLabel(from)} – ${fmtDayLabel(to)}`;
}

function isLastDayOfMonth(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m, 0).getDate() === d;
}

/** Map gold_dummy status string to front-end chip shape. */
function mapStatus(s) {
  if (s === "Green" || s === "Red" || s === "Yellow") return s;
  return null;
}
