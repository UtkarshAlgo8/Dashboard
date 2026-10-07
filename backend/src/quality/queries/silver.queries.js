/**
 * SQL builders for the SILVER measurement layer (Gold_to_Silver_Mapping,
 * Steps 4–6). Pure functions — no I/O.
 *
 * The dots on every SPC chart come from here. The lines (control limits) and
 * the capability indices come from GOLD; see spc.queries.js. Keeping the two
 * apart is the point: limits derived from the same points they judge make
 * every window look in control.
 *
 * No date window: the chart dots are the combo's WHOLE silver history, not
 * the dashboard's selected date. Gold keeps a capability row for every combo
 * produced in the last ~90 days, while a one-day silver window only covered
 * the recipes that ran that day — on 2026-10-07 that left 1,756 of 2,018
 * cards with Cp/Cpk and no chart. The shift selector still applies, as the
 * shift's clock hours on every date (see shiftHours).
 */
import { escapeLiteral } from "../normalize.js";
import { shiftHours } from "../spc/mapping.js";

/**
 * Machine match. Gold ids are upper snake; silver stores them lower or mixed
 * case ("vmi_maxx_01", "QuintuPlex"), so always compare on UPPER().
 */
function machinePredicate(column, machine) {
  return `UPPER(${column}) = ${escapeLiteral(String(machine).toUpperCase())}`;
}

/** ` AND item = '<recipe>'`, or "" when no recipe (or "All") is selected. */
function recipeClause(column, recipe) {
  return recipe != null && recipe !== "" && recipe !== "All"
    ? ` AND ${column} = ${escapeLiteral(recipe)}`
    : "";
}

/**
 * ` AND <hour of day inside the shift>`, or "" for All. Shift C wraps
 * midnight (23 → 07), so it is an OR of the two ends of the day.
 */
function shiftClause(timeColumn, shift) {
  const h = shiftHours(shift);
  if (!h) return "";
  const hour = `HOUR(${timeColumn})`;
  return h.from < h.to
    ? ` AND ${hour} >= ${h.from} AND ${hour} < ${h.to}`
    : ` AND (${hour} >= ${h.from} OR ${hour} < ${h.to})`;
}

/**
 * The (year, month) partitions holding one combo's readings, oldest first.
 *
 * A combo's whole history is too big for one upstream response (a 120k-row
 * combo comes back as a bare "Internal Server Error"), so the detail reads it
 * one month at a time; this is the list of months to read. Partition columns
 * only, so it is cheap.
 *
 * @param {object} src   resolveSilver() result
 * @param {{machine:string, recipe?:string, shift?:string}} scope
 */
export function silverMonthsQuery(src, { machine, recipe, shift }) {
  return (
    `SELECT DISTINCT year, month ` +
    `FROM ${src.table} ` +
    `WHERE ${machinePredicate(src.machineColumn, machine)}` +
    `${recipeClause(src.itemColumn, recipe)}` +
    `${shiftClause(src.timeColumn, shift)} ` +
    `AND ${src.valueColumn} IS NOT NULL ` +
    `ORDER BY year, month`
  );
}

/**
 * Step 4 — the individual readings behind ONE chart, for ONE month
 * partition (see silverMonthsQuery for why it is split).
 *
 * Returns event_time, the measured value, and (where the parameter has one)
 * the setpoint, which Step 6 turns into the target and the spec window.
 * The recipe filter is applied whenever a recipe is given: gold capability is
 * computed per item_code, so a chart that mixes recipes would show a bimodal
 * distribution against a single-recipe Cp.
 *
 * @param {object} src   resolveSilver() result
 * @param {{machine:string, recipe?:string, shift?:string, year:number, month:number}} scope
 */
export function silverPointsQuery(src, { machine, recipe, shift, year, month }) {
  const cols = [
    `${src.timeColumn} AS event_time`,
    `${src.valueColumn} AS value`,
  ];
  if (src.setpointColumn) cols.push(`${src.setpointColumn} AS setpoint`);
  return (
    `SELECT ${cols.join(", ")} ` +
    `FROM ${src.table} ` +
    `WHERE year = ${Number(year)} AND month = ${Number(month)} ` +
    `AND ${machinePredicate(src.machineColumn, machine)}` +
    `${recipeClause(src.itemColumn, recipe)}` +
    `${shiftClause(src.timeColumn, shift)} ` +
    `AND ${src.valueColumn} IS NOT NULL ` +
    `ORDER BY ${src.timeColumn}`
  );
}

/**
 * Board query — ONE round trip per silver table instead of one per widget.
 *
 * Every parameter of a machine is a column of the SAME measurement row (one
 * tyre = one row), so "5 consecutive rows" is the natural subgroup for all of
 * them at once. This returns each subgroup's mean per parameter, letting the
 * widget board draw a real subgroup-mean sparkline for ~100 combos from a
 * single scan.
 *
 * Partial subgroups are dropped (HAVING count = size), matching Step 5.
 *
 * Thinning happens HERE, not in Node. A month of subgroups for one silver
 * table is ~10 MB of JSON, over the upstream Lambda's response ceiling, and
 * the whole board came back as one swallowed "Internal Server Error" — every
 * card reading "no silver measurements in the selected window" while the
 * detail chart (one combo, one query) drew fine. `points` subgroups per
 * (machine, recipe) is all a sparkline can show, so only those cross the
 * wire; the untouched totals ride along as `n_subgroups` and a per-parameter
 * `n_<value column>` so the card can still report what it is a picture of.
 *
 * @param {object} src            one of SILVER_SOURCES
 * @param {object} params         paramsForSource(src)
 * @param {{machine?:string, recipe?:string, shift?:string, size:number, points:number}} scope
 */
export function silverBoardQuery(
  src,
  params,
  { machine, recipe, shift, size = 5, points = 60 },
) {
  const entries = Object.entries(params);
  const valueCols = entries
    .map(([, p]) => `${p.valueColumn} AS v_${p.valueColumn}`)
    .join(", ");
  const aggCols = entries
    .map(([, p]) => `AVG(v_${p.valueColumn}) AS ${p.valueColumn}`)
    .join(", ");
  const meanCols = entries.map(([, p]) => p.valueColumn).join(", ");
  // Per-parameter subgroup counts over the WHOLE window. A parameter that is
  // null for a subgroup is not part of that parameter's series, so it cannot
  // share one count with the others.
  const countCols = entries
    .map(
      ([, p]) =>
        `COUNT(${p.valueColumn}) OVER (PARTITION BY machine, recipe) AS n_${p.valueColumn}`,
    )
    .join(", ");
  const nCols = entries.map(([, p]) => `n_${p.valueColumn}`).join(", ");
  const machineFilter = machine
    ? ` AND ${machinePredicate(src.machineColumn, machine)}`
    : "";
  const grp = `CAST((rn - 1) / ${size} AS INTEGER)`;
  return (
    `WITH r AS (` +
    `SELECT UPPER(${src.machineColumn}) AS machine, ${src.itemColumn} AS recipe, ` +
    `${src.timeColumn} AS event_time, ${valueCols}, ` +
    `ROW_NUMBER() OVER (PARTITION BY UPPER(${src.machineColumn}), ${src.itemColumn} ` +
    `ORDER BY ${src.timeColumn}) AS rn ` +
    `FROM ${src.table} ` +
    `WHERE TRUE${machineFilter}${recipeClause(src.itemColumn, recipe)}` +
    `${shiftClause(src.timeColumn, shift)}` +
    `), ` +
    `g AS (` +
    `SELECT machine, recipe, ${grp} AS subgroup, ` +
    `MAX(event_time) AS event_time, ${aggCols} ` +
    `FROM r GROUP BY machine, recipe, ${grp} ` +
    `HAVING COUNT(*) = ${size}` +
    `), ` +
    `t AS (` +
    `SELECT machine, recipe, subgroup, event_time, ${meanCols}, ` +
    `ROW_NUMBER() OVER (PARTITION BY machine, recipe ORDER BY subgroup) AS rn2, ` +
    `COUNT(*) OVER (PARTITION BY machine, recipe) AS n_subgroups, ${countCols} ` +
    `FROM g` +
    `) ` +
    `SELECT machine, recipe, subgroup, event_time, ${meanCols}, ` +
    `n_subgroups, ${nCols} ` +
    `FROM t ` +
    // Even stride, and the last subgroup always kept, so the sparkline still
    // ends where the window does.
    `WHERE (rn2 - 1) % GREATEST(CAST(CEIL(n_subgroups / ${points}.0) AS BIGINT), 1) = 0 ` +
    `OR rn2 = n_subgroups ` +
    `ORDER BY machine, recipe, subgroup`
  );
}

/**
 * Sample size per (machine, recipe, parameter) over the whole history — cheap enough
 * to answer "how many readings back this widget?" without pulling points.
 */
export function silverSampleSizeQuery(src, params, { machine, recipe, shift }) {
  const counts = Object.values(params)
    .map((p) => `COUNT(${p.valueColumn}) AS ${p.valueColumn}`)
    .join(", ");
  const machineFilter = machine
    ? ` AND ${machinePredicate(src.machineColumn, machine)}`
    : "";
  return (
    `SELECT UPPER(${src.machineColumn}) AS machine, ${src.itemColumn} AS recipe, ${counts} ` +
    `FROM ${src.table} ` +
    `WHERE TRUE${machineFilter}${recipeClause(src.itemColumn, recipe)}` +
    `${shiftClause(src.timeColumn, shift)} ` +
    `GROUP BY UPPER(${src.machineColumn}), ${src.itemColumn}`
  );
}
