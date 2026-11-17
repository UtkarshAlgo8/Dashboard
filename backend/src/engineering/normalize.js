/**
 * Engineering Reliability normalization + shared SQL predicates
 * (spec 16/17). Additive to Production's normalize.js and independent of
 * quality/normalize.js — the Engineering gold layer is its own family
 * (department='Engineering', category='Reliability', plant='BTP'), so it
 * gets its own thin layer here, duplicating the small building blocks
 * (escapeLiteral, DATE_YYYYMMDD, isoToYyyymmdd) rather than cross-importing
 * from Quality — matches the existing per-family-duplication convention.
 */

/* ----------------------------------------------------------------- *
 * SQL literal escaping                                              *
 * ----------------------------------------------------------------- */

/** Single-quote-escape a value for inline SQL (mirrors Production/Quality). */
export function escapeLiteral(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number cannot be a SQL literal: ${value}`);
    }
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

/* ----------------------------------------------------------------- *
 * Scope predicate                                                    *
 * ----------------------------------------------------------------- */

export const DEPARTMENT_ENGINEERING = "Engineering";
export const CATEGORY_RELIABILITY = "Reliability";
export const PLANT_BTP = "BTP";

/**
 * The always-on Engineering Reliability scope: department Engineering +
 * category Reliability + plant BTP. Every query AND-prepends this.
 */
export function engineeringScopePredicate() {
  return (
    `LOWER(department) = 'engineering' ` +
    `AND category = ${escapeLiteral(CATEGORY_RELIABILITY)} ` +
    `AND UPPER(plant) = ${escapeLiteral(PLANT_BTP)}`
  );
}

/**
 * The upstream asset master leaves some machines without a grade or a
 * section, and the ETL publishes them under the literal bucket 'Unmapped' in
 * BOTH columns (it appears nowhere else — never in sub_section, machine,
 * product_type or remarks; checked against gold.gold on 2026-09-18). It is a
 * data-quality placeholder, not a plant category, so nothing that draws a
 * table or a chart shows it: the drill endpoint drops those rows outright,
 * which takes the 'Unmapped' category row, the 'Unmapped' section row/bar and
 * the machines behind them off every level at once.
 *
 * Deliberately NOT applied to the summary cards or the trend series. Those
 * read the published `_Overall` rows, which the ETL computed over the whole
 * plant including these machines; re-deriving them here would mean
 * recomputing rates the UI is not allowed to recompute (spec rule 8). So a
 * card total is the plant, and the drill under it is the MAPPED plant — the
 * levels no longer sum to the card, which is the accepted cost of hiding the
 * bucket.
 *
 * COALESCE, not a bare `<>`: on Athena a NULL dimension makes `<> 'Unmapped'`
 * evaluate to NULL and the row is dropped, which would silently delete every
 * `_Overall` row (they carry no dims at all).
 */
export const UNMAPPED = "Unmapped";

export function excludeUnmappedPredicate() {
  const lit = escapeLiteral(UNMAPPED);
  return `COALESCE(status, '') <> ${lit} AND COALESCE(section, '') <> ${lit}`;
}

/* ----------------------------------------------------------------- *
 * Granularity                                                        *
 * ----------------------------------------------------------------- */

export const GRAN_DAY = "DAY";
export const GRAN_MONTH = "MONTH";

// Supported Reliability grains. Coverage can be partial for a running day;
// selecting a grain does not imply that every KPI has been published for it.
// The query layer independently resolves recent DAY versus historical/MONTH sources.
const ALLOWED_GRANULARITIES = new Set([GRAN_DAY, GRAN_MONTH]);

/**
 * Resolve the UI's granularity selection to a canonical gold token.
 *
 * MONTH remains the default for both sources, matching the month-first page.
 * Read its stored first-day anchor as published; do not average daily rates
 * or substitute today's DAY values into a MONTH response. The ETL determines
 * how current that rollup is. Fresh daily rows do not imply the archive's
 * monthly snapshot has already incorporated them.
 *
 * Returns null for anything not on the allow-list so callers can 400.
 *
 * @param {{granularity?: string}} input
 * @returns {string|null}
 */
export function resolveGranularity({ granularity } = {}) {
  if (!granularity) return GRAN_MONTH;
  const g = String(granularity).trim().toUpperCase();
  return ALLOWED_GRANULARITIES.has(g) ? g : null;
}

/* ----------------------------------------------------------------- *
 * Date predicate (Athena-safe; alasql-compatible)                   *
 * ----------------------------------------------------------------- */

// Mirrors Quality's DATE_YYYYMMDD: cast to VARCHAR, normalize both stored
// ISO ("2026-04-01") and DD-MM-YYYY ("01-04-2026") forms to a YYYYMMDD
// digit string so the comparison side (always YYYYMMDD) is comparable.
export const DATE_YYYYMMDD =
  `(CASE WHEN SUBSTRING(CAST(date AS VARCHAR), 5, 1) = '-' ` +
  `THEN SUBSTRING(CAST(date AS VARCHAR), 1, 4) || SUBSTRING(CAST(date AS VARCHAR), 6, 2) || SUBSTRING(CAST(date AS VARCHAR), 9, 2) ` +
  `ELSE SUBSTRING(CAST(date AS VARCHAR), 7, 4) || SUBSTRING(CAST(date AS VARCHAR), 4, 2) || SUBSTRING(CAST(date AS VARCHAR), 1, 2) END)`;

/** ISO yyyy-mm-dd → YYYYMMDD digit string for comparison literals. */
export function isoToYyyymmdd(iso) {
  return String(iso).replaceAll("-", "");
}

/* ----------------------------------------------------------------- *
 * The "null" sentinel + drill parsing                                *
 * ----------------------------------------------------------------- */

// Loader already converts the literal "null" and blank cells to JS null
// (see datasource/loadExcel.js), so JS-side "is empty?" is a plain == null
// check. This helper stays for the odd raw string that reaches a transformer.
export function isEmptyValue(v) {
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  return s === "" || s === "null" || s === "nan";
}

/**
 * SQL "this row carries a real measurement". Needed because the upstream ETL
 * writes PLACEHOLDER ROWS for the in-progress day: today's row exists but its
 * `actual_value` is empty, so a plain "latest row" lookup anchors the whole
 * page on a day whose cards are all blank. Anchoring on "latest row that
 * actually has a value" lands on the last complete day instead.
 *
 * A bare NULL check covers both executors, and deliberately so: upstream
 * `actual_value` is a DOUBLE (so it is either NULL or a number — the string
 * sentinels never reach it, and LOWER()/string comparison would be a type
 * error against Athena), while on the excel path loadExcel.js has already
 * converted "null"/"nan"/blank cells to JS null before alasql sees them.
 */
export function hasValuePredicate(column = "actual_value") {
  return `${column} IS NOT NULL`;
}

/** Rows with a non-zero value only (drops Gold's zero-filled pairs). */
export function nonZeroPredicate(column = "actual_value") {
  return `${column} <> 0`;
}

/**
 * Parse a stored `drill_down_attribute` into the next kpi_name to query.
 *
 * Format-agnostic between the mock workbook and the real upstream table,
 * which disagree on shape:
 *  - `gold_mock.xlsx` stores a plain bare kpi_name string, e.g.
 *    "Breakdown_Pct_Grade".
 *  - The real `gold.gold` table stores a Python-list-repr string, e.g.
 *    "['Breakdown_Pct_Grade']" (single-quoted, not valid JSON).
 *
 * Mirrors Quality's parseDrillDown two-step parse (JSON.parse, then a
 * single-quote → double-quote fallback for the Python-list form) but keeps
 * Engineering's plain-string return shape ({is_leaf, next_kpi_name}, not
 * Quality's {is_leaf, children} array) — the first parsed array element
 * becomes next_kpi_name. `drill_down_level` is never read (same navigation
 * rule as Quality).
 *
 * @param {unknown} raw
 * @returns {{ is_leaf: boolean, next_kpi_name: string|null }}
 */
export function parseDrillDown(raw) {
  if (isEmptyValue(raw)) return { is_leaf: true, next_kpi_name: null };
  if (Array.isArray(raw)) {
    return raw.length > 0
      ? { is_leaf: false, next_kpi_name: String(raw[0]).trim() }
      : { is_leaf: true, next_kpi_name: null };
  }

  const text = String(raw).trim();
  // A bare kpi_name (mock format) never contains brackets — only attempt
  // list parsing when the string looks like one, so plain strings fall
  // straight through to the last branch unchanged.
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr) && arr.length > 0) {
        return { is_leaf: false, next_kpi_name: String(arr[0]).trim() };
      }
      return { is_leaf: true, next_kpi_name: null };
    } catch {
      // Single-quoted Python-list form, e.g. ['Breakdown_Pct_Grade'].
      try {
        const arr = JSON.parse(text.replaceAll("'", '"'));
        if (Array.isArray(arr) && arr.length > 0) {
          return { is_leaf: false, next_kpi_name: String(arr[0]).trim() };
        }
        return { is_leaf: true, next_kpi_name: null };
      } catch {
        // Bracketed but unparseable by either form — treat as a leaf
        // rather than surfacing a garbage bracket/quote string downstream.
        return { is_leaf: true, next_kpi_name: null };
      }
    }
  }

  return { is_leaf: false, next_kpi_name: text };
}

/**
 * Coerce a stored measurement to its JSON-serializable form: the "null"
 * sentinel and blanks become JSON `null` ("—" in the UI). A missing row
 * means "nothing to measure" here — there is no zero-fill counter concept
 * in Engineering Reliability (unlike Quality's violation counters).
 *
 * Numeric strings are parsed to numbers. The two executors disagree on type:
 * the xlsx loader yields JS numbers, while the upstream JSON returns every
 * value as a string ("4378.0"). Left as strings, every `+` downstream
 * CONCATENATES instead of adding — the Loss Tree totals became
 * "03675.01180.0241.0…" and the pie's percentages followed them. Normalizing
 * the type here fixes the summing transformer and the frontend's reducers at
 * once. Non-numeric text is passed through untouched.
 */
export function valueOrNull(v) {
  if (isEmptyValue(v)) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}
