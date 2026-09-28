/**
 * SQL builders for the Quality SPC module — GOLD layer. Pure functions.
 *
 * SPC scope (§0.1): department='Quality', category='SPC', plant='BANMORE'
 * (the SPC family label — filtering SPC on BTP returns nothing).
 *
 * Gold carries two distinct kinds of SPC row and they must never be mixed:
 *
 *   capability rows  granularity Day | Shift A | Shift B | Shift C,
 *                    kpi_name '<parameter> <Cp|Cpk|Pp|Ppk>', one set per
 *                    (date, machine, itemcode, parameter).
 *   baseline rows    granularity 'Baseline', status 'Reference',
 *                    kpi_name '<parameter> <UCL|LCL>' — the control limits.
 *                    Written per (machine, parameter); the itemcode on these
 *                    rows is incidental (the UCL and LCL of one parameter
 *                    carry DIFFERENT itemcodes), so limits are looked up on
 *                    machine + parameter only.
 *
 * Every capability query is granularity-scoped. Without it a single date
 * returns Day and all three shifts at once and the four metric rows of a
 * combo silently overwrite each other.
 */
import {
  escapeLiteral,
  departmentPredicate,
  DATE_YYYYMMDD,
  isoToYyyymmdd,
} from "../normalize.js";
import {
  qualitySource,
  qualitySourceForDate,
  qualitySourceForRange,
} from "./gold-source.js";

export const METRICS = ["Cp", "Cpk", "Pp", "Ppk"];
export const LIMITS = ["UCL", "LCL"];
export const GRAN_BASELINE = "Baseline";

/** Always-on SPC scope predicate (§0.1). */
function spcScope() {
  return (
    `${departmentPredicate()} ` +
    `AND category = ${escapeLiteral("SPC")} ` +
    `AND UPPER(plant) = ${escapeLiteral("BANMORE")}`
  );
}

function itemcodePredicate(recipe) {
  return recipe === ""
    ? "(itemcode IS NULL OR itemcode = '')"
    : `itemcode = ${escapeLiteral(recipe)}`;
}

/** Gold capability granularity token for a UI shift ("All" → Day). */
export function spcGranularity(shift) {
  const s = String(shift ?? "All").trim().toUpperCase();
  if (s === "A" || s === "SHIFT A") return "Shift A";
  if (s === "B" || s === "SHIFT B") return "Shift B";
  if (s === "C" || s === "SHIFT C") return "Shift C";
  return "Day";
}

function granularityPredicate(granularity) {
  return `granularity = ${escapeLiteral(granularity)}`;
}

/**
 * Resolve the snapshot: the latest capability date ≤ the requested date.
 * Scoped to the requested granularity so "latest Shift B" never resolves to
 * a Day row. Baseline rows are excluded — they carry the limits' own write
 * date (a single monthly stamp) and would pin every snapshot to it.
 */
export function spcSnapshotQuery(date, granularity = "Day") {
  const upTo = date
    ? ` AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(date))}`
    : "";
  // DISTINCT + ORDER BY DESC LIMIT 1 rather than MAX(date): `date` collides
  // with alasql's DATE keyword and MAX over date strings misbehaves; this form
  // is robust on both alasql and the upstream engine.
  return (
    `SELECT DISTINCT date AS snapshot_date ` +
    `FROM ${qualitySource({ toKey: date ? isoToYyyymmdd(date) : null, granularity })} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)}${upTo} ` +
    `ORDER BY date DESC LIMIT 1`
  );
}

/**
 * Capability rows for a snapshot — the four metric rows of every combo.
 * `plot_data` is deliberately not selected: it is empty in the live gold
 * table and the chart points come from silver instead.
 */
export function spcCapabilityRowsQuery({ snapshot, granularity, machine, recipe }) {
  const mc = machine ? ` AND machine = ${escapeLiteral(machine)}` : "";
  const rc = recipe ? ` AND ${itemcodePredicate(recipe)}` : "";
  const names = METRICS.map((m) => `kpi_name LIKE ${escapeLiteral(`% ${m}`)}`).join(" OR ");
  return (
    `SELECT machine, itemcode, product_type, kpi_name, status, actual_value, unit_of_measurement ` +
    `FROM ${qualitySourceForDate(snapshot, granularity)} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))}${mc}${rc} ` +
    `AND (${names})`
  );
}

/**
 * Capability rows AVERAGED over an inclusive date range — the month and
 * date-range views.
 *
 * Gold publishes SPC capability per day only: there are no MONTH or YEAR
 * SPC rows, so a range view used to pin the tiles to the range's last
 * published day. The average over the days that do exist is what "this
 * month's Cp" can honestly mean.
 *
 * `status` is deliberately NOT selected: it is a per-day grade and the
 * average has none. The caller derives it from the averaged value
 * (see statusForValue). `days` is the number of daily rows behind each
 * average, so an average of one day is distinguishable from one of thirty.
 */
export function spcCapabilityRangeQuery({ from, to, granularity, machine, recipe }) {
  const mc = machine ? ` AND machine = ${escapeLiteral(machine)}` : "";
  const rc = recipe ? ` AND ${itemcodePredicate(recipe)}` : "";
  const names = METRICS.map((m) => `kpi_name LIKE ${escapeLiteral(`% ${m}`)}`).join(" OR ");
  return (
    `SELECT machine, itemcode, product_type, kpi_name, ` +
    `AVG(actual_value) AS actual_value, COUNT(actual_value) AS days, ` +
    `MAX(unit_of_measurement) AS unit_of_measurement ` +
    `FROM ${qualitySourceForRange(from, to, granularity)} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)} ` +
    `AND ${DATE_YYYYMMDD} >= ${escapeLiteral(isoToYyyymmdd(from))} ` +
    `AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(to))}${mc}${rc} ` +
    `AND (${names}) ` +
    `GROUP BY machine, itemcode, product_type, kpi_name`
  );
}

/** The range average of ONE combo's four metrics. */
export function spcDetailRangeQuery({ from, to, granularity, machine, recipe, parameter }) {
  const names = METRICS.map((m) => escapeLiteral(`${parameter} ${m}`)).join(", ");
  return (
    `SELECT machine, itemcode, product_type, kpi_name, ` +
    `AVG(actual_value) AS actual_value, COUNT(actual_value) AS days, ` +
    `MAX(unit_of_measurement) AS unit_of_measurement ` +
    `FROM ${qualitySourceForRange(from, to, granularity)} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)} ` +
    `AND ${DATE_YYYYMMDD} >= ${escapeLiteral(isoToYyyymmdd(from))} ` +
    `AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(to))} ` +
    `AND machine = ${escapeLiteral(machine)} ` +
    `AND ${itemcodePredicate(recipe)} ` +
    `AND kpi_name IN (${names}) ` +
    `GROUP BY machine, itemcode, product_type, kpi_name`
  );
}

/** Back-compat alias — the summary reads the same capability rows. */
export const spcSummaryRowsQuery = spcCapabilityRowsQuery;
export const spcWidgetsRowsQuery = spcCapabilityRowsQuery;

/**
 * The four metric rows of ONE combo (machine × recipe × parameter).
 */
export function spcDetailRowsQuery({ snapshot, granularity, machine, recipe, parameter }) {
  const names = METRICS.map((m) => escapeLiteral(`${parameter} ${m}`)).join(", ");
  return (
    `SELECT machine, itemcode, product_type, kpi_name, status, actual_value, unit_of_measurement ` +
    `FROM ${qualitySourceForDate(snapshot, granularity)} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))} ` +
    `AND machine = ${escapeLiteral(machine)} ` +
    `AND ${itemcodePredicate(recipe)} ` +
    `AND kpi_name IN (${names})`
  );
}

/** Daily history for one capability metric of one machine/recipe/parameter. */
export function spcCapabilityTrendQuery({
  from,
  to,
  granularity,
  machine,
  recipe,
  parameter,
  metric,
}) {
  return (
    `SELECT date, actual_value, status ` +
    `FROM ${qualitySourceForRange(from, to, granularity)} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)} ` +
    `AND ${DATE_YYYYMMDD} >= ${escapeLiteral(isoToYyyymmdd(from))} ` +
    `AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(to))} ` +
    `AND machine = ${escapeLiteral(machine)} ` +
    `AND ${itemcodePredicate(recipe)} ` +
    `AND kpi_name = ${escapeLiteral(`${parameter} ${metric}`)} ` +
    `ORDER BY date`
  );
}

/**
 * Control limits (Mapping sheet, Step 3).
 *
 * Baseline rows are written periodically, so an exact date match usually
 * returns nothing — this pulls every baseline for the machines in scope and
 * lets the caller pick the newest one on or before the chart date. Selecting
 * in JS rather than SQL keeps it portable across alasql (no QUALIFY / window
 * functions) and lets the caller fall back honestly when the only baseline
 * post-dates the chart.
 *
 * No itemcode filter: baseline rows are per machine + parameter.
 */
export function spcLimitsQuery({ machine, parameter } = {}) {
  const mc = machine ? ` AND machine = ${escapeLiteral(machine)}` : "";
  const pc = parameter
    ? ` AND kpi_name IN (${LIMITS.map((l) => escapeLiteral(`${parameter} ${l}`)).join(", ")})`
    : ` AND (${LIMITS.map((l) => `kpi_name LIKE ${escapeLiteral(`% ${l}`)}`).join(" OR ")})`;
  return (
    `SELECT machine, kpi_name, actual_value, date AS baseline_date ` +
    `FROM ${qualitySource()} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(GRAN_BASELINE)}${mc}${pc}`
  );
}

/** Distinct filter option lists for a snapshot (§3). Sentinels are null already. */
export function spcMachinesQuery({ snapshot, granularity }) {
  return (
    `SELECT DISTINCT machine FROM ${qualitySourceForDate(snapshot, granularity)} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))} ` +
    `AND machine IS NOT NULL ORDER BY machine`
  );
}
export function spcRecipesQuery({ snapshot, granularity, machine }) {
  const mc = machine ? ` AND machine = ${escapeLiteral(machine)}` : "";
  return (
    `SELECT DISTINCT itemcode FROM ${qualitySourceForDate(snapshot, granularity)} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))}${mc} ` +
    `AND itemcode IS NOT NULL ORDER BY itemcode`
  );
}
export function spcProductTypesQuery({ snapshot, granularity }) {
  return (
    `SELECT DISTINCT product_type FROM ${qualitySourceForDate(snapshot, granularity)} ` +
    `WHERE ${spcScope()} AND ${granularityPredicate(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))} ` +
    `AND product_type IS NOT NULL ORDER BY product_type`
  );
}
