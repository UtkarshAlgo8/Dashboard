/**
 * Pull query for the materializer.
 *
 * Unlike buildFetchQuery / buildDrillAggregateQuery, this is NOT a query
 * that goes to a dashboard panel. It is the one-time per-refresh pull
 * that populates the in-memory materializer cache.
 *
 * Goals:
 *   - Pull EVERY level-1 and level-2 deduped row for the trailing N days.
 *   - Skip nothing — the materializer's value comes from being able to
 *     answer arbitrary filter combinations without going back to Athena.
 *   - Normalize `drill_down_level` numerically because Banmore stores
 *     "1", "1.0", and (recently) empty strings — a literal equality
 *     check would silently drop ~25% of the landing rows.
 *   - Run the same de-duplication as buildFetchQuery so the dedupe
 *     semantics are identical (C4/C5 guarantees preserved).
 *   - No LIMIT, no ORDER — the materializer wants the whole set.
 */

import {
  DATE_YYYYMMDD,
  RATE_KPIS,
  escapeLiteral,
} from "./dashboard-query.js";
import {
  plantSqlTable,
  plantDepartmentPredicate,
  excludeUnknownKpiPredicate,
} from "../utils/normalize.js";

// GOLD_COLUMNS is private to dashboard-query.js but referenced via the same
// dedupe shape; redeclare the projection explicitly here.
const OUTPUT_COLUMNS = [
  "date",
  "section",
  "sub_section",
  "machine",
  "product_type",
  "itemcode",
  "granularity",
  "category",
  "kpi_name",
  "unit_of_measurement",
  "drill_down_attribute",
  "drill_down_level",
  "actual_value",
  "threshold_value",
  "status",
  "remarks",
];

const GOLD_COLUMNS_INNER = [
  "record_id",
  "date",
  "plant",
  "department",
  "section",
  "sub_section",
  "tyre_type",
  "machine",
  "product_type",
  "itemcode",
  "granularity",
  "category",
  "kpi_name",
  "unit_of_measurement",
  "production_ids",
  "drill_down_attribute",
  "drill_down_level",
  "actual_value",
  "previous_values",
  "threshold_value",
  "status",
  "remarks",
  "plot_data",
];

// 15-column dedupe partition — IDENTICAL to dashboard-query.js:370-386 so
// rate-KPI exemptions land on the same "rn=1" rows the live path uses.
const DEDUPE_PARTITION = [
  "date",
  "plant",
  "department",
  "section",
  "sub_section",
  "tyre_type",
  "machine",
  "product_type",
  "itemcode",
  "granularity",
  "category",
  "kpi_name",
  "unit_of_measurement",
  "remarks",
  "status",
];

const RATE_KPIS_SQL = `kpi_name IN (${[...RATE_KPIS]
  .map((k) => `'${k}'`)
  .join(", ")})`;

/** ISO yyyy-mm-dd → YYYYMMDD digit string for comparison literals. */
function isoToYyyymmdd(iso) {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/**
 * Shift an ISO date by whole days (negative shifts backwards).
 * Mirrors `shiftIsoDays` in dashboard-query.js — local copy because the
 * helper there is not exported.
 */
function shiftIsoDays(iso, deltaDays) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + deltaDays);
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Build the SQL that pulls level-1+2 deduped rows for the trailing
 * `windowDays` days of one plant.
 *
 * `drill_down_level` is normalized NUMERICALLY. The gold table stores
 * "1" / "1.0" inconsistently (Banmore) and empty strings (August
 * rows). CAST(... DOUBLE) → INTEGER collapses "1" and "1.0" to 1 and
 * forces empty / non-numeric values to NULL, which the WHERE then
 * excludes. Quality parents that store NULL but have no machine /
 * itemcode / sub_section are accepted by `drillDownLevelPredicate`
 * in `dashboard-query.js` (lines 996-1000) — those rows are flagged
 * by their absence of detail columns, which is enough to identify a
 * landing row.
 *
 * @param {object} input
 * @param {string} input.plantId      "banmore" | "chennai"
 * @param {number} input.windowDays   trailing window (default 60)
 * @param {number[]} input.levels     [1] or [1,2] (default both)
 * @returns {string} SQL
 */
export function buildMaterializePullQuery({
  plantId = "banmore",
  windowDays = 60,
  levels = [1, 2],
} = {}) {
  const table = plantSqlTable(plantId);
  if (!table) {
    throw new Error(`Unknown plant: ${plantId}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = shiftIsoDays(today, -windowDays);
  if (!from) {
    throw new Error(`Could not compute window start`);
  }

  // Quality parents have NULL drill_down_level + no detail cols. We
  // accept those (rows matching the LANDING_PREDICATE shape) by checking
  // the normalised level is 1 OR the row is the Quality-parent pattern.
  const levelsList = levels.map(Number);
  const levelsClause = levelsList.map((l) => String(l)).join(", ");
  // Drill-down level 1 OR 2 from the cast; OR a NULL parent that has
  // no machine / itemcode / sub_section (Quality Scrap/Rework rows).
  const levelPredicate =
    `CAST(CAST(drill_down_level AS DOUBLE) AS INTEGER) IN (${levelsClause}) OR ` +
    `(drill_down_level IS NULL AND machine IS NULL AND itemcode IS NULL AND sub_section IS NULL)`;

  const innerCols = GOLD_COLUMNS_INNER.join(", ");
  const outerCols = OUTPUT_COLUMNS.join(", ");
  const dedupedSource =
    `(SELECT ${innerCols}, ROW_NUMBER() OVER (` +
    `PARTITION BY ${DEDUPE_PARTITION.join(", ")} ` +
    `ORDER BY actual_value DESC) AS __dedupe_rn ` +
    `FROM ${table} ` +
    `WHERE ${plantDepartmentPredicate(plantId)} ` +
    `AND ${excludeUnknownKpiPredicate()} ` +
    `AND ${DATE_YYYYMMDD} >= '${isoToYyyymmdd(from)}' ` +
    `AND (${levelPredicate}))`;

  return (
    `SELECT ${outerCols} FROM ${dedupedSource} ` +
    `WHERE (__dedupe_rn = 1 OR ${RATE_KPIS_SQL})`
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Estimate the row count for a refresh. Runs a COUNT(*) over the same
 * window so the materializer can log "pulled N rows in Mms" without
 * needing to count after the fact.
 */
export function buildMaterializeCountQuery({
  plantId = "banmore",
  windowDays = 60,
  levels = [1, 2],
} = {}) {
  const table = plantSqlTable(plantId);
  if (!table) throw new Error(`Unknown plant: ${plantId}`);

  const today = new Date().toISOString().slice(0, 10);
  const from = shiftIsoDays(today, -windowDays);
  if (!from) throw new Error(`Could not compute window start`);

  const levelsList = levels.map(Number);
  const levelsClause = levelsList.map((l) => String(l)).join(", ");
  const levelPredicate =
    `CAST(CAST(drill_down_level AS DOUBLE) AS INTEGER) IN (${levelsClause}) OR ` +
    `(drill_down_level IS NULL AND machine IS NULL AND itemcode IS NULL AND sub_section IS NULL)`;

  return (
    `SELECT COUNT(*) AS n FROM ${table} ` +
    `WHERE ${plantDepartmentPredicate(plantId)} ` +
    `AND ${excludeUnknownKpiPredicate()} ` +
    `AND ${DATE_YYYYMMDD} >= '${isoToYyyymmdd(from)}' ` +
    `AND (${levelPredicate})`
  )
    .replace(/\s+/g, " ")
    .trim();
}