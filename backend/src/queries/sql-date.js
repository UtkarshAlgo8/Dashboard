/**
 * Shared date <-> SQL helpers used by every query builder.
 *
 * Previously duplicated three ways (dashboard-query.js's DATE_YYYYMMDD +
 * isoToYyyymmdd, and queries.js's byte-identical DATE_KEY expression). One
 * copy here; dashboard-query.js re-exports both names so existing importers
 * (e.g. static.controller.js) keep working unchanged.
 */

/**
 * SQL expression that normalizes the `date` column to a sortable,
 * comparable YYYYMMDD string REGARDLESS of stored type/format. The live
 * gold table stores `date` as a real DATE type; older/CSV-backed envs
 * store it as a STRING in ISO `yyyy-mm-dd` or `DD-MM-YYYY`. We:
 *   1. CAST to VARCHAR first — SUBSTRING needs VARCHAR, and a DATE casts
 *      to ISO "yyyy-mm-dd"; a string passes through unchanged.
 *   2. Detect the format by dash position rather than assuming one:
 *        ISO         "2026-04-01" → dash at char 5 → YYYY MM DD inline
 *        DD-MM-YYYY  "01-04-2026" → dash at char 3 → reorder to YYYYMMDD
 * Engine-agnostic (Athena / DuckDB / Trino). No year/month/day column
 * predicate (those trigger upstream partition-path lookups that fail).
 */
const DATE_STR = "CAST(date AS VARCHAR)";
export const DATE_YYYYMMDD =
  `(CASE WHEN SUBSTRING(${DATE_STR}, 5, 1) = '-' ` +
  `THEN SUBSTRING(${DATE_STR}, 1, 4) || SUBSTRING(${DATE_STR}, 6, 2) || SUBSTRING(${DATE_STR}, 9, 2) ` +
  `ELSE SUBSTRING(${DATE_STR}, 7, 4) || SUBSTRING(${DATE_STR}, 4, 2) || SUBSTRING(${DATE_STR}, 1, 2) END)`;

/** Today (UTC) minus `days`, as a "YYYYMMDD" key. */
export function ymdDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

/** ISO yyyy-mm-dd → YYYYMMDD digit string for comparison literals. */
export function isoToYyyymmdd(iso) {
  return iso.replaceAll("-", "");
}
