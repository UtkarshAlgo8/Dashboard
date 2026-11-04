/**
 * SQL builders for the SILVER measurement layer (Gold_to_Silver_Mapping,
 * Steps 4–6). Pure functions — no I/O.
 *
 * The dots on every SPC chart come from here. The lines (control limits) and
 * the capability indices come from GOLD; see spc.queries.js. Keeping the two
 * apart is the point: limits derived from the same points they judge make
 * every window look in control.
 *
 * Window: the LATEST `readings` readings of each combo, whatever their date —
 * not the dashboard's selected date. Gold keeps a capability row for every
 * combo produced in the last ~90 days, while a one-day silver window only
 * covered the recipes that ran that day (2026-10-07: 1,756 of 2,018 cards had
 * Cp/Cpk and no chart). The whole history was too much the other way (24k
 * points, 20 MB, a frozen page), so charts show a fixed recent run. The shift
 * selector still applies, as the shift's clock hours (see shiftHours).
 */
import { escapeLiteral } from "../normalize.js";
import { shiftHours } from "../spc/mapping.js";

/** Latest lookup per full identity: never multiply readings by dimension versions. */
function paintingDimension(table, column) {
  return `(SELECT record_id, plant_code, source_machine, database_name, ${column}, ` +
    `ROW_NUMBER() OVER (PARTITION BY record_id, plant_code, source_machine, database_name ` +
    `ORDER BY _bronze_ingest_ts DESC NULLS LAST, ${column}) AS version_rank ` +
    `FROM ${table} WHERE plant_code = 'BTP')`;
}

/** A named-column view over ID-based PAINTING measurements. No setpoint lookup. */
function measurementRelation(src) {
  if (src.kind !== "painting") return src.table;
  return `(SELECT p.record_id, p.event_time, p.weight, ` +
    `TRIM(w.name) AS machine_name, TRIM(r.description) AS item_code ` +
    `FROM silver.fct_paintingdata p ` +
    `JOIN ${paintingDimension("silver.dim_wcmaster", "name")} w ` +
    `ON p.wc_id = w.record_id AND p.plant_code = w.plant_code ` +
    `AND p.source_machine = w.source_machine AND p.database_name = w.database_name AND w.version_rank = 1 ` +
    `JOIN ${paintingDimension("silver.dim_recipemaster", "description")} r ` +
    `ON p.recipe_id = r.record_id AND p.plant_code = r.plant_code ` +
    `AND p.source_machine = r.source_machine AND p.database_name = r.database_name AND r.version_rank = 1 ` +
    `WHERE p.plant_code = 'BTP' AND p.weight IS NOT NULL ` +
    `AND w.name IS NOT NULL AND TRIM(w.name) <> '' ` +
    `AND r.description IS NOT NULL AND TRIM(r.description) <> '') painting_measurements`;
}

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
 * Step 4 — the latest `readings` individual readings behind ONE chart,
 * returned oldest first.
 *
 * Returns event_time, the measured value, and (where the parameter has one)
 * the setpoint, which Step 6 turns into the target and the spec window.
 * The recipe filter is applied whenever a recipe is given: gold capability is
 * computed per item_code, so a chart that mixes recipes would show a bimodal
 * distribution against a single-recipe Cp.
 *
 * @param {object} src   resolveSilver() result
 * @param {{machine:string, recipe?:string, shift?:string, readings:number}} scope
 */
export function silverPointsQuery(src, { machine, recipe, shift, readings }) {
  const cols = [
    `${src.timeColumn} AS event_time`,
    `${src.valueColumn} AS value`,
  ];
  if (src.setpointColumn) cols.push(`${src.setpointColumn} AS setpoint`);
  if (src.tieBreakColumn) cols.push(`${src.tieBreakColumn} AS reading_id`);
  const tieDesc = src.tieBreakColumn ? `, ${src.tieBreakColumn} DESC` : "";
  const tieAsc = src.tieBreakColumn ? ", reading_id" : "";
  return (
    `SELECT * FROM (` +
    `SELECT ${cols.join(", ")} ` +
    `FROM ${measurementRelation(src)} ` +
    `WHERE ${machinePredicate(src.machineColumn, machine)}` +
    `${recipeClause(src.itemColumn, recipe)}` +
    `${shiftClause(src.timeColumn, shift)} ` +
    `AND ${src.valueColumn} IS NOT NULL ` +
    `ORDER BY ${src.timeColumn} DESC${tieDesc} ` +
    `LIMIT ${Math.max(1, Math.trunc(Number(readings)) || 1)}` +
    `) ORDER BY event_time${tieAsc}`
  );
}

/**
 * Board query — ONE round trip per silver table instead of one per widget.
 *
 * Every parameter of a machine is a column of the SAME measurement row (one
 * tyre = one row), so "5 consecutive rows" is the natural subgroup for all of
 * them at once. Per (machine, recipe) this keeps the latest `readings` rows,
 * groups them into subgroups of `size` oldest-first — the same subgroups the
 * detail chart draws — and returns the last `points` subgroup means, so a
 * card's sparkline is the right-hand end of its detail chart.
 *
 * Partial subgroups are dropped (HAVING count = size), matching Step 5.
 *
 * Only `points` subgroups per combo cross the wire: the upstream Lambda has a
 * response ceiling, and a too-big board comes back as one swallowed "Internal
 * Server Error" that blanks every card. The totals behind the chart ride along
 * as `n_subgroups` and a per-parameter `n_<value column>`, so the card can
 * still report what it is a picture of.
 *
 * @param {object} src            one of SILVER_SOURCES
 * @param {object} params         paramsForSource(src)
 * @param {{machine?:string, recipe?:string, shift?:string, readings:number, size:number, points:number}} scope
 */
export function silverBoardQuery(
  src,
  params,
  { machine, recipe, shift, readings = 1500, size = 5, points = 60 },
) {
  const entries = Object.entries(params);
  const valueCols = entries
    .map(([, p]) => `${p.valueColumn} AS v_${p.valueColumn}`)
    .join(", ");
  const aggCols = entries
    .map(([, p]) => `AVG(v_${p.valueColumn}) AS ${p.valueColumn}`)
    .join(", ");
  const meanCols = entries.map(([, p]) => p.valueColumn).join(", ");
  // Per-parameter subgroup counts over the chart window. A parameter that is
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
  const tieSelect = src.tieBreakColumn ? `${src.tieBreakColumn} AS reading_id, ` : "";
  const tieDesc = src.tieBreakColumn ? `, ${src.tieBreakColumn} DESC` : "";
  const tieAsc = src.tieBreakColumn ? ", reading_id" : "";
  return (
    `WITH r AS (` +
    `SELECT UPPER(${src.machineColumn}) AS machine, ${src.itemColumn} AS recipe, ` +
    `${src.timeColumn} AS event_time, ${valueCols}, ${tieSelect}` +
    `ROW_NUMBER() OVER (PARTITION BY UPPER(${src.machineColumn}), ${src.itemColumn} ` +
    `ORDER BY ${src.timeColumn} DESC${tieDesc}) AS rd ` +
    `FROM ${measurementRelation(src)} ` +
    `WHERE TRUE${machineFilter}${recipeClause(src.itemColumn, recipe)}` +
    `${shiftClause(src.timeColumn, shift)}` +
    `), ` +
    // Latest `readings` rows, renumbered oldest-first so subgroups match the
    // detail chart's.
    `w AS (` +
    `SELECT *, ROW_NUMBER() OVER (PARTITION BY machine, recipe ORDER BY event_time${tieAsc}) AS rn ` +
    `FROM r WHERE rd <= ${readings}` +
    `), ` +
    `g AS (` +
    `SELECT machine, recipe, ${grp} AS subgroup, ` +
    `MAX(event_time) AS event_time, ${aggCols} ` +
    `FROM w GROUP BY machine, recipe, ${grp} ` +
    `HAVING COUNT(*) = ${size}` +
    `), ` +
    `t AS (` +
    `SELECT machine, recipe, subgroup, event_time, ${meanCols}, ` +
    `ROW_NUMBER() OVER (PARTITION BY machine, recipe ORDER BY subgroup DESC) AS rk, ` +
    `COUNT(*) OVER (PARTITION BY machine, recipe) AS n_subgroups, ${countCols} ` +
    `FROM g` +
    `) ` +
    `SELECT machine, recipe, subgroup, event_time, ${meanCols}, ` +
    `n_subgroups, ${nCols} ` +
    `FROM t ` +
    // The newest `points` subgroups: the sparkline ends at the latest reading.
    `WHERE rk <= ${points} ` +
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
    `FROM ${measurementRelation(src)} ` +
    `WHERE TRUE${machineFilter}${recipeClause(src.itemColumn, recipe)}` +
    `${shiftClause(src.timeColumn, shift)} ` +
    `GROUP BY UPPER(${src.machineColumn}), ${src.itemColumn}`
  );
}
