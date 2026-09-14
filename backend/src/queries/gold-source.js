/**
 * Resolves the SQL FROM target for a (plant, date window) read.
 *
 * Design (architect-reviewed, verified against live Athena data):
 *   - `gold.gold` (the base table) is the full history (2022-present),
 *     complete for closed days, but incomplete for the last ~2 days
 *     including today.
 *   - `gold.gold_daily` is a rolling ~48-day table, complete for today and
 *     the prior couple of days, but THIN/unreliable further back within
 *     its own window — it must never be trusted for older dates.
 *   - `config.upstream.dailyFreshDays` (default 2) is the cutoff: dates
 *     >= today - dailyFreshDays read from the daily table; older dates
 *     read from the base table.
 *   - Only plants with a daily counterpart configured (Banmore) ever read
 *     the daily table. A plant with none (Chennai) is a no-op passthrough.
 *
 * Pure function, no network calls — this only decides which FROM target
 * (or UNION ALL of two) a query builder should use.
 */
import { config } from "../config.js";
import { plantSqlTable, plantDailySqlTable } from "../utils/normalize.js";
import { DATE_YYYYMMDD } from "./sql-date.js";

/**
 * The gold table's 27 columns, in order. Listed explicitly for the UNION
 * ALL branches below — both the base and daily tables are byte-identical
 * on this schema, so each branch selects the same columns in the same
 * order and the two halves of the union line up positionally.
 */
export const GOLD_ALL_COLUMNS = [
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
  "equnr",
  "eqname",
  "arbpl",
  "logbook_id",
];

// Fixed Asia/Kolkata offset (IST is UTC+5:30, no DST) — computed
// explicitly rather than via server-local time or plain UTC, since the
// codebase already has inconsistent timezone handling elsewhere and this
// must not add to it.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function yyyymmddUTC(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * `today(Asia/Kolkata) - config.upstream.dailyFreshDays` days, as a
 * YYYYMMDD digit string. Dates on/after this are "fresh" (daily table);
 * dates before it are "historical" (base table).
 */
export function freshCutoffKey() {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  istNow.setUTCDate(istNow.getUTCDate() - config.upstream.dailyFreshDays);
  return yyyymmddUTC(istNow);
}

/** AND-clause clamping DATE_YYYYMMDD to [fromKey, toKey] (either optional). */
function windowClamp(fromKey, toKey) {
  const parts = [];
  if (fromKey != null) parts.push(`${DATE_YYYYMMDD} >= '${fromKey}'`);
  if (toKey != null) parts.push(`${DATE_YYYYMMDD} <= '${toKey}'`);
  return parts.length ? ` AND ${parts.join(" AND ")}` : "";
}

/**
 * Resolve the SQL FROM target for a (plant, date window) read.
 *
 * @param {object} input
 * @param {string} input.plantId
 * @param {string|null} [input.fromKey] YYYYMMDD digit string, or null (unbounded)
 * @param {string|null} [input.toKey]   YYYYMMDD digit string, or null (unbounded)
 * @returns {string} a table name, or a parenthesized UNION ALL subquery —
 *   either way, a string that can be substituted wherever a table name is
 *   used in SQL.
 */
export function goldSource({ plantId, fromKey = null, toKey = null } = {}) {
  const baseTable = plantSqlTable(plantId);
  const dailyTable = plantDailySqlTable(plantId);

  // No daily counterpart for this plant (Chennai) — always the base table.
  if (!dailyTable) return baseTable;

  const cutoff = freshCutoffKey();

  // Entirely historical: byte-identical to the pre-existing SQL, so this
  // is zero regression risk for every caller that never reads recent dates.
  if (toKey != null && toKey < cutoff) return baseTable;

  // Entirely fresh: every date in [fromKey, toKey] is in the daily table's
  // reliable window.
  if (fromKey != null && fromKey >= cutoff) return dailyTable;

  // Straddles the cutoff, or unbounded on one/both sides. Split into two
  // disjoint, adjacent branches (< cutoff / >= cutoff) so gold.gold's
  // incomplete-but-present recent rows are never double-counted against
  // gold_daily's rows for the same dates.
  const cols = GOLD_ALL_COLUMNS.join(", ");
  const historicalBranch =
    `SELECT ${cols} FROM ${baseTable} ` +
    `WHERE ${DATE_YYYYMMDD} < '${cutoff}'${windowClamp(fromKey, toKey)}`;
  const freshBranch =
    `SELECT ${cols} FROM ${dailyTable} ` +
    `WHERE ${DATE_YYYYMMDD} >= '${cutoff}'${windowClamp(fromKey, toKey)}`;

  return `(${historicalBranch} UNION ALL ${freshBranch})`;
}
