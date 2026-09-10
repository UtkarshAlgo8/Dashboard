/**
 * SQL builders for the SILVER measurement layer (Gold_to_Silver_Mapping,
 * Steps 4–6). Pure functions — no I/O.
 *
 * The dots on every SPC chart come from here. The lines (control limits) and
 * the capability indices come from GOLD; see spc.queries.js. Keeping the two
 * apart is the point: limits derived from the same points they judge make
 * every window look in control.
 *
 * Cost: silver is partitioned on (year, month, day). Every builder emits an
 * explicit partition predicate so a one-day chart scans one day, not the
 * whole table.
 */
import { escapeLiteral } from "../normalize.js";
import { partitionDays } from "../spc/mapping.js";

/** `(year=2026 AND month=9 AND day=1) OR (...)` — Athena partition pruning. */
function partitionPredicate(from, to) {
  const parts = partitionDays(from, to);
  if (parts.length === 0) return "TRUE";
  return (
    "(" +
    parts
      .map((p) => `(year = ${p.year} AND month = ${p.month} AND day = ${p.day})`)
      .join(" OR ") +
    ")"
  );
}

/** Half-open event_time window. Timestamps are typed in silver. */
function timeWindowPredicate(timeColumn, from, to) {
  return (
    `${timeColumn} >= TIMESTAMP ${escapeLiteral(from)} ` +
    `AND ${timeColumn} < TIMESTAMP ${escapeLiteral(to)}`
  );
}

/**
 * Machine match. Gold ids are upper snake; silver stores them lower or mixed
 * case ("vmi_maxx_01", "QuintuPlex"), so always compare on UPPER().
 */
function machinePredicate(column, machine) {
  return `UPPER(${column}) = ${escapeLiteral(String(machine).toUpperCase())}`;
}

/**
 * Step 4 — the individual readings behind ONE chart.
 *
 * Returns event_time, the measured value, and (where the parameter has one)
 * the setpoint, which Step 6 turns into the target and the spec window.
 * The recipe filter is applied whenever a recipe is given: gold capability is
 * computed per item_code, so a chart that mixes recipes would show a bimodal
 * distribution against a single-recipe Cp.
 *
 * @param {object} src   resolveSilver() result
 * @param {{machine:string, recipe?:string, from:string, to:string}} scope
 */
export function silverPointsQuery(src, { machine, recipe, from, to }) {
  const cols = [
    `${src.timeColumn} AS event_time`,
    `${src.valueColumn} AS value`,
  ];
  if (src.setpointColumn) cols.push(`${src.setpointColumn} AS setpoint`);
  const recipeFilter =
    recipe != null && recipe !== "" && recipe !== "All"
      ? ` AND ${src.itemColumn} = ${escapeLiteral(recipe)}`
      : "";
  return (
    `SELECT ${cols.join(", ")} ` +
    `FROM ${src.table} ` +
    `WHERE ${partitionPredicate(from, to)} ` +
    `AND ${machinePredicate(src.machineColumn, machine)}${recipeFilter} ` +
    `AND ${src.valueColumn} IS NOT NULL ` +
    `AND ${timeWindowPredicate(src.timeColumn, from, to)} ` +
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
 * @param {object} src            one of SILVER_SOURCES
 * @param {object} params         paramsForSource(src)
 * @param {{machine?:string, recipe?:string, from:string, to:string, size:number}} scope
 */
export function silverBoardQuery(src, params, { machine, recipe, from, to, size = 5 }) {
  const entries = Object.entries(params);
  const valueCols = entries
    .map(([, p]) => `${p.valueColumn} AS v_${p.valueColumn}`)
    .join(", ");
  const aggCols = entries
    .map(([, p]) => `AVG(v_${p.valueColumn}) AS ${p.valueColumn}`)
    .join(", ");
  const machineFilter = machine
    ? ` AND ${machinePredicate(src.machineColumn, machine)}`
    : "";
  const recipeFilter =
    recipe != null && recipe !== "" && recipe !== "All"
      ? ` AND ${src.itemColumn} = ${escapeLiteral(recipe)}`
      : "";
  const grp = `CAST((rn - 1) / ${size} AS INTEGER)`;
  return (
    `WITH r AS (` +
    `SELECT UPPER(${src.machineColumn}) AS machine, ${src.itemColumn} AS recipe, ` +
    `${src.timeColumn} AS event_time, ${valueCols}, ` +
    `ROW_NUMBER() OVER (PARTITION BY UPPER(${src.machineColumn}), ${src.itemColumn} ` +
    `ORDER BY ${src.timeColumn}) AS rn ` +
    `FROM ${src.table} ` +
    `WHERE ${partitionPredicate(from, to)}${machineFilter}${recipeFilter} ` +
    `AND ${timeWindowPredicate(src.timeColumn, from, to)}` +
    `) ` +
    `SELECT machine, recipe, ${grp} AS subgroup, ` +
    `MAX(event_time) AS event_time, ${aggCols} ` +
    `FROM r GROUP BY machine, recipe, ${grp} ` +
    `HAVING COUNT(*) = ${size} ` +
    `ORDER BY machine, recipe, subgroup`
  );
}

/**
 * Sample size per (machine, recipe, parameter) for one window — cheap enough
 * to answer "how many readings back this widget?" without pulling points.
 */
export function silverSampleSizeQuery(src, params, { machine, recipe, from, to }) {
  const counts = Object.values(params)
    .map((p) => `COUNT(${p.valueColumn}) AS ${p.valueColumn}`)
    .join(", ");
  const machineFilter = machine
    ? ` AND ${machinePredicate(src.machineColumn, machine)}`
    : "";
  const recipeFilter =
    recipe != null && recipe !== "" && recipe !== "All"
      ? ` AND ${src.itemColumn} = ${escapeLiteral(recipe)}`
      : "";
  return (
    `SELECT UPPER(${src.machineColumn}) AS machine, ${src.itemColumn} AS recipe, ${counts} ` +
    `FROM ${src.table} ` +
    `WHERE ${partitionPredicate(from, to)}${machineFilter}${recipeFilter} ` +
    `AND ${timeWindowPredicate(src.timeColumn, from, to)} ` +
    `GROUP BY UPPER(${src.machineColumn}), ${src.itemColumn}`
  );
}
