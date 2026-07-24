/**
 * SQL builders for the Quality Process tab (Backend FRD §1). Pure functions.
 *
 * These emit the SAME SQL whether it runs against the local alasql table or
 * the remote DB — the FROM target and every predicate come from the shared
 * normalize layer, so nothing here changes when the data-source switch flips.
 *
 * String concatenation (not bind params) mirrors Production and the upstream
 * contract; every value goes through `escapeLiteral`.
 */
import { config } from "../../config.js";
import {
  escapeLiteral,
  processScopePredicate,
  granularityAllowListPredicate,
} from "../normalize.js";

const TABLE = () => config.quality.sqlTable;

// Columns every Process response needs. drill_down_attribute is selected raw
// and parsed in the transformer (the generalized navigation rule, §1.2).
const SELECT_COLS =
  "date, section, machine, kpi_name, actual_value, unit_of_measurement, " +
  "threshold_value, status, drill_down_attribute";

/** Optional `section = '...'` / `machine = '...'` fragment (drill context). */
function scopeFragment({ section, machine } = {}) {
  const parts = [];
  if (section) parts.push(`section = ${escapeLiteral(section)}`);
  if (machine) parts.push(`machine = ${escapeLiteral(machine)}`);
  return parts.length ? " AND " + parts.join(" AND ") : "";
}

/**
 * kpi-value (FRD §1.2 L0): one number for a card. `granularity` is the
 * already-resolved canonical token; `kpi_name` is matched byte-for-byte
 * (§0.7 exact-name registry). section/machine narrow to a drilled level.
 */
export function kpiValueQuery({ kpiName, date, granularity, section, machine }) {
  return (
    `SELECT ${SELECT_COLS} FROM ${TABLE()} ` +
    `WHERE ${processScopePredicate()} ` +
    `AND ${granularityAllowListPredicate()} ` +
    `AND kpi_name = ${escapeLiteral(kpiName)} ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND date = ${escapeLiteral(date)}` +
    scopeFragment({ section, machine })
  );
}

/**
 * kpi-value-batch (FRD §1.4 L0): several overall (_o) bases feeding one card
 * (e.g. the MQV violations family) in a single round-trip.
 */
export function kpiValueBatchQuery({ kpiNames, date, granularity, section, machine }) {
  const list = kpiNames.map(escapeLiteral).join(", ");
  return (
    `SELECT ${SELECT_COLS} FROM ${TABLE()} ` +
    `WHERE ${processScopePredicate()} ` +
    `AND ${granularityAllowListPredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND date = ${escapeLiteral(date)}` +
    scopeFragment({ section, machine })
  );
}

/**
 * kpi-children (FRD §1.2 L1/L2): the next drill level as a table. Batches
 * several bases at one level; the transformer pivots into one row per group.
 * When `section` is present the group dimension is machine (drilling into a
 * section), otherwise it is section.
 */
export function kpiChildrenQuery({ kpiNames, date, granularity, section }) {
  const list = kpiNames.map(escapeLiteral).join(", ");
  return (
    `SELECT ${SELECT_COLS} FROM ${TABLE()} ` +
    `WHERE ${processScopePredicate()} ` +
    `AND ${granularityAllowListPredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND date = ${escapeLiteral(date)}` +
    scopeFragment({ section })
  );
}

/**
 * kpi-history (FRD §1.5): a daily series for a sparkline / trend modal. DAY
 * rows in [from, to]; drilled trends add section (_s) or section+machine (_m).
 * date is ISO so lexicographic BETWEEN is a correct range.
 */
export function kpiHistoryQuery({ kpiName, from, to, granularity, section, machine }) {
  return (
    `SELECT date, actual_value FROM ${TABLE()} ` +
    `WHERE ${processScopePredicate()} ` +
    `AND ${granularityAllowListPredicate()} ` +
    `AND kpi_name = ${escapeLiteral(kpiName)} ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND date >= ${escapeLiteral(from)} AND date <= ${escapeLiteral(to)}` +
    scopeFragment({ section, machine }) +
    ` ORDER BY date ASC`
  );
}
