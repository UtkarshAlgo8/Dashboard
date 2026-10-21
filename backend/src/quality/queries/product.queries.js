/**
 * SQL builders for the Quality Product tab's live cards.
 *
 * Uniformity uses BANMORE / Quality / Uniformity Testing; Paint Weight uses
 * BANMORE / Production / Final Finish / Process Audit. Queries use the shared
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
  "Paint_Wt_Within3_Pct_overall",
];

const PAINT_WEIGHT_KPIS = new Set([
  "Paint_Wt_Within1_Pct_overall",
  "Paint_Wt_Within2_Pct_overall",
  "Paint_Wt_Within3_Pct_overall",
  "Paint_Wt_Tyre_Qty_sku",
  "Paint_Wt_Spec_Kg_sku",
  "Paint_Wt_Avg_Kg_sku",
  "Paint_Wt_Dev_Kg_sku",
  "Paint_Wt_Within1_Pct_sku",
  "Paint_Wt_Within2_Pct_sku",
  "Paint_Wt_Within3_Pct_sku",
]);

// This allow-list prevents the generic child endpoint from becoming a way to
// browse arbitrary Quality rows. The descendants are the canonical gold
// drill_down_attribute values for the Product card set.
const PRODUCT_DRILL_KPIS = new Set([
  ...PRODUCT_CARD_KPIS,
  ...PAINT_WEIGHT_KPIS,
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

// Paint Weight is published under Production, even though its card belongs
// on Quality's Product screen. Keep each KPI family in its factual scope.
function scopedKpiPredicate(kpiNames) {
  const uniformity = kpiNames.filter((name) => !PAINT_WEIGHT_KPIS.has(name));
  const paint = kpiNames.filter((name) => PAINT_WEIGHT_KPIS.has(name));
  const scopes = [];
  if (uniformity.length) {
    scopes.push(
      `(${productScopePredicate()} AND kpi_name IN (${uniformity.map(escapeLiteral).join(", ")}))`,
    );
  }
  if (paint.length) {
    scopes.push(
      `(LOWER(department) = 'production' AND UPPER(plant) = 'BANMORE' ` +
        `AND section = 'Final Finish' AND category = 'Process Audit' ` +
        `AND kpi_name IN (${paint.map(escapeLiteral).join(", ")}))`,
    );
  }
  return scopes.length ? `(${scopes.join(" OR ")})` : "1 = 0";
}

export function productSummaryQuery({ date, granularity }) {
  return (
    `SELECT ${SELECT_COLS} FROM ${qualitySourceForDate(date, granularity)} ` +
    `WHERE ${scopedKpiPredicate(PRODUCT_CARD_KPIS)} ` +
    `AND ${granularityAllowListPredicate()} ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(date))}`
  );
}

/**
 * Fetch one table level. `kpiNames` must have been checked by the controller.
 * Rows remain unaggregated, preserving SKU identity for Paint Weight and
 * machine/drill metadata for Uniformity.
 */
export function productChildrenQuery({ kpiNames, date, granularity }) {
  return (
    `SELECT itemcode, ${SELECT_COLS} FROM ${qualitySourceForDate(date, granularity)} ` +
    `WHERE ${scopedKpiPredicate(kpiNames)} ` +
    `AND ${granularityAllowListPredicate()} ` +
    `AND granularity = ${escapeLiteral(granularity)} ` +
    `AND ${DATE_YYYYMMDD} = ${escapeLiteral(isoToYyyymmdd(date))} ` +
    "ORDER BY kpi_name ASC, machine ASC"
  );
}
