/**
 * SQL builders for the Quality Product tab's Uniformity & Balancing cards.
 *
 * Product data has a distinct gold scope from the Process and SPC families:
 * BANMORE / Quality / Uniformity Testing.  Queries use the shared Quality
 * source resolver so recent DAY/SHIFT requests use gold_daily while historic
 * reads retain gold.gold.
 */
import {
  escapeLiteral,
  departmentPredicate,
  granularityAllowListPredicate,
  DATE_YYYYMMDD,
  isoToYyyymmdd,
} from "../normalize.js";
import { qualitySourceForDate } from "./gold-source.js";

export const PRODUCT_CATEGORY = "Uniformity Testing";
export const PRODUCT_CARD_KPIS = [
  "Overall_Production_Yield",
  "Overall_Uniformity_Production",
  "Mtms_Uniformity_Yield",
  "Tuo_Uniformity_Yield",
  "Zf_Uniformity_Yield",
  "Zf_Balancing_Yield_o",
  "Dbm_Balancing_Yield",
];

// This allow-list prevents the generic child endpoint from becoming a way to
// browse arbitrary Quality rows. The descendants are the canonical gold
// drill_down_attribute values for the Product card set.
const PRODUCT_DRILL_KPIS = new Set([
  ...PRODUCT_CARD_KPIS,
  "Mtms_Uniformity_Yield_m",
  "Tuo_Uniformity_Yield_m",
  "Zf_Uniformity_Yield_m",
  "Mtms_Uniformity_Production",
  "Tuo_Uniformity_Production",
  "Zf_Uniformity_Production",
]);

const SELECT_COLS =
  "date, machine, kpi_name, actual_value, unit_of_measurement, " +
  "threshold_value, status, drill_down_attribute";

/** The Product gold rows consistently use the BANMORE plant label. */
export function productScopePredicate() {
  return (
    `${departmentPredicate()} ` +
    `AND category = ${escapeLiteral(PRODUCT_CATEGORY)} ` +
    `AND UPPER(plant) = 'BANMORE'`
  );
}

export function isAllowedProductDrillKpi(kpiName) {
  return PRODUCT_DRILL_KPIS.has(kpiName);
}

export function productSummaryQuery({ date, granularity }) {
  const list = PRODUCT_CARD_KPIS.map(escapeLiteral).join(", ");
  return (
    `SELECT ${SELECT_COLS} FROM ${qualitySourceForDate(date, granularity)} ` +
    `WHERE ${productScopePredicate()} ` +
    `AND ${granularityAllowListPredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(date))}`
  );
}

/**
 * Fetch one table level. `kpiNames` must have been checked by the controller.
 * Rows remain unaggregated: each machine row is a factual gold row, and the
 * frontend uses drill_down_attribute to decide whether it can navigate again.
 */
export function productChildrenQuery({ kpiNames, date, granularity }) {
  const list = kpiNames.map(escapeLiteral).join(", ");
  return (
    `SELECT ${SELECT_COLS} FROM ${qualitySourceForDate(date, granularity)} ` +
    `WHERE ${productScopePredicate()} ` +
    `AND ${granularityAllowListPredicate()} ` +
    `AND kpi_name IN (${list}) ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(date))} ` +
    "ORDER BY kpi_name ASC, machine ASC"
  );
}
