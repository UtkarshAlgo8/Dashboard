/**
 * SQL builders for the Quality SPC module (Backend FRD §2–§4). Pure functions.
 *
 * SPC scope (§0.1): department='Quality', category='SPC', plant='BANMORE'
 * (the SPC family label — filtering SPC on BTP returns nothing). All SPC rows
 * are granularity='Real-time'; time selection resolves to the latest snapshot
 * ≤ the requested date (§2.1), which is a separate MAX(date) query.
 */
import { config } from "../../config.js";
import {
  escapeLiteral,
  departmentPredicate,
  DATE_YYYYMMDD,
  isoToYyyymmdd,
} from "../normalize.js";

const TABLE = () => config.quality.sqlTable;

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

/**
 * Resolve the snapshot: the latest SPC date ≤ the requested date (§2.1).
 * With no date, the most recent snapshot overall. One row: { snapshot_date }.
 */
export function spcSnapshotQuery(date) {
  const upTo = date
    ? ` AND ${DATE_YYYYMMDD} <= ${escapeLiteral(isoToYyyymmdd(date))}`
    : "";
  // DISTINCT + ORDER BY DESC LIMIT 1 rather than MAX(date): `date` collides
  // with alasql's DATE keyword and MAX over date strings misbehaves; this form
  // is robust on both alasql and the upstream engine.
  return (
    `SELECT DISTINCT date AS snapshot_date FROM ${TABLE()} ` +
    `WHERE ${spcScope()}${upTo} ORDER BY date DESC LIMIT 1`
  );
}

/**
 * Lean rows for the landing summary (§2.2): status only, no plot_data (which
 * is large and unneeded for the headline counts). Optional machine filter.
 */
export function spcSummaryRowsQuery({ snapshot, machine }) {
  const mc = machine ? ` AND machine = ${escapeLiteral(machine)}` : "";
  return (
    `SELECT machine, itemcode, kpi_name, status FROM ${TABLE()} ` +
    `WHERE ${spcScope()} AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))}${mc}`
  );
}

/** Distinct filter option lists for a snapshot (§3). Sentinels are null already. */
export function spcMachinesQuery({ snapshot }) {
  return (
    `SELECT DISTINCT machine FROM ${TABLE()} ` +
    `WHERE ${spcScope()} AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))} ` +
    `AND machine IS NOT NULL ORDER BY machine`
  );
}
export function spcRecipesQuery({ snapshot }) {
  return (
    `SELECT DISTINCT itemcode FROM ${TABLE()} ` +
    `WHERE ${spcScope()} AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))} ` +
    `AND itemcode IS NOT NULL ORDER BY itemcode`
  );
}
export function spcProductTypesQuery({ snapshot }) {
  return (
    `SELECT DISTINCT product_type FROM ${TABLE()} ` +
    `WHERE ${spcScope()} AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))} ` +
    `AND product_type IS NOT NULL ORDER BY product_type`
  );
}

/**
 * Full rows (with plot_data) for the widget board (§3/§4). Conjunctive
 * machine + recipe filters narrow the combo set (117 → 13 in the FRD).
 */
export function spcWidgetsRowsQuery({ snapshot, machine, recipe }) {
  const mc = machine ? ` AND machine = ${escapeLiteral(machine)}` : "";
  const rc = recipe ? ` AND ${itemcodePredicate(recipe)}` : "";
  return (
    `SELECT machine, itemcode, kpi_name, status, actual_value ` +
    `FROM ${TABLE()} ` +
    `WHERE ${spcScope()} AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))}${mc}${rc}`
  );
}

/**
 * The 4 metric rows of ONE combo (§4/§5): machine × recipe × parameter.
 * kpi_name is the parameter plus each metric suffix.
 */
export function spcDetailRowsQuery({ snapshot, machine, recipe, parameter }) {
  const names = ["Cp", "Cpk", "Pp", "Ppk"]
    .map((m) => escapeLiteral(`${parameter} ${m}`))
    .join(", ");
  return (
    `SELECT machine, itemcode, kpi_name, status, actual_value, unit_of_measurement, plot_data ` +
    `FROM ${TABLE()} ` +
    `WHERE ${spcScope()} AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(snapshot))} ` +
    `AND machine = ${escapeLiteral(machine)} ` +
    `AND ${itemcodePredicate(recipe)} ` +
    `AND kpi_name IN (${names})`
  );
}
