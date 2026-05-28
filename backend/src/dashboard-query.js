/**
 * Universal dashboard query builder.
 *
 * Spec: docs/dashboard_logic_guide_v2.pdf §3 ("The Universal Query
 * Pattern") and §15 ("The Whole Backend in One Function").
 *
 * Every dashboard request is one of two shapes:
 *   Shape A — Landing query  (drill_kpis = null)
 *     WHERE <context> AND drill_down_level = 1
 *   Shape B — Drill query    (drill_kpis is an array)
 *     WHERE <context> AND <parent_filters> AND kpi_name IN (drill_kpis)
 *
 * Caller responsibility: assemble the `context` and `parent_filters`
 * dicts from URL/body params (frontend already maintains them in the
 * picker stack). We only build SQL.
 *
 * gold_dummy schema (confirmed via Excel sample 2026-05-27):
 *   record_id, date (DD-MM-YYYY), plant, department, section,
 *   sub_section, tyre_type, machine, product_type, itemcode,
 *   granularity, category, kpi_name, unit_of_measurement,
 *   drill_down_level (1 = landing, 2 = leaf), drill_down_attribute
 *   (JSON-array string), actual_value, previous_value,
 *   threshold_value, status, remarks
 *
 * NULL sentinel: missing values arrive as the literal "nan" — we
 * treat empty + "nan" as "no filter" rather than "filter for nan".
 * Pass `null` for any context key the caller does not set.
 */
import { config } from "./config.js";

export const ALLOWED_CONTEXT_KEYS = new Set([
  "plant",
  "department",
  "section",
  "sub_section",
  "product_type",
  "category",
  "tyre_type",
  "granularity",
  "unit_of_measurement",
]);

export const ALLOWED_PARENT_FILTER_KEYS = new Set([
  "machine",
  "itemcode",
]);

/* Tight allow-lists for values that go into WHERE clauses raw.
 * Anything outside these lists is rejected at the route layer. We
 * still escape on the way in via escapeLiteral as defence-in-depth,
 * but reject early so the upstream Lambda never sees junk. */
export const ALLOWED_SECTIONS = new Set(["Mixing", "TBM", "Curing", "Stock"]);
export const ALLOWED_CATEGORIES = new Set([
  "Productivity",
  "Quality",
  "Cost",
  "Morale",
  "Safety",
  "Inventory",
]);
export const ALLOWED_GRANULARITIES = new Set([
  "Daily",
  "Shift A",
  "Shift B",
  "Shift C",
  "MTD",
  "YTD",
]);
export const ALLOWED_TYRE_TYPES = new Set(["PCR", "TBR", "LTR", "All"]);

/**
 * Strict allow-list per context key. Keys not listed here accept any
 * string (length-bounded, no control chars — see safeStringValue).
 */
const CONTEXT_ALLOW_LISTS = {
  section: ALLOWED_SECTIONS,
  category: ALLOWED_CATEGORIES,
  granularity: ALLOWED_GRANULARITIES,
  tyre_type: ALLOWED_TYRE_TYPES,
};

export class QueryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "QueryValidationError";
    this.status = 400;
  }
}

/* ---------- SQL literal helpers ---------- */

export function escapeLiteral(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new QueryValidationError(`Non-finite number: ${value}`);
    }
    return String(value);
  }
  if (typeof value !== "string") {
    throw new QueryValidationError(`Cannot escape non-string: ${typeof value}`);
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    throw new QueryValidationError("Control chars not allowed in literal");
  }
  if (value.length > 200) {
    throw new QueryValidationError("Literal exceeds 200 chars");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function safeStringValue(value, key) {
  if (typeof value !== "string") {
    throw new QueryValidationError(`${key} must be a string`);
  }
  if (value.length === 0 || value.length > 200) {
    throw new QueryValidationError(`${key} length out of bounds`);
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    throw new QueryValidationError(`${key} contains control chars`);
  }
  // Reject SQL meta-chars that could escape the string literal. The
  // single quote IS handled by escapeLiteral's doubling — we only
  // reject other dangerous shapes here.
  if (/[;\\]/.test(value)) {
    throw new QueryValidationError(`${key} contains forbidden chars`);
  }
  return value;
}

/* ---------- Date handling ----------
 *
 * gold_dummy `date` column is ISO yyyy-mm-dd (confirmed 2026-05-28 via
 * sample rows). We accept ISO yyyy-mm-dd from the frontend and pass it
 * through unchanged. DD-MM-YYYY input from older callers is converted
 * back to ISO for the equality predicate.
 *
 * Per existing queries.js, putting `year = X` triggers an upstream
 * Lambda partition-path lookup that often fails. We avoid year/month/
 * day predicates entirely.
 */

function toIsoDate(input) {
  if (typeof input !== "string") {
    throw new QueryValidationError("date must be a string");
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (ymd) return input;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  throw new QueryValidationError(`Bad date format: ${input}`);
}

/* ---------- Public builder ---------- */

/**
 * Build SELECT SQL for one dashboard fetch.
 *
 * @param {object} input
 * @param {object} input.context  context dict from frontend picker stack
 * @param {string} [input.date]   ISO yyyy-mm-dd or DD-MM-YYYY
 * @param {string[]|null} [input.drillKpis]
 *        null/undefined → landing query (drill_down_level = 1)
 *        non-empty array → drill query (kpi_name IN ...)
 * @param {object} [input.parentFilters]  carry-forward filters
 *        from clicked row (machine, itemcode)
 * @param {number} [input.limit]
 * @returns {string} SQL
 */
export function buildFetchQuery({
  context = {},
  date,
  from,
  to,
  drillKpis = null,
  parentFilters = {},
  limit = 5000,
} = {}) {
  if (typeof context !== "object" || context === null) {
    throw new QueryValidationError("context must be an object");
  }
  if (typeof parentFilters !== "object" || parentFilters === null) {
    throw new QueryValidationError("parentFilters must be an object");
  }

  const where = [];

  // 1. Context filters. Keys outside ALLOWED_CONTEXT_KEYS are
  //    rejected so the frontend can't smuggle extra columns into the
  //    WHERE without us adding them deliberately.
  for (const [key, raw] of Object.entries(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) {
      throw new QueryValidationError(`Unknown context key: ${key}`);
    }
    if (raw == null || raw === "") continue; // null / empty = no filter

    const value = safeStringValue(raw, key);
    const allow = CONTEXT_ALLOW_LISTS[key];
    if (allow && !allow.has(value)) {
      throw new QueryValidationError(
        `Invalid ${key}: ${value}. Allowed: ${[...allow].join(", ")}`,
      );
    }
    where.push(`${key} = ${escapeLiteral(value)}`);
  }

  // 2. Date predicate. ISO yyyy-mm-dd string column.
  //    - `date` (single value) → equality. Used for Today / single-day.
  //    - `from` + `to` → BETWEEN range. Used for Month / Year / custom.
  //    Either form, not both.
  if (date != null && date !== "") {
    const iso = toIsoDate(date);
    where.push(`date = ${escapeLiteral(iso)}`);
  } else {
    if (from != null && from !== "") {
      where.push(`date >= ${escapeLiteral(toIsoDate(from))}`);
    }
    if (to != null && to !== "") {
      where.push(`date <= ${escapeLiteral(toIsoDate(to))}`);
    }
  }

  // 3. Parent filters carried forward from clicked rows.
  for (const [key, raw] of Object.entries(parentFilters)) {
    if (!ALLOWED_PARENT_FILTER_KEYS.has(key)) {
      throw new QueryValidationError(`Unknown parent filter: ${key}`);
    }
    if (raw == null || raw === "") continue;
    const value = safeStringValue(raw, key);
    where.push(`${key} = ${escapeLiteral(value)}`);
  }

  // 4. Drill shape. Null/undefined → landing only. Array → return BOTH
  //    landing rows (drill_down_level = 1) AND drill children so the grid
  //    always has cards while the drill panel is open.
  if (drillKpis == null) {
    where.push("drill_down_level = 1");
  } else {
    if (!Array.isArray(drillKpis) || drillKpis.length === 0) {
      throw new QueryValidationError(
        "drillKpis must be a non-empty array or null",
      );
    }
    if (drillKpis.length > 32) {
      throw new QueryValidationError("drillKpis exceeds 32 entries");
    }
    const escaped = drillKpis.map((k) =>
      escapeLiteral(safeStringValue(k, "drillKpis[]")),
    );
    // Always include landing rows so the grid doesn't go empty during drill.
    where.push(`(drill_down_level = 1 OR kpi_name IN (${escaped.join(", ")}))`);
  }

  // 5. Bound result size. Upstream Lambda has its own limit too.
  const lim = Number.isInteger(limit) && limit > 0 && limit <= 10000
    ? limit
    : 5000;

  const table = config.upstream.table || "gold_dummy";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return `SELECT * FROM ${table} ${whereSql} LIMIT ${lim}`.replace(/\s+/g, " ").trim();
}
