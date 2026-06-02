import { config } from "../config.js";

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
 * Build the date-range portion of a WHERE.
 *
 * Upstream gotcha: although gold_dummy has a `year` column, the data
 * is NOT physically partitioned by year. Putting `year = X` in the
 * WHERE causes the upstream Lambda to look for a non-existent
 * `gold_dummy/year=X/*.parquet` partition path. So we DO NOT emit
 * any year/month/day column predicate — we filter only on the
 * `date` STRING column by reformatting it to YYYYMMDD inline and
 * doing a lexicographic compare.
 *
 * `date` is DD-MM-YYYY, e.g. `"27-05-2026"`. The expression
 * `SUBSTRING(date,7,4) || SUBSTRING(date,4,2) || SUBSTRING(date,1,2)`
 * yields `"20260527"` which orders correctly across years/months/days.
 * Cheap, engine-agnostic (Athena / DuckDB / Trino).
 */
function dateRangeFilter(from, to) {
  if (!from && !to) return "";

  const f = from ? parseIsoDate(from) : null;
  const t = to ? parseIsoDate(to) : null;

  // Format-robust YYYYMMDD. CAST to VARCHAR (date is a DATE type in the
  // live gold_dummy; SUBSTRING needs VARCHAR). Detect ISO vs DD-MM-YYYY
  // by dash position so this works across envs.
  const ds = "CAST(date AS VARCHAR)";
  const dateExpr =
    `(CASE WHEN SUBSTRING(${ds}, 5, 1) = '-' ` +
    `THEN SUBSTRING(${ds}, 1, 4) || SUBSTRING(${ds}, 6, 2) || SUBSTRING(${ds}, 9, 2) ` +
    `ELSE SUBSTRING(${ds}, 7, 4) || SUBSTRING(${ds}, 4, 2) || SUBSTRING(${ds}, 1, 2) END)`;

  const parts = [];
  if (f) parts.push(`AND ${dateExpr} >= '${yyyymmdd(f)}'`);
  if (t) parts.push(`AND ${dateExpr} <= '${yyyymmdd(t)}'`);
  return parts.join(" ");
}

function yyyymmdd({ year, monthNum, dayNum }) {
  return `${year}${String(monthNum).padStart(2, "0")}${String(dayNum).padStart(2, "0")}`;
}

function parseIsoDate(iso) {
  // Accept yyyy-mm-dd (frontend default) or dd-mm-yyyy (just in case).
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (ymd) {
    return {
      year: Number.parseInt(ymd[1], 10),
      monthNum: Number.parseInt(ymd[2], 10),
      dayNum: Number.parseInt(ymd[3], 10),
    };
  }
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(iso);
  if (dmy) {
    return {
      year: Number.parseInt(dmy[3], 10),
      monthNum: Number.parseInt(dmy[2], 10),
      dayNum: Number.parseInt(dmy[1], 10),
    };
  }
  throw new Error(`Cannot parse date literal: ${iso}`);
}

/**
 * Allow-lists for the gold_dummy column values the frontend can send
 * directly on the wire. Backend reads URL params straight into the
 * WHERE clause — no translation table — but rejects anything not in
 * these sets to keep SQL injection surface zero and to surface
 * vocabulary drift early.
 *
 * The actual gold_dummy → frontend internal-ID mapping lives in the
 * frontend at `src/lib/labelMaps.js`. Keep these two in sync when a
 * new section / category / granularity value lands in the data.
 */
export const ALLOWED_SECTIONS = new Set(["Mixing", "Stock", "TBM", "Curing"]);
export const ALLOWED_CATEGORIES = new Set([
  "Productivity",
  "Quality",
  "Cost",
  "Morale",
  "Safety",
]);
export const ALLOWED_GRANULARITIES = new Set([
  "Daily",
  "Shift A",
  "Shift B",
  "Shift C",
]);

function requireAllowed(value, allowed, label) {
  if (!value) throw new Error(`Missing required field: ${label}`);
  if (!allowed.has(value)) {
    throw new Error(
      `Unknown ${label}: ${value}. Expected one of ${[...allowed].join(", ")}.`,
    );
  }
  return value;
}

function optionalAllowed(value, allowed, label) {
  if (value === undefined || value === null || value === "") return null;
  if (!allowed.has(value)) {
    throw new Error(
      `Unknown ${label}: ${value}. Expected one of ${[...allowed].join(", ")}.`,
    );
  }
  return value;
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
  granularity,
  from,
  to,
  tyreType,
}) {
  const innerWhere = whereClause({
    plant,
    department: "Production",
    section: requireAllowed(section, ALLOWED_SECTIONS, "section"),
    category: requireAllowed(category, ALLOWED_CATEGORIES, "category"),
    tyre_type: tyreType,
    granularity: optionalAllowed(granularity, ALLOWED_GRANULARITIES, "granularity"),
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
export function oeeDrillQuery({ plant, section, granularity, tyreType, from, to }) {
  const innerWhere = whereClause({
    plant,
    department: "Production",
    section: requireAllowed(section, ALLOWED_SECTIONS, "section"),
    category: "Productivity",
    kpi_name: "OEE",
    tyre_type: tyreType,
    granularity: optionalAllowed(granularity, ALLOWED_GRANULARITIES, "granularity"),
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
  granularity,
  tyreType,
  from,
  to,
}) {
  const innerWhere = whereClause({
    plant,
    department: "Production",
    section: requireAllowed(section, ALLOWED_SECTIONS, "section"),
    category: "Productivity",
    kpi_name: "Production",
    tyre_type: tyreType,
    granularity: optionalAllowed(granularity, ALLOWED_GRANULARITIES, "granularity"),
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
  granularity,
  tyreType,
  from,
  to,
}) {
  return `
    SELECT machine, drill_down_attribute, actual_value, CAST(date AS VARCHAR) AS date
    FROM ${TABLE()}
    ${whereClause({
      plant,
      department: "Production",
      section: requireAllowed(section, ALLOWED_SECTIONS, "section"),
      category: "Productivity",
      kpi_name: "Downtime",
      tyre_type: tyreType,
      granularity: optionalAllowed(granularity, ALLOWED_GRANULARITIES, "granularity"),
    })}
      AND machine != ${escapeLiteral(NAN)}
      ${dateRangeFilter(from, to)}
    ORDER BY year DESC, CAST(month AS INTEGER) DESC, day DESC, machine
  `.trim();
}

export function planComplianceDrillQuery({
  plant,
  section,
  granularity,
  tyreType,
  from,
  to,
}) {
  return `
    SELECT machine, itemcode, drill_down_attribute, actual_value
    FROM ${TABLE()}
    ${whereClause({
      plant,
      department: "Production",
      section: requireAllowed(section, ALLOWED_SECTIONS, "section"),
      category: "Productivity",
      kpi_name: "Plan Compliance",
      tyre_type: tyreType,
      granularity: optionalAllowed(granularity, ALLOWED_GRANULARITIES, "granularity"),
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
           actual_value, CAST(date AS VARCHAR) AS date
    FROM ${TABLE()}
    ${whereClause({
      plant,
      department: "Production",
      section: requireAllowed(section, ALLOWED_SECTIONS, "section"),
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
/**
 * Trend query — switched by `range`:
 *
 *   range = "today"  → daily resolution, last 30 days. Returns ~30
 *                      rows aliased { date: "DD-MM-YYYY", actual_value }.
 *   range = "month"  → ONE point per month = the latest available MTD
 *                      record within that month (BRD §13.6). NOT an AVG
 *                      of daily values. Returns up to 12 rows aliased
 *                      { date: "YYYY-MM", actual_value }.
 *   range = "year"   → one point per year = the latest YTD record in
 *                      that year. Returns { date: "YYYY", actual_value }.
 *   range = "custom" → daily resolution, explicit from/to.
 *
 * Series pinning (BRD §13.6): pass `productType` / `subSection` so the
 * line stays a single consistent series rather than a blend across
 * products / sub-sections.
 */
export function trendQuery({
  plant,
  section,
  category,
  kpiName,
  range,
  granularity,
  from,
  to,
  tyreType,
  productType,
  subSection,
}) {
  const baseFilters = whereClause({
    plant,
    department: "Production",
    section: requireAllowed(section, ALLOWED_SECTIONS, "section"),
    category: requireAllowed(category, ALLOWED_CATEGORIES, "category"),
    kpi_name: kpiName,
    granularity:
      optionalAllowed(granularity, ALLOWED_GRANULARITIES, "granularity") ??
      "Daily",
    tyre_type: tyreType,
    product_type: productType,
    sub_section: subSection,
    machine: NAN,
  });

  // Format-robust YYYYMMDD: CAST to VARCHAR (date is a DATE type in the
  // live gold_dummy; a string in CSV-backed envs) then handle ISO or
  // DD-MM-YYYY by dash position.
  const dateExpr =
    "(CASE WHEN SUBSTRING(CAST(date AS VARCHAR), 5, 1) = '-' " +
    "THEN SUBSTRING(CAST(date AS VARCHAR), 1, 4) || SUBSTRING(CAST(date AS VARCHAR), 6, 2) || SUBSTRING(CAST(date AS VARCHAR), 9, 2) " +
    "ELSE SUBSTRING(CAST(date AS VARCHAR), 7, 4) || SUBSTRING(CAST(date AS VARCHAR), 4, 2) || SUBSTRING(CAST(date AS VARCHAR), 1, 2) END)";

  // Pinned filters at the requested pre-aggregated granularity (MTD for
  // monthly, YTD for yearly). machine='nan' = top-level rows only.
  const pinnedFilters = (gran) =>
    whereClause({
      plant,
      department: "Production",
      section,
      category,
      kpi_name: kpiName,
      granularity: gran,
      tyre_type: tyreType,
      product_type: productType,
      sub_section: subSection,
      machine: NAN,
    });

  // The upstream Lambda 500s on a raw DATE column — always cast to VARCHAR.
  if (range === "month") {
    // Latest MTD row per calendar month. Partition by the YYYYMM prefix,
    // order by full date desc, keep rank 1.
    return `
      SELECT date, actual_value
      FROM (
        SELECT CAST(date AS VARCHAR) AS date, actual_value, ${dateExpr} AS dk,
               ROW_NUMBER() OVER (
                 PARTITION BY SUBSTRING(${dateExpr}, 1, 6)
                 ORDER BY ${dateExpr} DESC
               ) AS rn
        FROM ${TABLE()}
        ${pinnedFilters("MTD")}
      ) ranked
      WHERE rn = 1
      ORDER BY dk
    `.trim();
  }

  if (range === "year") {
    // Latest YTD row per calendar year.
    return `
      SELECT date, actual_value
      FROM (
        SELECT CAST(date AS VARCHAR) AS date, actual_value, ${dateExpr} AS dk,
               ROW_NUMBER() OVER (
                 PARTITION BY SUBSTRING(${dateExpr}, 1, 4)
                 ORDER BY ${dateExpr} DESC
               ) AS rn
        FROM ${TABLE()}
        ${pinnedFilters("YTD")}
      ) ranked
      WHERE rn = 1
      ORDER BY dk
    `.trim();
  }

  // Default: daily resolution.
  // `range === "today"` overrides the from/to with [today − 30d, today].
  // `range === "custom"` uses caller-provided from/to.
  // Anything else falls through to caller's from/to as well.
  let effectiveFrom = from;
  let effectiveTo = to;
  if (range === "today") {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    effectiveFrom = isoLocal(start);
    effectiveTo = isoLocal(now);
  }

  return `
    SELECT CAST(date AS VARCHAR) AS date, actual_value, year, month, day
    FROM ${TABLE()}
    ${baseFilters}
      ${dateRangeFilter(effectiveFrom, effectiveTo)}
    ORDER BY year, CAST(month AS INTEGER), day
  `.trim();
}

function isoLocal(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
