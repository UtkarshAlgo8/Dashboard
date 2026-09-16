/**
 * Resolves the SQL FROM target for a Quality read, over the SAME two
 * tables Production uses (queries/gold-source.js):
 *
 *   gold.gold        full history, complete for closed days but incomplete
 *                    for today and the last couple of days.
 *   gold.gold_daily  rolling ~48-day table, complete for today and the
 *                    prior couple of days, thin further back.
 *
 * Verified live 2026-09-16 for department='Quality', plant='BANMORE':
 * today's Process Audit rows were 58 in gold.gold vs 137 in gold.gold_daily
 * and Uniformity Testing 8 vs 12 — i.e. the Quality families suffer the same
 * same-day incompleteness Production does, so they need the same split.
 *
 * The cutoff (`config.upstream.dailyFreshDays`) is deliberately shared with
 * Production rather than given its own knob: both families are written by
 * the same pipeline, so one table-freshness boundary is the honest model.
 *
 * Pure function, no network calls.
 */
import { config } from "../../config.js";
import { resolveGoldSource } from "../../queries/gold-source.js";
import { GRAN_MONTH, GRAN_YEAR, isoToYyyymmdd } from "../normalize.js";

/**
 * Granularities the rolling table does NOT carry for Quality. Verified live
 * 2026-09-16: gold.gold_daily holds DAY + SHIFT A/B/C for
 * department='Quality', plant='BTP' but ZERO MONTH and ZERO YEAR rows, while
 * gold.gold holds 6704 MONTH and 2016 YEAR rows for the same scope.
 *
 * MONTH rows are stamped with the first of the month, so they normally fall
 * on the historical side of the cutoff anyway — but on the 1st/2nd of a month
 * the current-month read (the Process tab's default filter) would land in the
 * fresh window and come back EMPTY. These always read the base table.
 */
const BASE_TABLE_ONLY_GRANULARITIES = new Set([GRAN_MONTH, GRAN_YEAR]);

/** True when a granularity token has no counterpart in the rolling table. */
function isBaseTableOnly(granularity) {
  if (granularity == null) return false;
  const tokens = Array.isArray(granularity) ? granularity : [granularity];
  return tokens.some((g) =>
    BASE_TABLE_ONLY_GRANULARITIES.has(String(g).trim().toUpperCase()),
  );
}

/**
 * @param {object} [input]
 * @param {string|null} [input.fromKey] YYYYMMDD digit string, or null (unbounded)
 * @param {string|null} [input.toKey]   YYYYMMDD digit string, or null (unbounded)
 * @param {string|string[]|null} [input.granularity] granularity token(s) the
 *   caller will filter on; MONTH/YEAR force the base table (see above).
 * @returns {string} a table name, or a parenthesized UNION ALL subquery —
 *   either way, substitutable wherever a table name is used in SQL.
 */
export function qualitySource({
  fromKey = null,
  toKey = null,
  granularity = null,
} = {}) {
  const baseTable = config.quality.sqlTable;
  // The excel source registers ONE in-memory alasql table and rewrites
  // `FROM <sqlTable>` to it; a UNION ALL of two names would rewrite to a
  // self-union and double every row. Excel is single-table by definition.
  const dailyTable =
    config.quality.dataSource === "excel" || isBaseTableOnly(granularity)
      ? null
      : config.quality.dailySqlTable;

  return resolveGoldSource({ baseTable, dailyTable, fromKey, toKey });
}

/** qualitySource() for a single ISO date (the common single-day read). */
export function qualitySourceForDate(isoDate, granularity = null) {
  const key = isoDate ? isoToYyyymmdd(isoDate) : null;
  return qualitySource({ fromKey: key, toKey: key, granularity });
}

/** qualitySource() for an inclusive ISO [from, to] range; either may be null. */
export function qualitySourceForRange(from, to, granularity = null) {
  return qualitySource({
    fromKey: from ? isoToYyyymmdd(from) : null,
    toKey: to ? isoToYyyymmdd(to) : null,
    granularity,
  });
}
