/**
 * SQL builders for the Engineering Reliability tab (Overview + Reliability,
 * spec 16/17). Pure functions, mirroring quality/queries/process.queries.js.
 *
 * Business predicates are shared between the local alasql and remote DB paths.
 * The Engineering source adapter keeps Excel single-table while resolving DB
 * reads through the same recent/history policy as Production and Quality.
 *
 * String concatenation (not bind params) mirrors Production/Quality; every
 * value goes through `escapeLiteral`.
 *
 * ONE generic builder (`kpiChildrenQuery`) serves every drill level of every
 * KPI family here (Breakdown %/Min, MTBF, MTTR, Top Machine Breakdowns, Zero
 * Breakdown Machines, Loss Tree) — only the scope filters and requested
 * kpi_names change per level/caller.
 */
import { engineeringGoldSource } from "./gold-source.js";
import {
  escapeLiteral,
  engineeringScopePredicate,
  excludeUnmappedPredicate,
  hasValuePredicate,
  nonZeroPredicate,
  DATE_YYYYMMDD,
  isoToYyyymmdd,
} from "../normalize.js";

// Rechecked 2026-11-17: daily Reliability rows now carry the correct category,
// while gold.gold has no rows for today. Use the existing disjoint fresh/history
// resolver; never switch historical DAY reads or MONTH snapshots wholesale to daily.

// Columns every Reliability response needs. drill_down_attribute is
// selected raw and parsed in the transformer (parseDrillDown).
const SELECT_COLS =
  "date, status, section, sub_section, machine, eqname, product_type, " +
  "remarks, kpi_name, actual_value, unit_of_measurement, drill_down_attribute";

/**
 * The machine-level component measurements a multi-day period is rebuilt
 * from. MTBF, MTTR and Breakdown % are rates/means, so a period total can
 * NOT be produced by summing or averaging the published daily `_Overall`
 * values — it has to be recomputed from these additive parts:
 *
 *   Breakdown % = ΣBreakdownMin / ΣScheduledMin × 100
 *   MTTR        = ΣBreakdownMin / ΣBreakdownOcc
 *   MTBF        = ΣOperatingMin / ΣBreakdownOcc
 *
 * Verified against the published daily `_Overall` rows on 2026-09-11, -13
 * and -14: every formula reproduces the stored value exactly.
 */
export const COMPONENT_KPIS = [
  "BreakdownMin_m",
  "BreakdownOcc_m",
  "OperatingMin_m",
  "ScheduledMin_m",
];

/**
 * Period totals of the component measurements above, summed across every
 * machine and every DAY row in [from, to]. Always DAY grain, by definition:
 * this is the rebuild path for an ARBITRARY range that is not a whole
 * calendar month. A whole month must NOT come through here — it has a
 * published MONTH row (`kpiValueBatchQuery` at granularity='MONTH'), which
 * is the same arithmetic done upstream, over one row instead of ~10^6.
 */
export function componentAggregateQuery({ from, to }) {
  const list = COMPONENT_KPIS.map(escapeLiteral).join(", ");
  return (
    `SELECT kpi_name, SUM(actual_value) AS component_sum FROM ${engineeringGoldSource({ from, to, granularity: "DAY" })} ` +
    `WHERE ${engineeringScopePredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = 'DAY' ` +
    `AND ${hasValuePredicate()} ` +
    `AND ${DATE_YYYYMMDD} >= ${escapeLiteral(isoToYyyymmdd(from))} ` +
    `AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(to))} ` +
    `GROUP BY kpi_name`
  );
}

/**
 * Loss Tree over an arbitrary (non-whole-month) period. Lost time and
 * occurrence counts are plain additive quantities, so unlike the KPIs above
 * these simply sum — the transformer groups by product_type exactly as it
 * does for a single day. A whole month reads its published MONTH rows
 * instead, via `kpiChildrenQuery`.
 */
export function lossTreeRangeQuery({ kpiNames, from, to }) {
  const list = kpiNames.map(escapeLiteral).join(", ");
  return (
    `SELECT ${SELECT_COLS} FROM ${engineeringGoldSource({ from, to, granularity: "DAY" })} ` +
    `WHERE ${engineeringScopePredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = 'DAY' ` +
    `AND ${excludeUnmappedPredicate()} ` +
    `AND ${DATE_YYYYMMDD} >= ${escapeLiteral(isoToYyyymmdd(from))} ` +
    `AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(to))}`
  );
}

/** Optional scope fragment shared by kpi-children / kpi-history. */
function scopeFragment({
  status,
  section,
  machine,
  subSection,
  productType,
} = {}) {
  const parts = [];
  if (status) parts.push(`status = ${escapeLiteral(status)}`);
  if (section) parts.push(`section = ${escapeLiteral(section)}`);
  if (machine) parts.push(`machine = ${escapeLiteral(machine)}`);
  if (subSection) parts.push(`sub_section = ${escapeLiteral(subSection)}`);
  if (productType) parts.push(`product_type = ${escapeLiteral(productType)}`);
  return parts.length ? " AND " + parts.join(" AND ") : "";
}

/**
 * One published day/month, or every published day in a window.
 *
 * A window is what the date-wise Failure level reads (FRS: date-wise
 * breakdown drill): it asks for `granularity='DAY'` across the month the
 * panel is showing, so the rows it gets back are one per (failure, day)
 * rather than one per failure. Every other caller pins a single `date` and
 * is unaffected. Nothing is summed here — each row is still a published
 * value, which is what keeps a rate column (Breakdown %) honest at this
 * grain (rule 8).
 */
function datePredicate({ date, from, to }) {
  if (from && to) {
    return (
      `AND ${DATE_YYYYMMDD} >= ${escapeLiteral(isoToYyyymmdd(from))} ` +
      `AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(to))}`
    );
  }
  return `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(date))}`;
}

/**
 * kpi-value-batch: several Overall-level (no-dim) bases in one round trip —
 * feeds the 4 Overview/Reliability summary cards (Breakdown %+Min, MTBF,
 * MTTR) for a given date.
 */
export function kpiValueBatchQuery({ kpiNames, date, granularity }) {
  const list = kpiNames.map(escapeLiteral).join(", ");
  return (
    `SELECT ${SELECT_COLS} FROM ${engineeringGoldSource({ date, granularity })} ` +
    `WHERE ${engineeringScopePredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(date))}`
  );
}

/**
 * kpi-children: the next drill level as a table. Batches several bases
 * (e.g. Breakdown_Pct_* + BreakdownMin_*) at one level; the transformer
 * either JOINs sibling kpi_names onto one row per group (Breakdown/MTBF/
 * MTTR/Top-Machine/Zero-Breakdown — ancestor dims are pinned to a single
 * value by the scope filters, so each group has exactly one row per
 * kpi_name) or SUMs them (Loss Tree — status/section are never pinned by
 * that family, so multiple rows per group must be aggregated).
 *
 * Scope filters accumulate down the Breakdown/MTBF/MTTR chain: status →
 * +section → +machine → +sub_section → +remarks (remarks has no column
 * filter here — it's the leaf grouping dimension itself, never a parent
 * filter). `productType` is Loss Tree's equivalent ancestor pin
 * (category → discipline → machine → failure).
 */
export function kpiChildrenQuery({
  kpiNames,
  date,
  from,
  to,
  granularity,
  status,
  section,
  machine,
  subSection,
  productType,
  includeUnmapped = false,
  nonZero = false,
}) {
  const list = kpiNames.map(escapeLiteral).join(", ");
  return (
    `SELECT ${SELECT_COLS} FROM ${engineeringGoldSource({ date, from, to, granularity })} ` +
    `WHERE ${engineeringScopePredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    // Gold publishes Breakdown_Pct_m_Failure for every machine × failure pair,
    // ~75% of them 0 (pairs that never broke down) — 30k rows a month. A
    // caller that discards zero rows anyway asks for them not to be sent.
    (nonZero ? `AND ${nonZeroPredicate()} ` : "") +
    // Every drill table and every chart is fed from here, so this one line
    // is what keeps the 'Unmapped' bucket off all of them — except the
    // Breakdown and MTBF/MTTR plot drills, which show it in grey.
    (includeUnmapped ? "" : `AND ${excludeUnmappedPredicate()} `) +
    datePredicate({ date, from, to }) +
    scopeFragment({ status, section, machine, subSection, productType })
  );
}

/**
 * kpi-history: a MONTH series for a card's trend modal. Every MONTH row is
 * dated the 1st of its month, so a 1st-of-first-month → 1st-of-last-month
 * window selects exactly those months and nothing else.
 */
export function kpiHistoryQuery({
  kpiName,
  from,
  to,
  granularity,
  status,
  section,
  machine,
  subSection,
}) {
  return (
    `SELECT date, actual_value FROM ${engineeringGoldSource({ from, to, granularity })} ` +
    `WHERE ${engineeringScopePredicate()} ` +
    `AND kpi_name = ${escapeLiteral(kpiName)} ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND ${DATE_YYYYMMDD} >= ${escapeLiteral(isoToYyyymmdd(from))} ` +
    `AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(to))}` +
    scopeFragment({ status, section, machine, subSection }) +
    ` ORDER BY date ASC`
  );
}

/**
 * latest-date: the most recent date for a given kpi_name/granularity. Used
 * to resolve the latest available DAY for the two Zero-Breakdown KPIs
 * without the frontend having to know it in advance.
 *
 * `ORDER BY date DESC LIMIT 1` rather than `MAX(date)`: alasql's MAX()
 * aggregate is numeric-only and silently drops non-numeric columns (a
 * string `date` column returns an empty row), so this is the portable
 * form across both the excel and DB executors.
 */
export function latestDateQuery({ kpiName, granularity }) {
  return (
    `SELECT date AS max_date FROM ${engineeringGoldSource({ granularity })} ` +
    `WHERE ${engineeringScopePredicate()} ` +
    `AND kpi_name = ${escapeLiteral(kpiName)} ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND ${hasValuePredicate()} ` +
    `ORDER BY date DESC LIMIT 1`
  );
}

/**
 * latest-date across SEVERAL kpi_names: the most recent date on which EVERY
 * one of them carries a value.
 *
 * This is what the page's default report period anchors on. A single-KPI
 * lookup is not enough: the ETL publishes the in-progress day incrementally,
 * so today can hold a real `Breakdown_Pct_Overall` (0.0) while MTBF/MTTR/
 * Breakdown-minutes have not landed — anchoring there shows one number and
 * three blanks. Requiring the whole set lands on the last COMPLETE day.
 *
 * At MONTH grain the same rule picks the latest month in which all four
 * headline KPIs are published — which is the running month, because the
 * MONTH rollup is maintained day by day rather than written at month end.
 *
 * `GROUP BY ... HAVING COUNT(DISTINCT kpi_name) = n` (no subquery) so the
 * same SQL runs on Athena and alasql. Deliberately NO `ORDER BY ... LIMIT 1`:
 * alasql does not reliably order a GROUPed string column, so trusting it
 * would silently pick the EARLIEST qualifying date there. Every qualifying
 * date is returned and `toLatestDate` takes the max in JS instead.
 */
export function latestCompleteDateQuery({ kpiNames, granularity }) {
  const list = kpiNames.map(escapeLiteral).join(", ");
  return (
    `SELECT date AS max_date FROM ${engineeringGoldSource({ granularity })} ` +
    `WHERE ${engineeringScopePredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND ${hasValuePredicate()} ` +
    `GROUP BY date HAVING COUNT(DISTINCT kpi_name) = ${kpiNames.length}`
  );
}

/**
 * Zero Breakdown Machines: per-DAY distinct machine counts of
 * DaysWithoutBreakdown_m, either every machine that has a row (`minDays`
 * omitted — the coverage used to spot a partially-published day) or only
 * those strictly above `minDays` (the "zero breakdown" machines).
 */
export function daysWithoutBreakdownCountQuery({ minDays } = {}) {
  const over = minDays == null ? "" : `AND actual_value > ${Number(minDays)} `;
  return (
    `SELECT date, COUNT(DISTINCT machine) AS machine_count FROM ${engineeringGoldSource({ granularity: "DAY" })} ` +
    `WHERE ${engineeringScopePredicate()} ` +
    `AND kpi_name = 'DaysWithoutBreakdown_m' ` +
    `AND granularity = 'DAY' ` +
    `AND ${hasValuePredicate()} ` +
    over +
    `GROUP BY date`
  );
}
