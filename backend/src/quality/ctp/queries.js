/**
 * SQL builders for the CTP Quality Process tab. Pure functions.
 *
 * Every builder reads gold.ctp_gold directly (a typed DATE column, no
 * duplicate rows), selects only the columns the transformer needs, and
 * filters on plant + product_type + tyre_type + granularity first so Athena
 * scans as little as it can. All values go through `escapeLiteral`.
 */
import { escapeLiteral } from "../normalize.js";
import {
  CARD_KPIS,
  CTP_PROCESS_PRODUCT_TYPE,
  CTP_QUALITY_PLANT,
  CTP_QUALITY_TABLE,
  DRILL_KPIS,
} from "./registry.js";

const SELECT_COLS =
  "CAST(date AS VARCHAR) AS date, kpi_name, section, sub_section, machine, " +
  "remarks, actual_value";

const list = (values) => values.map(escapeLiteral).join(", ");
const dateLiteral = (iso) => `DATE ${escapeLiteral(iso)}`;

function scope({ goldTyreType, goldGranularity }) {
  return (
    `UPPER(plant) = ${escapeLiteral(CTP_QUALITY_PLANT)} ` +
    `AND product_type = ${escapeLiteral(CTP_PROCESS_PRODUCT_TYPE)} ` +
    `AND tyre_type = ${escapeLiteral(goldTyreType)} ` +
    `AND granularity = ${escapeLiteral(goldGranularity)}`
  );
}

/**
 * One round-trip for the whole Process tab: the landing cards over the
 * sparkline window, plus every drill KPI for the selected period.
 */
export function processSummaryQuery({
  goldTyreType,
  goldGranularity,
  anchor,
  sparkFrom,
}) {
  return (
    `SELECT ${SELECT_COLS} FROM ${CTP_QUALITY_TABLE} ` +
    `WHERE ${scope({ goldTyreType, goldGranularity })} ` +
    `AND ((kpi_name IN (${list(Object.values(CARD_KPIS))}) ` +
    `AND date BETWEEN ${dateLiteral(sparkFrom)} AND ${dateLiteral(anchor)}) ` +
    `OR (kpi_name IN (${list(DRILL_KPIS)}) ` +
    `AND date = ${dateLiteral(anchor)}))`
  );
}

/** One landing KPI over a date range, for the trend pop-up. */
export function processTrendQuery({
  kpiName,
  goldTyreType,
  goldGranularity,
  from,
  to,
}) {
  return (
    `SELECT CAST(date AS VARCHAR) AS date, actual_value FROM ${CTP_QUALITY_TABLE} ` +
    `WHERE ${scope({ goldTyreType, goldGranularity })} ` +
    `AND kpi_name = ${escapeLiteral(kpiName)} ` +
    `AND date BETWEEN ${dateLiteral(from)} AND ${dateLiteral(to)} ` +
    `ORDER BY date`
  );
}

/** Newest audit day in the Process Audit gold (the header's "as of"). */
export function processAsOfQuery() {
  return (
    `SELECT CAST(MAX(date) AS VARCHAR) AS as_of FROM ${CTP_QUALITY_TABLE} ` +
    `WHERE UPPER(plant) = ${escapeLiteral(CTP_QUALITY_PLANT)} ` +
    `AND product_type = ${escapeLiteral(CTP_PROCESS_PRODUCT_TYPE)} ` +
    `AND granularity = 'DAY' ` +
    `AND kpi_name = ${escapeLiteral(CARD_KPIS.audit)}`
  );
}
