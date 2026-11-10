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

import {
  canonicalUnitLabel,
  isKg,
  kgToTonnes,
  toDisplayQuantity,
} from "./units.js";
import { toDisplayDate } from "./dateFormat.js";
import { isProductAgnosticKpi } from "./dashboardRowScopes.js";
import {
  CTP_TOTAL_DOWNTIME_KPI,
  usesCtpProductionDowntime,
} from "./ctpDowntime.js";
import {
  DOWNTIME_REASONS,
  CARD_DOWNTIME_REASONS,
  TOTAL_DOWNTIME_NAME,
} from "./downtime.js";

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
// The alias map itself lives in lib/units.js, so the value a filter
// compares on and the label the card prints can never drift apart.
export function canonicalUnit(raw) {
  const d = denan(raw);
  if (d == null) return null;
  const u = String(d).trim();
  if (u === "" || u === "(unset)") return null;
  return canonicalUnitLabel(u).toUpperCase();
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

/**
 * The "as of" date of a card, or null when it needs none.
 *
 * DAY and shift cards lag when their date is older than the section's newest
 * anchor. A MONTH row is always dated the 1st, so that comparison is
 * meaningless there: the date worth showing is the newest DAY the KPI has
 * inside the displayed month ("as of 22 Oct"). A past month is complete, so
 * its card shows no date.
 */
function asOfFor({ resolvedDate, sectionAnchor, ownAnchor, granularity }) {
  if (!resolvedDate) return null;
  if (sameGran(granularity, "MONTH")) {
    return ownAnchor && ownAnchor.slice(0, 7) === resolvedDate.slice(0, 7)
      ? ownAnchor
      : null;
  }
  return sectionAnchor && resolvedDate < sectionAnchor ? resolvedDate : null;
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

/**
 * Curing PCR Production card source. The gold Production / Production_product
 * rows for CTP Curing PCR carry only the "Others" trench (2026-09-28: 11,738),
 * while the Databricks total includes Trench1 + Trench2 (13,326). The SKU
 * leaf still carries every trench and sums to the gold total at DAY/SHIFT.
 * MONTH snapshots keep using Production_product: the monthly SKU feed can
 * contain shift-total rows, which inflates a full-month card.
 */
export const CURING_PCR_TOTAL_KPI = "Production_sku";

/** True only for the Curing section on the PCR tyre line. */
export function readsCuringPcrSkuTotal(section, tyreType, granularity = null) {
  return (
    section === "Curing" &&
    String(tyreType ?? "").toUpperCase() === "PCR" &&
    normGran(granularity) !== "MONTH"
  );
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
      // CR-11: Total Downtime = sum of the 6 OEE-availability-loss
      // reason leaves (Breakdown, No Schedule, Power Failure, Preventive
      // Maintenance, Setup & Change, Operations/Material/Manpower). The
      // card value/spark fall out of selectSeries' virtual-row synthesis
      // (Q-DT-01).
      {
        id: "downtime",
        name: TOTAL_DOWNTIME_NAME,
        unit: "min",
        agg: "SUM",
        drillType: "downtime",
        drillTargets: DOWNTIME_REASONS,
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
      // CR-11: Total Downtime = sum of the 6 OEE-availability-loss
      // reason leaves (Breakdown, No Schedule, Power Failure, Preventive
      // Maintenance, Setup & Change, Operations/Material/Manpower). The
      // card value/spark fall out of selectSeries' virtual-row synthesis
      // (Q-DT-01).
      {
        id: "downtime",
        name: TOTAL_DOWNTIME_NAME,
        unit: "min",
        agg: "SUM",
        drillType: "downtime",
        drillTargets: DOWNTIME_REASONS,
      },
      {
        id: "comp",
        name: "Plan_Compliance",
        agg: "AVG",
        drillType: "compliance",
        drillTargets: [
          "Building_Fulfilled_Qty_sku",
          "Building_Planned_Qty_sku",
        ],
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
      // CR-11: Total Downtime = sum of the 6 OEE-availability-loss
      // reason leaves (Breakdown, No Schedule, Power Failure, Preventive
      // Maintenance, Setup & Change, Operations/Material/Manpower). The
      // card value/spark fall out of selectSeries' virtual-row synthesis
      // (Q-DT-01).
      {
        id: "downtime",
        name: TOTAL_DOWNTIME_NAME,
        unit: "min",
        agg: "SUM",
        drillType: "downtime",
        drillTargets: DOWNTIME_REASONS,
      },
      {
        id: "comp",
        name: "Plan_Compliance",
        agg: "AVG",
        drillType: "compliance",
        drillTargets: ["Curing_Fulfilled_Qty_sku", "Curing_Planned_Qty_sku"],
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
      // CR-11: Total Downtime = sum of the 6 OEE-availability-loss
      // reason leaves (Breakdown, No Schedule, Power Failure, Preventive
      // Maintenance, Setup & Change, Operations/Material/Manpower). The
      // card value/spark fall out of selectSeries' virtual-row synthesis
      // (Q-DT-01).
      {
        id: "downtime",
        name: TOTAL_DOWNTIME_NAME,
        unit: "min",
        agg: "SUM",
        drillType: "downtime",
        drillTargets: DOWNTIME_REASONS,
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
  Plan_Compliance: "SKU Plan Fulfillment",
  // CR-11: virtual kpi_name. The card shows the sum of the 6
  // OEE-availability-loss reasons.
  [TOTAL_DOWNTIME_NAME]: "Total Downtime",
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
 * The gold `kpi_name` values the grid actually renders for a (section, tab).
 *
 * Derived from ALLOWED_KPIS rather than duplicated, so the landing FETCH and
 * the landing FILTER can never drift: toKpiGrid narrows incoming rows to
 * exactly this set (see `allowedNames` below), and the fetch now asks the
 * backend for exactly this set. Anything else the query returned was read,
 * parsed and dropped.
 *
 * Includes the C7 `Production_product` exception for TBM/Curing, matching the
 * addition toKpiGrid makes to its own allow-list.
 *
 * @param {string} section gold section value ("Mixing" | "TBM" | "Curing" | "Stock")
 * @param {string} category tab id, uppercase ("P" | "Q" | "C" | "M" | "S")
 * @returns {string[]} kpi_names, or [] when the combo has no catalogue entry
 *          (callers must treat [] as "no filter", never as "fetch nothing")
 */
export function landingKpiNames(section, category) {
  const defs = ALLOWED_KPIS[section]?.[category] ?? [];
  if (defs.length === 0) return [];
  const names = new Set(defs.map((k) => k.name));
  // CR-11 / Q-DT-01: "TotalDowntime" is a frontend virtual kpi_name and is
  // NOT expanded here. The 6 reason leaves sit at drill_down_level=2 — the
  // landing band never returns them — so they come from the dedicated DAY
  // fetch in useDashboardFetch and reach toKpiGrid via `downtimeRows`.
  // Expanding them here only inflated the landing payload with names the
  // LANDING_PREDICATE cannot match.
  names.delete(TOTAL_DOWNTIME_NAME);
  if (section === "TBM" || section === "Curing") {
    names.add("Production_product");
  }
  const cat = String(category || "").toUpperCase();
  if (cat === "P") {
    if (section === "TBM") {
      names.add("Building_Fulfilled_Qty_sku");
      names.add("Building_Planned_Qty_sku");
    } else if (section === "Curing") {
      names.add("Curing_Fulfilled_Qty_sku");
      names.add("Curing_Planned_Qty_sku");
    }
  }
  return [...names];
}

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
    topMachine: null,
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

// The series the unit pills actually describe — they are built from the
// Production rows' (product_type, unit) pairs. On the SOFT path (Banmore)
// only these honour a unit pin strictly; the strict path pins every series.
const UNIT_PINNED_SERIES = new Set([
  "Production",
  "Production_product",
  "Production_s",
  "Production_m",
  "Production_sku",
  "Production_m_sku",
]);

/**
 * Plants whose filter pins are honoured strictly (no fall back to a
 * line-level or neighbouring row). CTP only — Banmore keeps the soft
 * behaviour it shipped with. Matched against the route's plantId, which
 * is "chennai" from the plants list and "ctp" from the aliases.
 */
const STRICT_FILTER_PLANTS = new Set(["chennai", "ctp"]);

/**
 * KPI → sections whose unpinned card sums every product / status row.
 * TBM / Curing Production is excluded: its Green Tyre / Cured Tyre row
 * already totals the other products (and Carcass is the same tyres at an
 * earlier stage), so summing would double-count.
 */
const ALL_PRODUCT_SUM_SECTIONS = new Map([
  ["Production", new Set(["Mixing", "Stock"])],
  ["NCM_Hold", new Set(["Mixing", "Stock", "TBM", "Curing"])],
]);

/**
 * Units an all-product total is read in, best first: counts before mass
 * before length. Rows with no unit only count when nothing else exists.
 */
const PREFERRED_UNITS = ["BATCH", "NOS", "KG", "MT", "M"];

/**
 * The rows in the one unit an all-product total is shown in — values in
 * different units never add up (Extruder records Tread in NOS and M). The
 * kept rows share one spelling of that unit ("Meter" / "Meters" → the
 * first seen), so sumRowsPerPeriod folds each period into a single row.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
function inPreferredUnit(rows) {
  const rank = (u) => {
    if (u == null) return Number.MAX_SAFE_INTEGER;
    const i = PREFERRED_UNITS.indexOf(u);
    return i === -1 ? PREFERRED_UNITS.length : i;
  };
  const [unit] = [
    ...new Set(rows.map((r) => canonicalUnit(r.unit_of_measurement))),
  ].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
  const kept = rows.filter(
    (r) => canonicalUnit(r.unit_of_measurement) === unit,
  );
  const spelling = kept[0]?.unit_of_measurement;
  return kept.map((r) => ({ ...r, unit_of_measurement: spelling }));
}

/** CTP quality counts summed per day across their level-1 rows. */
const SUMMED_QUALITY_KPIS = new Set(["Scrap", "Rework", "NCM_Hold"]);

/**
 * CTP cards that read their own newest day when the pinned headline day has
 * no row yet. Their feeds land behind Production (2026-10-07: OEE_o and
 * NCM_Hold end 10-06, the downtime reasons 10-05), so under the Today preset
 * they showed "—" all day. The card says which day it is via `asOfDate`.
 */
const LATEST_DAY_FALLBACK_KPIS = new Set([
  "OEE_o",
  "TotalDowntime",
  "Scrap",
  "Rework",
  "NCM_Hold",
]);

/**
 * CR-11 follow-up: the single machine with the most downtime across a set
 * of synthesised TotalDowntime rows (each carrying a per-date `machineTotals`
 * map — see selectSeries). Mirrors:
 *   SELECT machine, SUM(actual_value) ... GROUP BY machine ORDER BY 2 DESC LIMIT 1
 * Already scoped to CARD_DOWNTIME_REASONS (no 'No Schedule') because that's
 * the reason set `machineTotals` was built from.
 */
function topDowntimeMachine(rows) {
  const totals = new Map();
  for (const r of rows ?? []) {
    if (!r.machineTotals) continue;
    for (const [m, v] of r.machineTotals) {
      totals.set(m, (totals.get(m) ?? 0) + v);
    }
  }
  let machine = null;
  let minutes = 0;
  for (const [m, v] of totals) {
    if (v > minutes) {
      machine = m;
      minutes = v;
    }
  }
  return machine ? { machine, minutes: Math.round(minutes * 100) / 100 } : null;
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
  {
    section,
    productType,
    unitOfMeasurement,
    drilledKpiId,
    strictFilters,
    tyreType = null,
    granularity = null,
    downtimeByReason = null,
  },
) {
  let name = kpiDef.name;
  let groupDesc = groups.get(name) ?? [];

  // TotalDowntime is a display/virtual name. CTP Production reads the
  // stored Total_Downtime; legacy and Technical cards synthesise reasons.
  // CR-11 / Q-DT-01: Synthesise
  // per-date rows by summing the 6 OEE-availability-loss reason leaves,
  // read ONLY from `downtimeByReason` — the dedicated DAY fetch, indexed
  // by toKpiGrid. Never from `groups`: a reason/OEE drill puts a second
  // copy of the same leaves in the shared row array, and summing both
  // doubled the tile. The existing card builder consumes the synthesised
  // rows verbatim — value/spark/etc. fall out of the normal SUM.
  //
  // The synthesised granularity matches the dominant source granularity
  // (most rows in the 6 reasons share the same granularity — the
  // dashboard's active preset pins it). Without this, atGranularity
  // would filter the synthesised rows out and the card would render
  // the "—" placeholder even though the chart (which doesn't gate on
  // granularity) renders correctly.
  if (name === TOTAL_DOWNTIME_NAME) {
    if (kpiDef.directTotal) {
      // CTP Production reads the stored total independently of the reasons.
      // Do not dedupe, infer missing totals from reasons, or average machines.
      const gran = normGran(granularity).startsWith("SHIFT")
        ? granularity
        : "DAY";
      return {
        name,
        rows: atGranularity(
          sumRowsPerPeriod(groups.get(CTP_TOTAL_DOWNTIME_KPI) ?? []),
          gran,
        ),
      };
    }
    if (!downtimeByReason) return { name: TOTAL_DOWNTIME_NAME, rows: [] };
    const perDate = new Map();
    const granularityCount = new Map();
    // CARD_DOWNTIME_REASONS excludes 'No Schedule' — a planned non-run, not
    // machine downtime — so it never enters the card's sum, its per-machine
    // average denominator, or the "top machine" figure below. The
    // drill-down reads the full 6-reason set directly from `downtimeRows`,
    // independently of this synthesis (see DowntimeDrillPanel.jsx).
    // A kpiDef may narrow the SUM to its own `reasons` (the Technical
    // dashboard's single-reason Breakdown / Setup & Change cards). Those
    // cards show the reason's total machine-minutes — the figure gold and
    // their drill report — so they record no fleet and are never divided
    // per machine (Sep 2026 Mixing Setup & Change: 7,387 min, not the
    // 7,387 / 5 = 1,477.4 average). The Production tile carries no
    // `reasons` and keeps its per-machine average.
    for (const reason of CARD_DOWNTIME_REASONS) {
      const g = downtimeByReason.get(reason);
      if (!g) continue;
      const counted = !kpiDef.reasons || kpiDef.reasons.includes(reason);
      for (const r of g) {
        const raw = numberOrNull(r.actual_value);
        if (raw == null || r.date == null) continue;
        const v = counted ? raw : 0;
        const d = r.date;
        const prev = perDate.get(d);
        if (prev) prev.actual_value += v;
        else
          perDate.set(d, {
            date: r.date,
            actual_value: v,
            granularity: r.granularity,
            unit_of_measurement: r.unit_of_measurement,
            // Which machines contributed to THIS date. Machines break down
            // concurrently, so the per-date sum is machine-minutes; the card
            // divides by this set to get elapsed downtime for a typical
            // machine. Tracked per date because the active fleet varies.
            machines: new Set(),
            // Per-machine totals for THIS date, so the card can name the
            // single highest-downtime machine (SUM(actual_value) GROUP BY
            // machine, same 5-reason scope as the headline).
            machineTotals: new Map(),
          });
        const bucket = prev ?? perDate.get(d);
        if (!isEmptyToken(r.machine)) {
          if (!kpiDef.reasons) bucket.machines.add(r.machine);
          if (counted) {
            bucket.machineTotals.set(
              r.machine,
              (bucket.machineTotals.get(r.machine) ?? 0) + v,
            );
          }
        }
        if (r.granularity) {
          granularityCount.set(
            r.granularity,
            (granularityCount.get(r.granularity) ?? 0) + 1,
          );
        }
      }
    }
    // Pin granularity to the most common one across the inputs so
    // atGranularity's filter matches the synthesised rows.
    let pinnedGranularity = "";
    let bestCount = 0;
    for (const [g, c] of granularityCount) {
      if (c > bestCount) {
        pinnedGranularity = g;
        bestCount = c;
      }
    }
    for (const row of perDate.values()) {
      row.granularity = row.granularity ?? pinnedGranularity;
    }
    const synthesized = [...perDate.values()].sort((a, b) => {
      const ai = isoDate(a.date);
      const bi = isoDate(b.date);
      // Newest first. ISO strings compare correctly lexicographically,
      // so a numeric `bi - ai` would coerce to NaN — compare lexically.
      if (ai < bi) return 1;
      if (ai > bi) return -1;
      return 0;
    });
    return { name: TOTAL_DOWNTIME_NAME, rows: synthesized };
  }

  // SKU Plan Fulfillment (Plan_Compliance) synthesis for TBM & Curing
  if (
    kpiDef.name === "Plan_Compliance" &&
    (section === "TBM" || section === "Curing")
  ) {
    const feed =
      section === "TBM"
        ? {
            fulfilled: "Building_Fulfilled_Qty_sku",
            planned: "Building_Planned_Qty_sku",
          }
        : {
            fulfilled: "Curing_Fulfilled_Qty_sku",
            planned: "Curing_Planned_Qty_sku",
          };

    let fulfilledRows = groups.get(feed.fulfilled) ?? [];
    let plannedRows = groups.get(feed.planned) ?? [];

    if (fulfilledRows.length > 0 || plannedRows.length > 0) {
      const aggProduct = AGGREGATE_PRODUCT[section]; // "Green Tyre" or "Cured Tyre"
      const isAggProduct =
        !productType ||
        productType === "all" ||
        (aggProduct &&
          canonicalizeProductType(productType) ===
            canonicalizeProductType(aggProduct));

      if (!isAggProduct) {
        const wantPt = canonicalizeProductType(productType);
        fulfilledRows = fulfilledRows.filter(
          (r) => canonicalizeProductType(r.product_type) === wantPt,
        );
        plannedRows = plannedRows.filter(
          (r) => canonicalizeProductType(r.product_type) === wantPt,
        );
      }

      // Group by date and itemcode to calculate per-SKU fulfillment % and weighted average
      const perDateItems = new Map();
      const granularityCount = new Map();

      const addToItemMap = (r, type) => {
        const v = numberOrNull(r.actual_value);
        if (v == null || r.date == null) return;
        const d = isoDate(r.date);
        if (!d) return;
        const item = r.itemcode || "UNKNOWN";
        const dateMap = perDateItems.get(d) || new Map();
        const entry = dateMap.get(item) || {
          date: r.date,
          itemcode: item,
          fulfilled: 0,
          planned: 0,
          granularity: r.granularity,
        };
        if (type === "fulfilled") entry.fulfilled += v;
        if (type === "planned") entry.planned += v;
        dateMap.set(item, entry);
        perDateItems.set(d, dateMap);

        if (r.granularity) {
          granularityCount.set(
            r.granularity,
            (granularityCount.get(r.granularity) ?? 0) + 1,
          );
        }
      };

      const dedupeFeed = (rows) => {
        const seen = new Set();
        const result = [];
        for (const r of rows) {
          const key = [
            isoDate(r.date),
            r.granularity || "",
            r.kpi_name || r.kpiName || "",
            r.itemcode || r.itemCode || "",
            r.product_type || r.productType || "",
            r.machine || "",
          ].join("||");
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(r);
        }
        return result;
      };

      for (const r of dedupeFeed(fulfilledRows)) addToItemMap(r, "fulfilled");
      for (const r of dedupeFeed(plannedRows)) addToItemMap(r, "planned");

      let pinnedGranularity = "";
      let bestCount = 0;
      for (const [g, c] of granularityCount) {
        if (c > bestCount) {
          pinnedGranularity = g;
          bestCount = c;
        }
      }

      const synthesized = [...perDateItems.entries()]
        .map(([d, itemMap]) => {
          let numSum = 0;
          let denSum = 0;
          let totalFulfilled = 0;
          let totalPlanned = 0;
          let sampleDate = null;
          let rowGranularity = null;

          const skuBreakdown = [];
          for (const itemData of itemMap.values()) {
            if (!sampleDate) sampleDate = itemData.date;
            if (!rowGranularity && itemData.granularity)
              rowGranularity = itemData.granularity;

            totalFulfilled += itemData.fulfilled;
            totalPlanned += itemData.planned;

            if (itemData.planned > 0) {
              const cappedFulfilled = Math.min(
                itemData.fulfilled,
                itemData.planned,
              );
              numSum += cappedFulfilled;
              denSum += itemData.planned;
              skuBreakdown.push({
                itemcode: itemData.itemcode,
                fulfilled: itemData.fulfilled,
                planned: itemData.planned,
                skuPct: (itemData.fulfilled / itemData.planned) * 100,
              });
            }
          }

          // SKU Plan Fulfillment % = Σ MIN(Actual SKU, Plan SKU) / Σ Plan SKU * 100
          const weightedRatio = denSum > 0 ? (numSum / denSum) * 100 : 0;

          return {
            date: sampleDate || d,
            actual_value: weightedRatio,
            produced: totalFulfilled,
            planned: totalPlanned,
            shortfall: totalPlanned - totalFulfilled,
            granularity: rowGranularity ?? pinnedGranularity,
            unit_of_measurement: "%",
            skuBreakdown,
          };
        })
        .sort((a, b) => {
          const ai = isoDate(a.date);
          const bi = isoDate(b.date);
          if (ai < bi) return 1;
          if (ai > bi) return -1;
          return 0;
        });

      return { name: "Plan_Compliance", rows: synthesized };
    }
  }

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
    const pinnedToProduct = (rows) =>
      rows.filter(
        (r) =>
          canonicalizeProductType(r.product_type) ===
          canonicalizeProductType(productPin),
      );
    // CTP reads the plain Production rows — the figure the gold validation
    // checks — pinned to the product and summed per period across trenches
    // and tyre lines. Production_product is missing for Carcass and drifts
    // from Production for Green Tyre (Sep–Oct 2026: 22 of 37 days, up to 81
    // tyres); Production_sku overstates Carcass. The levels below remain
    // the fallback when a window carries no plain Production row.
    const plainRows = strictFilters ? pinnedToProduct(groupDesc) : [];
    if (plainRows.length > 0) {
      strictProductPin = productPin;
      groupDesc = sumRowsPerPeriod(uniqueLeafRows(plainRows));
    } else {
      const productRows = groups.get(kpiName) ?? [];
      if (productRows.length > 0) {
        name = kpiName;
        strictProductPin = productPin;
        groupDesc = sumRowsPerPeriod(
          uniqueLeafRows(pinnedToProduct(productRows)),
        );
      }
      if (readsCuringPcrSkuTotal(section, tyreType, granularity)) {
        const skuRows = pinnedToProduct(groups.get(CURING_PCR_TOTAL_KPI) ?? []);
        if (skuRows.length > 0) {
          name = kpiName;
          strictProductPin = productPin;
          groupDesc = sumRowsPerPeriod(uniqueLeafRows(skuRows));
        }
      }
    }
  }

  // Equipment-level KPIs (OEE, Downtime, …) are exempted from the
  // server-side product_type filter (see PRODUCT_AGNOSTIC_KPIS in the
  // backend), so a group may carry rows for several product types.
  //
  // `strictFilters` decides what a no-match means, and it is per PLANT:
  //
  //   CTP (strict)  — a selected filter is honoured exactly. No match
  //     empties the group and the card renders "—", because "no data for
  //     what you picked" is a real answer. CTP Stock has 12 products with
  //     rows but no values, and borrowing a neighbour's number there
  //     misreports the plant.
  //
  //   Banmore (soft) — PREFER rows matching the selection, and fall back
  //     to the line-level rows otherwise. Banmore records OEE once per
  //     line with an EMPTY product_type (Mixing: 49 such rows), so strict
  //     matching blanks the OEE card the moment a compound is picked —
  //     while the sidebar donut, which reads /plants/:id/section-oee,
  //     still shows the value. Banmore is the live plant and must keep
  //     the behaviour it shipped with.
  //
  // Product-specific KPIs (Production, etc.) are already narrowed
  // server-side, so the match keeps all of them (no-op) on either path
  // and they never fall back to a different product.
  //
  // new_change.md C7/C4: a strictly pinned series is already narrowed to
  // exactly one product_type, so the match below would re-admit the
  // aggregate row alongside its children — skip it there.
  //
  // CTP records the OEE family per section/machine with NO product_type
  // and a "%" unit, so it is never a product or unit series: the strict
  // pins below would only ever empty it ("—" on the card while the sidebar
  // shows the value). Skip both pins for those KPIs on strict plants; the
  // card then shows exactly the rows in the selected window, nothing else.
  const pinsApply = !(strictFilters && isProductAgnosticKpi(name));
  if (pinsApply && productType && !strictProductPin) {
    // changes.md §6: compare canonically so "Sidewall" rows match a
    // "SideWall" selection (and vice-versa) instead of splitting.
    const wantPt = canonicalizeProductType(productType);
    const matching = groupDesc.filter(
      (r) => canonicalizeProductType(r.product_type) === wantPt,
    );
    if (strictFilters || matching.length > 0) groupDesc = matching;
  }

  // new_change.md C8/C9: pin the selected unit when this series really
  // carries several (Stock Extruder / 3 Roll / Bead, Mixing KG vs Batch).
  // Same per-plant split as the product pin above. On Banmore a no-match
  // leaves the group alone EXCEPT for the series the unit pills actually
  // describe (UNIT_PINNED_SERIES) — the option list spans all history, and
  // falling back there showed one unit's total under another unit's pill.
  if (pinsApply && unitOfMeasurement) {
    const unitRows = groupDesc.filter(
      (r) =>
        canonicalUnit(r.unit_of_measurement) ===
        canonicalUnit(unitOfMeasurement),
    );
    if (strictFilters || unitRows.length > 0) {
      groupDesc = unitRows;
    } else if (UNIT_PINNED_SERIES.has(name)) {
      groupDesc = [];
    }
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

  // Banmore with no product pinned (the Technical dashboard):
  // gold keeps one Production / NCM_Hold row per product (and NCM status)
  // per period, and the card read only the first — Sep 2026 Mixing showed
  // Master Compound 43,920 Batch instead of Master + Final 79,425, and NCR
  // 0.16 MT instead of 2,687.87 MT. Sum every product in one unit so the
  // month card, a custom range over that month, and the drill agree.
  if (
    !strictFilters &&
    !productType &&
    ALL_PRODUCT_SUM_SECTIONS.get(name)?.has(section)
  ) {
    groupDesc = sumRowsPerPeriod(inPreferredUnit(groupDesc));
  }

  // CTP stores the quality counts as several level-1 rows per day — one per
  // tyre line, and TBR Curing Scrap once per responsible department (status).
  // Each set re-sums to the line's Scrap_s total (Curing 2026-10-07: PCR 38 +
  // TBR 2 + 2 + 3 + 6 = 51), but the card read the first row only (6).
  if (strictFilters && SUMMED_QUALITY_KPIS.has(name)) {
    groupDesc = sumRowsPerPeriod(uniqueLeafRows(groupDesc));
  }

  return { name, rows: groupDesc };
}

/**
 * Drop repeated copies of the same leaf row. An open Production drill fetches
 * the SKU rows again and they are merged into the landing rows, so without
 * this the card would count them twice. A leaf is unique on these columns
 * once the backend de-duplication has run.
 */
function uniqueLeafRows(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = [
      isoDate(r.date),
      normGran(r.granularity),
      r.tyre_type ?? "",
      r.unit_of_measurement ?? "",
      r.sub_section ?? "",
      r.machine ?? "",
      r.itemcode ?? "",
      // CTP Scrap splits one day by responsible department in `status`.
      r.status ?? "",
    ].join("|");
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

/**
 * Collapse rows sharing (date, granularity, unit) into one row whose
 * actual_value is their sum. For an additive series split across
 * sub-sections. Metadata comes from the first row of each period; a
 * threshold is kept only when the period has a single row.
 */
function sumRowsPerPeriod(rows) {
  const byPeriod = new Map();
  for (const r of rows) {
    const key = `${isoDate(r.date)}|${normGran(r.granularity)}|${r.unit_of_measurement ?? ""}`;
    const v = numberOrNull(r.actual_value);
    const prev = byPeriod.get(key);
    if (!prev) {
      byPeriod.set(key, { ...r, actual_value: v });
      continue;
    }
    if (v !== null) prev.actual_value = (prev.actual_value ?? 0) + v;
    prev.threshold_value = null;
  }
  return [...byPeriod.values()];
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
  // CR-11: the dedicated reason fetch asks for no baseline window, so there
  // are no PRECEDING-window reason rows. Blank the current window's copy
  // rather than let selectSeries hand the same minutes back as the baseline
  // (which would read as a flat 0 % trend on the Total Downtime tile).
  const { name, rows } = selectSeries(baselineGroups, kpiDef, {
    ...narrowOpts,
    downtimeByReason: null,
  });
  const baselineGran =
    kpiDef.directTotal && !normGran(granularity).startsWith("SHIFT")
      ? "DAY"
      : granularity;
  const values = atGranularity(rows, baselineGran)
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
    // The selected tyre line ("PCR" / "TBR" / null for All). Switches the
    // Curing PCR Production card to its SKU total (CURING_PCR_TOTAL_KPI).
    tyreType = null,
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
    // The ONE day the headline denotes (Today preset, ISO yyyy-mm-dd). When
    // set, a card whose newest row in the window is older shows "—" instead
    // of falling back to the latest available day. null keeps the
    // newest-row behaviour.
    headlineDate = null,
    // new_change.md C14: { "<section>|<yyyy-mm-dd>": shiftCount } — the
    // section's latest day while its shifts are still incomplete.
    partialDays = null,
    // new_change.md C15: the preceding comparison window, queried with the
    // IDENTICAL pins (C16) — only the date window moved.
    baselineRows = null,
    baselineWindow = null,
    baselineGranularity = null,
    // new_change.md C10: the row cap was hit, so any total is INCOMPLETE.
    truncated = false,
    // Which plant's rows these are. Decides whether a filter pin is
    // honoured strictly (CTP) or falls back to the line-level row
    // (Banmore) — see STRICT_FILTER_PLANTS and selectSeries. Defaults to
    // the soft path, so an omitted plantId can never blank a card.
    plantId = null,
    // CR-11 / Q-DT-01: the 6 OEE-availability-loss reason leaves, from
    // their OWN dedicated DAY-granularity fetch. Kept OUT of `rows` on
    // purpose: `rows` is the array every drill panel also reads, and DAY
    // reason rows mixed into a MONTH landing set moved the panels' "latest
    // date" onto a day with no landing rows (blank OEE drill), while a
    // reason-drill fetch returned the SAME leaves a second time and the
    // tile summed both copies (2x). This feeds the legacy TotalDowntime
    // and Technical reason cards; CTP Production uses totalDowntimeRows.
    downtimeRows = null,
    // CTP Production's stored-total feed, separate from reason drills.
    totalDowntimeRows = null,
    baselineTotalDowntimeRows = null,
    totalDowntimeBaselineWindow = null,
    // The cards to build, in order. Defaults to the Production allow-list
    // for (section, category); the Technical dashboard passes its own
    // single-reason downtime cards here.
    kpiDefs = null,
  } = {},
) {
  // CR-11: an empty landing band is not an empty grid when the dedicated
  // reason fetch returned rows — the Total Downtime tile is fed only by
  // `downtimeRows`, so bail out only when BOTH feeds are empty.
  const hasLandingRows = Array.isArray(rows) && rows.length > 0;
  const hasDowntimeRows =
    Array.isArray(downtimeRows) && downtimeRows.length > 0;
  const hasTotalDowntimeRows =
    Array.isArray(totalDowntimeRows) && totalDowntimeRows.length > 0;
  if (!hasLandingRows && !hasDowntimeRows && !hasTotalDowntimeRows) return [];

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
  const directDowntime =
    !kpiDefs && usesCtpProductionDowntime(plantId, category);
  const allowedKpis = (kpiDefs ?? ALLOWED_KPIS[section]?.[category] ?? []).map(
    (kpi) =>
      directDowntime && kpi.name === TOTAL_DOWNTIME_NAME
        ? { ...kpi, directTotal: true }
        : kpi,
  );
  const allowedNames = new Set(allowedKpis.map((k) => k.name));
  if (directDowntime) allowedNames.add(CTP_TOTAL_DOWNTIME_KPI);
  // CR-11 / Q-DT-01: the 6 reason leaves are deliberately NOT allow-listed
  // here. They arrive via `downtimeRows`, not `rows` — and any copy of them
  // that IS in `rows` (a reason drill, or the OEE drill, whose targets
  // include all six) must never reach the tile, or the same minutes get
  // counted twice.
  // new_change.md C7: in TBM/Curing the Production CARD reads
  // Production_product, so those rows must survive the allow-list filter.
  if (section === "TBM" || section === "Curing") {
    allowedNames.add("Production_product");
  }
  if (
    readsCuringPcrSkuTotal(section, tyreType, granularity) ||
    readsCuringPcrSkuTotal(section, tyreType, baselineGranularity)
  ) {
    allowedNames.add(CURING_PCR_TOTAL_KPI);
  }
  const cat = String(category || "").toUpperCase();
  if (cat === "P") {
    if (section === "TBM") {
      allowedNames.add("Building_Fulfilled_Qty_sku");
      allowedNames.add("Building_Planned_Qty_sku");
    } else if (section === "Curing") {
      allowedNames.add("Curing_Fulfilled_Qty_sku");
      allowedNames.add("Curing_Planned_Qty_sku");
    }
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
  // Only the dedicated feed supplies stored totals; opening a drill must
  // never append a second copy to the headline.
  const groups = buildKpiGroups(
    directDowntime
      ? [
          ...(rows ?? []).filter((r) => r.kpi_name !== CTP_TOTAL_DOWNTIME_KPI),
          ...(totalDowntimeRows ?? []),
        ]
      : rows,
    groupOpts,
  );
  // CR-11: scope the dedicated reason rows to this section the same way
  // buildKpiGroups scopes `rows`, then index them by reason kpi_name.
  const downtimeByReason = new Map();
  // CR-11: the machines that contributed are tracked PER DATE on the
  // synthesised rows (see selectSeries), not once for the whole feed — the
  // active fleet varies day to day, and the card must divide by the fleet
  // behind the exact rows its headline covers.
  if (Array.isArray(downtimeRows)) {
    const reasonNames = new Set(DOWNTIME_REASONS);
    for (const r of downtimeRows) {
      if (!r || !reasonNames.has(r.kpi_name)) continue;
      // Rows whose `section` is blank are NOT this section's: for the 31
      // dual-listed Curing presses they are exact value duplicates of the
      // attributed rows (same machine/date/kpi/value, different record_id),
      // and the remaining machines only ever carry section 'UNKNOWN' — they
      // are not Mixing/Stock/TBM/Curing equipment. Counting either would
      // double the section total.
      if (r.section !== section) continue;
      const bucket = downtimeByReason.get(r.kpi_name);
      if (bucket) bucket.push(r);
      else downtimeByReason.set(r.kpi_name, [r]);
    }
  }
  // A section with landing rows OR reason rows still has a grid to draw.
  // Gating on `groups` alone would drop the whole grid — Total Downtime
  // tile included — on a view whose only data is the dedicated reason fetch.
  if (groups.size === 0 && downtimeByReason.size === 0) return [];
  // C16: the baseline rows go through the SAME grouping + narrowing, so the
  // only difference between the two windows is the date.
  const baselineFeed = directDowntime
    ? [
        ...(baselineRows ?? []).filter(
          (r) => r.kpi_name !== CTP_TOTAL_DOWNTIME_KPI,
        ),
        ...(baselineTotalDowntimeRows ?? []),
      ]
    : baselineRows;
  const baselineGroups = Array.isArray(baselineFeed)
    ? buildKpiGroups(baselineFeed, groupOpts)
    : null;
  const narrowOpts = {
    section,
    productType,
    unitOfMeasurement,
    drilledKpiId,
    downtimeByReason,
    tyreType,
    granularity,
    strictFilters: STRICT_FILTER_PLANTS.has(
      String(plantId ?? "")
        .trim()
        .toLowerCase(),
    ),
  };

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
    const comparisonWindow = kpiDef.directTotal
      ? totalDowntimeBaselineWindow
      : baselineWindow;
    // Narrow to the ONE pinned series this card renders (kpi_name,
    // product_type, unit_of_measurement) — the same function the baseline
    // window goes through, so only the date differs between them (C16).
    const { name, rows: groupDesc } = selectSeries(groups, kpiDef, narrowOpts);

    // Snapshot path: pick the LATEST row at the active granularity
    // and read actual_value verbatim. Works for Today (Daily), Month
    // (MTD), Year (YTD) — gold_dummy already stored the right
    // pre-aggregated value, no client roll-up needed.
    if (isSnapshot) {
      // CR-11 / Q-DT-01: TotalDowntime synthesises per-date rows from
      // the 6 OEE-availability-loss reasons (DAY granularity only in
      // gold). Bypass atGranularity so the snapshot path doesn't filter
      // them out for Month/Year/custom presets where the dashboard
      // granularity is MONTH.
      const isTotalDowntime = kpiDef.name === TOTAL_DOWNTIME_NAME;
      const isPlanFulfillment =
        kpiDef.name === "Plan_Compliance" &&
        (section === "TBM" || section === "Curing");
      let preRows =
        isTotalDowntime || isPlanFulfillment
          ? groupDesc
          : atGranularity(groupDesc, granularity);
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
      let anchor = useAnchors && anchors ? anchors[`${section}|${name}`] : null;
      if (!anchor && isPlanFulfillment && useAnchors && anchors) {
        anchor =
          anchors[`${section}|Production`] ??
          anchors[`${section}|OEE_o`] ??
          null;
      }
      if (anchor) {
        const upToAnchor = preRows.filter((r) => isoDate(r.date) <= anchor);
        if (upToAnchor.length > 0) {
          preRows = upToAnchor;
          resolvedDate =
            isoDate(preRows[0].date) === anchor
              ? anchor
              : isoDate(preRows[0].date);
        }
      }
      if (!resolvedDate) {
        if (isPlanFulfillment) {
          const withProduction = preRows.filter((r) => (r.produced ?? 0) > 0);
          if (withProduction.length > 0) {
            preRows = preRows.filter(
              (r) => isoDate(r.date) <= isoDate(withProduction[0].date),
            );
          }
        }
        resolvedDate = isoDate(preRows[0]?.date) || null;
      }
      const kpi = kpiByName.get(name) ?? kpiDef;
      const numericVals = preRows
        .map((r) => numberOrNull(r.actual_value))
        .filter((v) => v !== null);
      if (numericVals.length === 0) {
        result.push(placeholderCard(kpiDef));
        continue;
      }

      // A lagging CTP card shows its newest earlier day instead of "—".
      const latestDayFallback = Boolean(
        headlineDate &&
        narrowOpts.strictFilters &&
        LATEST_DAY_FALLBACK_KPIS.has(kpiDef.name) &&
        resolvedDate &&
        resolvedDate < headlineDate,
      );
      const headlineMiss =
        Boolean(headlineDate && resolvedDate !== headlineDate) &&
        !latestDayFallback;

      // CR-11 / Q-DT-01: TotalDowntime's synthesised rows are per-date sums,
      // so the headline sums them ONLY when the fetched window IS the period
      // the card denotes — i.e. the Month preset, whose window is that month.
      //
      // The Today and Shift presets deliberately fetch a TRAILING 7-DAY
      // window so the sparkline has points (timeRange.js presetToDateRange:
      // `from: shift(anchor, -7)`), while the headline still means ONE day.
      // Summing unconditionally therefore reported 8 days as though they were
      // one: measured 2026-08-22, Curing read 243,154 min against an actual
      // 30,453 for the day (8.0x), TBM 13.4x, Stock 12.9x, Mixing 9.1x. Every
      // other KPI reads numericVals[0] here for exactly this reason; outside
      // MONTH, TotalDowntime now does too.
      const windowIsCardPeriod =
        normGran(granularity) === "MONTH" || normGran(granularity) === "YEAR";

      // CTP's direct total carries no fleet divisor: its headline/spark are
      // sums. The legacy reason-based cards below retain their averaging.
      // CR-11: the reason rows are PER MACHINE, and machines break down
      // CONCURRENTLY — two presses down for the same hour contribute 120
      // machine-minutes but only 60 minutes of elapsed time. Summing them
      // therefore measures machine-minutes, not downtime, and scales with
      // fleet size: 169 Curing presses read ~12,000 hours in a 720-hour
      // month. Divide by the machines that actually contributed, so the
      // headline is what a typical machine lost and stays comparable to the
      // 1,440 min in a day / 43,200 in a month.
      let downtimeMachines = 0;
      let topMachine = null;
      let value;
      if (isTotalDowntime) {
        const usedRows = windowIsCardPeriod ? preRows : preRows.slice(0, 1);
        const fleet = new Set();
        let total = 0;
        for (const r of usedRows) {
          const v = numberOrNull(r.actual_value);
          if (v == null) continue;
          total += v;
          if (!kpiDef.directTotal && r.machines)
            for (const m of r.machines) fleet.add(m);
        }
        // Never divide by zero: with no machine attribution the sum is the
        // best available figure, and `scope` stays null so the card makes no
        // claim about averaging.
        downtimeMachines = fleet.size;
        topMachine = topDowntimeMachine(usedRows);
        value =
          Math.round(
            (downtimeMachines > 0 ? total / downtimeMachines : total) * 100,
          ) / 100;
      } else {
        value = Math.round(numericVals[0] * 100) / 100;
      }
      // Keep the sparkline on the SAME scale as the headline, or the chart
      // contradicts the number printed above it.
      const sparkDivisor =
        isTotalDowntime && downtimeMachines > 0 ? downtimeMachines : 1;
      const sparkVals = numericVals
        .slice(0, sparkLength)
        .reverse()
        .map((v) => v / sparkDivisor);

      if (headlineMiss) {
        const latest = preRows[0];
        const rawUnit = kpi.unit ?? denan(latest.unit_of_measurement) ?? null;
        result.push({
          ...placeholderCard(kpiDef),
          unit: toDisplayQuantity(null, rawUnit).unit,
          spark: isKg(rawUnit) ? sparkVals.map(kgToTonnes) : sparkVals,
          target: round2(
            toDisplayQuantity(numberOrNull(latest.threshold_value), rawUnit)
              .value,
          ),
          truncated,
        });
        continue;
      }

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
      let trend;
      let trendValueRaw = null;
      let trendBaseline = null;
      if (normGran(granularity) === "MONTH") {
        const comparisonGranularity = baselineGranularity ?? granularity;
        const baselineValue = baselineAggregate(
          baselineGroups,
          kpiDef,
          { ...narrowOpts, granularity: comparisonGranularity },
          comparisonGranularity,
        );
        trend = spikePct(value, baselineValue);
        if (trend != null) {
          trendValueRaw = value - baselineValue;
          trendBaseline = formatBaselineWindow(comparisonWindow, granularity);
        }
      } else {
        // Day-wise comparison: prefer the exact previous calendar day, but
        // fall back to the most recent EARLIER day present in the window when
        // that exact day has no row (data gaps / weekends / window edge), so
        // the comparison is always available whenever any prior day exists.
        // preRows is sorted newest-first, so the first row dated before the
        // current day is the most recent prior day.
        const currentIso = isoDate(resolvedDate) || isoDate(latest.date);
        // Today preset (headlineDate set) and any single-day snapshot:
        // preRows holds the ONE pinned day only, so D-1 must come from the
        // baseline window the backend fetched. The same applies when the
        // trailing window has no prior day.
        const prevRow =
          preRows.find((r) => isoDate(r.date) === prevDayIso(currentIso)) ??
          preRows.find((r) => isoDate(r.date) < currentIso);
        if (!prevRow) {
          // No in-window previous day -> ask the backend baseline for D-1
          // (or D-1's same shift). Total Downtime has its own baseline path
          // because the value was divided by the contributing fleet.
          const baselineVal =
            isTotalDowntime && !kpiDef.directTotal && baselineRows
              ? (() => {
                  const { rows: bRows } = selectSeries(baselineGroups, kpiDef, {
                    ...narrowOpts,
                    downtimeByReason: null,
                  });
                  const dayRows = atGranularity(bRows, granularity).filter(
                    (r) => isoDate(r.date) === prevDayIso(currentIso),
                  );
                  const fleet = new Set();
                  let total = 0;
                  for (const r of dayRows) {
                    const v = numberOrNull(r.actual_value);
                    if (v == null) continue;
                    total += v;
                    if (r.machines) for (const m of r.machines) fleet.add(m);
                  }
                  return fleet.size > 0 ? total / fleet.size : null;
                })()
              : baselineAggregate(
                  baselineGroups,
                  kpiDef,
                  narrowOpts,
                  granularity,
                );
          if (baselineVal != null) {
            trend = spikePct(value, baselineVal);
            trendValueRaw = value - baselineVal;
            trendBaseline = `vs ${fmtDayLabel(prevDayIso(currentIso))}`;
          } else {
            trend = null;
            trendValueRaw = null;
            trendBaseline = null;
          }
        } else {
          // CR-11: `value` is per-machine for TotalDowntime, so the previous
          // day must be divided by the same fleet before the two are compared
          // — otherwise the spike reads as a ~N-fold jump every single day.
          const prevVal = numberOrNull(prevRow.actual_value);
          const previousValue = prevVal == null ? null : prevVal / sparkDivisor;
          trend = spikePct(value, previousValue);
          if (trend != null) {
            trendValueRaw = value - previousValue;
            trendBaseline = `vs ${fmtDayLabel(isoDate(prevRow.date))}`;
          }
        }
      }

      // Production is recorded in KG but presented in metric tonnes (MT):
      // divide the value/spark/target by 1000 and relabel. Non-KG units
      // (%, M, NOS, Batch) pass through untouched. See lib/units.js.
      const rawUnit = kpi.unit ?? denan(latest.unit_of_measurement) ?? null;
      const disp = toDisplayQuantity(value, rawUnit);
      const trendValue =
        trendValueRaw == null
          ? null
          : round2(toDisplayQuantity(trendValueRaw, rawUnit).value);
      result.push({
        id: kpi.id,
        name: DISPLAY_NAME[kpiDef.name] ?? kpiDef.name,
        rawName: name,
        value: round2(disp.value),
        unit: disp.unit,
        spark: isKg(rawUnit) ? sparkVals.map(kgToTonnes) : sparkVals,
        trend,
        trendValue,
        trendBaseline,
        trendFavourable: trendFavourable(kpiDef.name, trend),
        drillable: kpi.drillType != null,
        drillType: kpi.drillType,
        drillTargets: kpi.drillTargets ?? null,
        status: mapStatus(denan(latest.status)),
        target: round2(
          toDisplayQuantity(numberOrNull(latest.threshold_value), rawUnit)
            .value,
        ),
        // C3/C6: the drill inherits THIS date — it never resolves its own.
        resolvedDate,
        // C6: only labelled when this KPI actually lags the section's
        // newest anchor (or the pinned headline day); the up-to-date cards
        // stay unadorned.
        asOfDate: latestDayFallback
          ? resolvedDate
          : asOfFor({
              resolvedDate,
              sectionAnchor: sectionNewestAnchor,
              ownAnchor: anchors
                ? (anchors[`${section}|${name}`] ??
                  (isPlanFulfillment
                    ? (anchors[`${section}|Production`] ??
                      anchors[`${section}|OEE_o`])
                    : null) ??
                  null)
                : null,
              granularity,
            }),
        partialDay,
        // C10: a hit row cap means this total is INCOMPLETE.
        truncated,
        // CR-11 follow-up: the single machine contributing the most
        // downtime over this same 5-reason (no 'No Schedule') set.
        topMachine: isTotalDowntime ? topMachine : null,
        produced:
          isPlanFulfillment && latest.produced != null ? latest.produced : null,
        planned:
          isPlanFulfillment && latest.planned != null ? latest.planned : null,
        shortfall:
          isPlanFulfillment && latest.shortfall != null
            ? latest.shortfall
            : null,
      });
      continue;
    }

    // Aggregate path — sum / avg per spec §9 over the active range.
    // Use the active granularity (Daily by default; Shift A/B/C when
    // the user picked a specific shift), sort newest-first.
    // CR-11: TotalDowntime synthesises DAY rows only — bypass
    // atGranularity so Month/Year/custom presets don't filter them out.
    const isTotalDowntimeAgg = kpiDef.name === TOTAL_DOWNTIME_NAME;
    const isPlanFulfillmentAgg =
      kpiDef.name === "Plan_Compliance" &&
      (section === "TBM" || section === "Curing");
    const dailyRows =
      isTotalDowntimeAgg || isPlanFulfillmentAgg
        ? groupDesc
        : atGranularity(groupDesc, granularity);

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

    let value;
    let downtimeMachines = 0;
    let topMachine = null;
    let totalProduced = null;
    let totalPlanned = null;
    let totalShortfall = null;

    if (isPlanFulfillmentAgg) {
      const itemTotals = new Map();
      for (const r of dailyRows) {
        totalProduced = (totalProduced || 0) + (r.produced || 0);
        totalPlanned = (totalPlanned || 0) + (r.planned || 0);
        if (r.skuBreakdown) {
          for (const s of r.skuBreakdown) {
            const entry = itemTotals.get(s.itemcode) || {
              fulfilled: 0,
              planned: 0,
            };
            entry.fulfilled += s.fulfilled;
            entry.planned += s.planned;
            itemTotals.set(s.itemcode, entry);
          }
        }
      }
      totalShortfall = (totalPlanned || 0) - (totalProduced || 0);

      let weightedNumSum = 0;
      let weightedDenSum = 0;
      for (const entry of itemTotals.values()) {
        if (entry.planned > 0) {
          weightedNumSum += Math.min(entry.fulfilled, entry.planned);
          weightedDenSum += entry.planned;
        }
      }
      const weightedMonthRatio =
        weightedDenSum > 0 ? (weightedNumSum / weightedDenSum) * 100 : 0;
      value = Math.round(weightedMonthRatio * 100) / 100;
    } else {
      // new_change.md C5: the range aggregation class comes from the KPI's
      // own name — SUM for additive flows, AVERAGE for rates (missing days
      // are skipped by the numericVals filter above, never counted as 0),
      // LATEST-in-range for Inventory levels. NCM_Hold's SNAP snapshot agg
      // still sums over a custom range (changes.md §8.2), which is exactly
      // what the additive default gives it.
      value = aggregateForRange(numericVals, name);

      // CR-11: a custom range sums every day in the window, so the same
      // concurrency argument as the snapshot path applies — divide the
      // machine-minutes by the machines that contributed, giving what a
      // typical machine lost across the range.
      if (isTotalDowntimeAgg && !kpiDef.directTotal) {
        const fleet = new Set();
        for (const r of dailyRows) {
          if (r.machines) for (const m of r.machines) fleet.add(m);
        }
        downtimeMachines = fleet.size;
        topMachine = topDowntimeMachine(dailyRows);
        if (downtimeMachines > 0) value /= downtimeMachines;
      }
      value = Math.round(value * 100) / 100;
    }

    // Sparkline: up to N most-recent Daily values, oldest→newest so the
    // chart reads left-to-right. Kept on the headline's scale.
    const aggDivisor = downtimeMachines > 0 ? downtimeMachines : 1;
    const sparkVals = numericVals
      .slice(0, sparkLength)
      .reverse()
      .map((v) => v / aggDivisor);

    // new_change.md C15 (Q4) + C17: a custom range compares with the
    // immediately preceding window of EQUAL length (1-16 Jul -> 15-30 Jun),
    // fetched by the backend with the identical pins (C16) and aggregated
    // here with the SAME C5 class as the current window. A within-window
    // day-over-day fallback would be a different, wrong comparison (defect
    // S-2), so a missing/zero baseline still renders BLANK.
    const baselineValue = baselineAggregate(
      baselineGroups,
      kpiDef,
      narrowOpts,
      granularity,
    );
    const trend = spikePct(value, baselineValue);
    const trendBaseline =
      trend != null
        ? formatBaselineWindow(comparisonWindow, granularity)
        : null;
    const trendValueRaw = trend != null ? value - baselineValue : null;

    const latest = dailyRows[0];
    // KG → MT display conversion (see snapshot path above / lib/units.js).
    const rawUnit = kpi.unit ?? denan(latest.unit_of_measurement) ?? null;
    const disp = toDisplayQuantity(value, rawUnit);
    const trendValue =
      trendValueRaw == null
        ? null
        : round2(toDisplayQuantity(trendValueRaw, rawUnit).value);
    result.push({
      id: kpi.id,
      name: DISPLAY_NAME[kpiDef.name] ?? kpiDef.name,
      rawName: name,
      value: round2(disp.value),
      unit: disp.unit,
      spark: isKg(rawUnit) ? sparkVals.map(kgToTonnes) : sparkVals,
      trend,
      trendValue,
      trendBaseline,
      trendFavourable: trendFavourable(kpiDef.name, trend),
      drillable: kpi.drillType != null,
      drillType: kpi.drillType,
      drillTargets: kpi.drillTargets ?? null,
      status: mapStatus(denan(latest.status)),
      target: round2(
        toDisplayQuantity(numberOrNull(latest.threshold_value), rawUnit).value,
      ),
      // C3: an explicit range card hands its window down, not a single date.
      resolvedDate: null,
      asOfDate: null,
      partialDay: false,
      // C10: never present a capped range total as if it were complete.
      truncated,
      // CR-11 follow-up: the single machine contributing the most downtime
      // over this same 5-reason (no 'No Schedule') set.
      topMachine: isTotalDowntimeAgg ? topMachine : null,
      produced: isPlanFulfillmentAgg ? totalProduced : null,
      planned: isPlanFulfillmentAgg ? totalPlanned : null,
      shortfall: isPlanFulfillmentAgg ? totalShortfall : null,
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
    // Raw status text, preserved verbatim. `status` above is the RAG
    // traffic-light value (Green/Red/Yellow) used for colour coding; some
    // KPIs instead carry a business status here (NCM_Hold_sku = Finish/Hold)
    // that a panel needs to DISPLAY, which mapStatus would null out.
    statusRaw: denan(r.status),
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
    toDisplayDate(r.date) ?? "—",
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

/** Round to 2 decimals; null/undefined pass through (tonne values are small). */
function round2(v) {
  return v == null ? v : Math.round(v * 100) / 100;
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
