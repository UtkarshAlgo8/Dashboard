import { config } from "./config.js";

/**
 * SQL builders for gold_dummy. Pure functions, no side effects.
 *
 * Why string concatenation rather than parameter binding? The upstream
 * API takes SQL as a string and runs it against parquet via DuckDB.
 * Every value that goes into a WHERE clause MUST be passed through
 * `escapeLiteral` (single-quote escape) to prevent injection.
 *
 * gold_dummy schema (confirmed Postman 2026-05-26):
 *   record_id BIGINT, date STRING (DD-MM-YYYY), plant STRING,
 *   department STRING, section STRING, tyre_type STRING,
 *   machine STRING, product_type STRING, itemcode STRING,
 *   granularity STRING (Daily | Shift A | Shift B | Shift C),
 *   category STRING (Cost | Morale | Productivity | Quality | Safety),
 *   kpi_name STRING, unit_of_measurement STRING,
 *   production_ids STRING, drill_down_attribute STRING (JSON-encoded),
 *   drill_down_level INT, actual_value DOUBLE,
 *   previous_values DOUBLE, threshold_value DOUBLE,
 *   status STRING, remarks STRING,
 *   day INT, hour STRING, month STRING, year INT
 *
 * IGNORED for Phase 1 (PM call 2026-05-26):
 *   previous_values, threshold_value, status, remarks,
 *   drill_down_level, record_id, hour
 *
 * NULL sentinel: missing values arrive as the literal string "nan",
 * not SQL NULL. Use `= 'nan'` / `!= 'nan'` rather than IS NULL.
 *
 * Date filtering: date is stored as DD-MM-YYYY string. Lexicographic
 * range comparison would be wrong (12-2026 < 01-2026 alphabetically).
 * Use the dedicated `year` (INT) + `month` (STRING) columns for ranges
 * via `dateRangeFilter` below.
 */

const TABLE = () => config.upstream.table;
const NAN = "nan";

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
    throw new Error("Control characters not allowed in SQL string literal.");
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

/**
 * Build the date-range portion of a WHERE. Accepts ISO yyyy-mm-dd
 * inputs (the frontend sends ISO; we translate). Empty `from` and
 * `to` produce no constraint.
 */
function dateRangeFilter(from, to) {
  const parts = [];
  if (from) {
    const { year, monthNum } = parseIsoDate(from);
    parts.push(
      `AND ((year > ${year}) OR (year = ${year} AND CAST(month AS INTEGER) >= ${monthNum}))`,
    );
  }
  if (to) {
    const { year, monthNum } = parseIsoDate(to);
    parts.push(
      `AND ((year < ${year}) OR (year = ${year} AND CAST(month AS INTEGER) <= ${monthNum}))`,
    );
  }
  return parts.join(" ");
}

function parseIsoDate(iso) {
  // Accept yyyy-mm-dd (frontend default) or dd-mm-yyyy (just in case).
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (ymd) {
    return {
      year: Number.parseInt(ymd[1], 10),
      monthNum: Number.parseInt(ymd[2], 10),
    };
  }
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(iso);
  if (dmy) {
    return {
      year: Number.parseInt(dmy[3], 10),
      monthNum: Number.parseInt(dmy[2], 10),
    };
  }
  throw new Error(`Cannot parse date literal: ${iso}`);
}

const SECTION_LABEL = {
  mix: "Mixing",
  stk: "Stock",
  tbm: "TBM",
  cur: "Curing",
};

const CATEGORY_LABEL = {
  p: "Productivity",
  q: "Quality",
  c: "Cost",
  m: "Morale",
  s: "Safety",
  // No "i" — Inventory category doesn't exist in gold_dummy yet
  // (PM, 2026-05-27). Frontend hides the Inventory tab.
};

const SHIFT_LABEL = {
  all: null, // null → no granularity filter
  daily: "Daily",
  a: "Shift A",
  b: "Shift B",
  c: "Shift C",
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

/**
 * Map a frontend shift value to a gold_dummy.granularity value.
 * - `undefined` / `"all"` / `"All"` → no granularity filter (returns null)
 * - `"a"`/`"b"`/`"c"` → "Shift A"/"Shift B"/"Shift C"
 * - otherwise default to "Daily"
 */
export function granularityForShift(shift) {
  if (shift == null) return "Daily";
  const v = String(shift).toLowerCase();
  if (v === "all") return null;
  return SHIFT_LABEL[v] ?? "Daily";
}

/* ---------------------------------------------------------------- *
 * Query builders                                                    *
 * ---------------------------------------------------------------- */

export const KPI_SPARK_LENGTH = 8;

/**
 * KPI grid — up to 8 most recent rows per `kpi_name` (top-level rows
 * where machine = 'nan'). Transformer groups by kpi_name to build the
 * value + sparkline + trend %.
 */
export function kpiGridQuery({
  plant,
  section,
  category,
  shift,
  from,
  to,
  tyreType,
}) {
  const granularity = granularityForShift(shift);
  const innerWhere = whereClause({
    plant,
    department: "Production",
    section: sectionLabel(section),
    category: categoryLabel(category),
    tyre_type: tyreType,
    granularity,
    machine: NAN, // KPI grid is section-level — machine column is 'nan'
  });
  return `
    SELECT kpi_name, unit_of_measurement, actual_value, drill_down_attribute
    FROM (
      SELECT kpi_name, unit_of_measurement, actual_value, drill_down_attribute,
             ROW_NUMBER() OVER (
               PARTITION BY kpi_name
               ORDER BY year DESC, CAST(month AS INTEGER) DESC, day DESC
             ) AS rn
      FROM ${TABLE()}
      ${innerWhere}
        ${dateRangeFilter(from, to)}
    ) ranked
    WHERE rn <= ${KPI_SPARK_LENGTH}
    ORDER BY kpi_name, rn
  `.trim();
}

/**
 * OEE drill — one row per (machine, drill_down_attribute) combo,
 * latest by date. Rows with `machine = 'nan'` are filtered out
 * (those are the top-level KPI rows, not drill rows).
 */
export function oeeDrillQuery({ plant, section, shift, tyreType, from, to }) {
  const granularity = granularityForShift(shift);
  const innerWhere = whereClause({
    plant,
    department: "Production",
    section: sectionLabel(section),
    category: "Productivity",
    kpi_name: "OEE",
    tyre_type: tyreType,
    granularity,
  });
  return `
    SELECT machine, drill_down_attribute, actual_value
    FROM (
      SELECT machine, drill_down_attribute, actual_value,
             ROW_NUMBER() OVER (
               PARTITION BY machine, drill_down_attribute
               ORDER BY year DESC, CAST(month AS INTEGER) DESC, day DESC
             ) AS rn
      FROM ${TABLE()}
      ${innerWhere}
        AND machine != ${escapeLiteral(NAN)}
        ${dateRangeFilter(from, to)}
    ) ranked
    WHERE rn = 1
    ORDER BY machine
  `.trim();
}

/**
 * Production drill — one row per (machine, itemcode, product_type),
 * latest by date.
 */
export function productionDrillQuery({
  plant,
  section,
  shift,
  tyreType,
  from,
  to,
}) {
  const granularity = granularityForShift(shift);
  const innerWhere = whereClause({
    plant,
    department: "Production",
    section: sectionLabel(section),
    category: "Productivity",
    kpi_name: "Production",
    tyre_type: tyreType,
    granularity,
  });
  return `
    SELECT machine, itemcode, product_type, drill_down_attribute, actual_value
    FROM (
      SELECT machine, itemcode, product_type, drill_down_attribute, actual_value,
             ROW_NUMBER() OVER (
               PARTITION BY machine, itemcode, product_type
               ORDER BY year DESC, CAST(month AS INTEGER) DESC, day DESC
             ) AS rn
      FROM ${TABLE()}
      ${innerWhere}
        AND machine != ${escapeLiteral(NAN)}
        ${dateRangeFilter(from, to)}
    ) ranked
    WHERE rn = 1
    ORDER BY machine, itemcode
  `.trim();
}

/**
 * Downtime drill — event-style. Returns all rows in range; no dedupe.
 */
export function downtimeDrillQuery({
  plant,
  section,
  shift,
  tyreType,
  from,
  to,
}) {
  const granularity = granularityForShift(shift);
  return `
    SELECT machine, drill_down_attribute, actual_value, date
    FROM ${TABLE()}
    ${whereClause({
      plant,
      department: "Production",
      section: sectionLabel(section),
      category: "Productivity",
      kpi_name: "Downtime",
      tyre_type: tyreType,
      granularity,
    })}
      AND machine != ${escapeLiteral(NAN)}
      ${dateRangeFilter(from, to)}
    ORDER BY year DESC, CAST(month AS INTEGER) DESC, day DESC, machine
  `.trim();
}

export function planComplianceDrillQuery({
  plant,
  section,
  shift,
  tyreType,
  from,
  to,
}) {
  const granularity = granularityForShift(shift);
  return `
    SELECT machine, itemcode, drill_down_attribute, actual_value
    FROM ${TABLE()}
    ${whereClause({
      plant,
      department: "Production",
      section: sectionLabel(section),
      category: "Productivity",
      kpi_name: "Plan Compliance",
      tyre_type: tyreType,
      granularity,
    })}
      AND machine != ${escapeLiteral(NAN)}
      ${dateRangeFilter(from, to)}
    ORDER BY machine, itemcode
  `.trim();
}

/**
 * Scrap traceability — rows that carry a real production_ids value
 * (not the 'nan' sentinel).
 */
export function scrapTraceQuery({
  plant,
  section,
  machine,
  itemcode,
  tyreType,
  from,
  to,
}) {
  return `
    SELECT production_ids, machine, itemcode, drill_down_attribute,
           actual_value, date
    FROM ${TABLE()}
    ${whereClause({
      plant,
      department: "Production",
      section: sectionLabel(section),
      category: "Quality",
      kpi_name: "Scrap",
      machine,
      itemcode,
      tyre_type: tyreType,
    })}
      AND production_ids != ${escapeLiteral(NAN)}
      ${dateRangeFilter(from, to)}
    ORDER BY year DESC, CAST(month AS INTEGER) DESC, day DESC
  `.trim();
}

/**
 * Trend series — one row per date for a single (plant, section,
 * category, kpi_name) top-level cell.
 */
export function trendQuery({
  plant,
  section,
  category,
  kpiName,
  shift,
  from,
  to,
  tyreType,
}) {
  const granularity = granularityForShift(shift) ?? "Daily";
  return `
    SELECT date, actual_value, year, month, day
    FROM ${TABLE()}
    ${whereClause({
      plant,
      department: "Production",
      section: sectionLabel(section),
      category: categoryLabel(category),
      kpi_name: kpiName,
      granularity,
      tyre_type: tyreType,
      machine: NAN,
    })}
      ${dateRangeFilter(from, to)}
    ORDER BY year, CAST(month AS INTEGER), day
  `.trim();
}
