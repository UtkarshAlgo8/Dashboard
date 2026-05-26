import { config } from "./config.js";

/**
 * SQL builders for the gold_bi table. Pure functions, no side effects.
 *
 * Why string concatenation rather than parameter binding? The upstream
 * API takes the SQL as a string and runs it against parquet via
 * (presumably) DuckDB or Athena — there's no separate bind layer.
 * Therefore every value that goes into a WHERE clause MUST be passed
 * through `escapeLiteral` (single-quote escape) to prevent injection.
 *
 * gold_bi schema (confirmed 2026-05-26 — see CR-06):
 *   record_id BIGINT, date DATE, plant STRING, department STRING,
 *   section STRING, tyre_type STRING, machine STRING,
 *   product_type STRING, itemcode STRING, granularity STRING,
 *   category STRING, kpi_name STRING, unit_of_measurement STRING,
 *   production_ids STRING, drill_down_attribute STRING,
 *   drill_down_level STRING, actual_value DOUBLE,
 *   previous_values DOUBLE, threshold_value DOUBLE, status STRING,
 *   remarks STRING
 *
 * IGNORED for Phase 1 (per 2026-05-26 PM call):
 *   previous_values, threshold_value, status, remarks,
 *   drill_down_level, record_id
 *
 * Each row carries one KPI measurement at one (plant, section,
 * kpi_name, date) with its drill-down detail inline in
 * `drill_down_attribute` (JSON-encoded string). Drill panels parse
 * that JSON rather than relying on drill_down_level.
 */

const TABLE = () => config.upstream.table;

/**
 * Escape a single SQL string literal. Doubles any embedded single
 * quote, the standard SQL escape. Reject control characters / newlines.
 */
export function escapeLiteral(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number cannot be SQL literal: ${value}`);
    }
    return String(value);
  }
  if (typeof value !== "string") {
    throw new Error(`Cannot escape non-string literal: ${typeof value}`);
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    throw new Error(
      "Control characters not allowed in SQL string literal.",
    );
  }
  return `'${value.replaceAll("'", "''")}'`;
}

/** Build a WHERE clause from a {column: value} dict. Empty → "". */
function whereClause(filters) {
  const parts = [];
  for (const [col, val] of Object.entries(filters)) {
    if (val === undefined || val === null) continue;
    parts.push(`${col} = ${escapeLiteral(val)}`);
  }
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

/** Tack a date range onto an existing WHERE-clauseed query. */
function dateRange(from, to) {
  const parts = [];
  if (from) parts.push(`AND date >= ${escapeLiteral(from)}`);
  if (to) parts.push(`AND date <= ${escapeLiteral(to)}`);
  return parts.join(" ");
}

/** Section ID in our app → human label in gold_bi.section. */
const SECTION_LABEL = {
  mix: "Mixing",
  stk: "Stock",
  tbm: "TBM",
  cur: "Curing",
};

/** Category ID (tab) → human label in gold_bi.category. */
const CATEGORY_LABEL = {
  p: "Productivity",
  q: "Quality",
  c: "Cost",
  m: "Morale",
  s: "Safety",
  i: "Inventory",
};

export function sectionLabel(sectionId) {
  const label = SECTION_LABEL[sectionId];
  if (!label) throw new Error(`Unknown section id: ${sectionId}`);
  return label;
}

export function categoryLabel(tabId) {
  const label = CATEGORY_LABEL[tabId];
  if (!label) throw new Error(`Unknown category/tab id: ${tabId}`);
  return label;
}

/* ---------------------------------------------------------------- *
 * Query builders                                                    *
 * Every SELECT pulls only the columns we use. Ignored columns       *
 * (previous_values, threshold_value, status, remarks,               *
 * drill_down_level, record_id) are NOT selected — saves bytes and   *
 * makes the contract obvious to whoever opens this file next.       *
 * ---------------------------------------------------------------- */

/**
 * Top-level KPI grid: one row per (kpi_name) for the (plant, section,
 * category) slice in a date range. drill_down_attribute is included
 * so the KPI card can offer drill-down without a second query.
 */
export function kpiGridQuery({ plant, section, category, from, to, tyreType }) {
  return `
    SELECT kpi_name, unit_of_measurement, actual_value, drill_down_attribute
    FROM ${TABLE()}
    ${whereClause({
      plant,
      section: sectionLabel(section),
      category: categoryLabel(category),
      tyre_type: tyreType,
    })}
      ${dateRange(from, to)}
    ORDER BY kpi_name
  `.trim();
}

/**
 * OEE drill: rows for the OEE KPI with their drill_down_attribute
 * JSON parsed by the transformer to surface availability/performance/
 * quality and machine-level breakdown.
 */
export function oeeDrillQuery({ plant, section, tyreType, from, to }) {
  return `
    SELECT machine, drill_down_attribute, actual_value
    FROM ${TABLE()}
    ${whereClause({
      plant,
      section: sectionLabel(section),
      category: "Productivity",
      kpi_name: "OEE",
      tyre_type: tyreType,
    })}
      ${dateRange(from, to)}
    ORDER BY machine
  `.trim();
}

/**
 * Production drill: rows for the Production KPI. Bucketing into
 * compound (master/final) or tyre family is done by the transformer
 * based on product_type.
 */
export function productionDrillQuery({ plant, section, tyreType, from, to }) {
  return `
    SELECT machine, itemcode, product_type, drill_down_attribute, actual_value
    FROM ${TABLE()}
    ${whereClause({
      plant,
      section: sectionLabel(section),
      category: "Productivity",
      kpi_name: "Production",
      tyre_type: tyreType,
    })}
      ${dateRange(from, to)}
    ORDER BY machine, itemcode
  `.trim();
}

/**
 * Downtime drill: rows for the Downtime KPI; drill_down_attribute
 * carries the reason / duration breakdown.
 */
export function downtimeDrillQuery({ plant, section, tyreType, from, to }) {
  return `
    SELECT machine, drill_down_attribute, actual_value, date
    FROM ${TABLE()}
    ${whereClause({
      plant,
      section: sectionLabel(section),
      category: "Productivity",
      kpi_name: "Downtime",
      tyre_type: tyreType,
    })}
      ${dateRange(from, to)}
    ORDER BY date DESC, machine
  `.trim();
}

export function planComplianceDrillQuery({ plant, section, tyreType, from, to }) {
  return `
    SELECT machine, itemcode, drill_down_attribute, actual_value
    FROM ${TABLE()}
    ${whereClause({
      plant,
      section: sectionLabel(section),
      category: "Productivity",
      kpi_name: "Plan Compliance",
      tyre_type: tyreType,
    })}
      ${dateRange(from, to)}
    ORDER BY machine, itemcode
  `.trim();
}

/**
 * Scrap traceability — rows that carry production_ids.
 */
export function scrapTraceQuery({ plant, section, machine, itemcode, tyreType, from, to }) {
  return `
    SELECT production_ids, machine, itemcode, drill_down_attribute,
           actual_value, date
    FROM ${TABLE()}
    ${whereClause({
      plant,
      section: sectionLabel(section),
      category: "Quality",
      kpi_name: "Scrap",
      machine,
      itemcode,
      tyre_type: tyreType,
    })}
      AND production_ids IS NOT NULL
      ${dateRange(from, to)}
    ORDER BY date DESC
  `.trim();
}

/**
 * Trend series — one row per date for a single (plant, section,
 * category, kpi_name) cell.
 */
export function trendQuery({ plant, section, category, kpiName, granularity, from, to, tyreType }) {
  return `
    SELECT date, actual_value
    FROM ${TABLE()}
    ${whereClause({
      plant,
      section: sectionLabel(section),
      category: categoryLabel(category),
      kpi_name: kpiName,
      granularity,
      tyre_type: tyreType,
    })}
      ${dateRange(from, to)}
    ORDER BY date
  `.trim();
}

export function inventoryQuery({ plant, tyreType, from, to }) {
  return `
    SELECT section, kpi_name, itemcode, actual_value, unit_of_measurement,
           drill_down_attribute
    FROM ${TABLE()}
    ${whereClause({
      plant,
      category: "Inventory",
      tyre_type: tyreType,
    })}
      ${dateRange(from, to)}
    ORDER BY section, kpi_name
  `.trim();
}
