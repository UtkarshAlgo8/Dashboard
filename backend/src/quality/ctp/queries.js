/**
 * SQL builders for the CTP Quality Process and Product tabs. Pure functions.
 *
 * Every builder reads gold.ctp_gold directly (a typed DATE column, no
 * duplicate rows), selects only the columns the transformer needs, and
 * filters on plant + department + category + tyre_type + granularity first
 * so Athena scans as little as it can. All values go through
 * `escapeLiteral`.
 */
import { escapeLiteral } from "../normalize.js";
import {
  CTP_QUALITY_DEPARTMENT,
  CTP_QUALITY_PLANT,
  CTP_QUALITY_TABLE,
  CTP_QUALITY_TABS,
} from "./registry.js";

const SELECT_COLS =
  "CAST(date AS VARCHAR) AS date, kpi_name, section, sub_section, machine, " +
  "itemcode, remarks, actual_value";

const list = (values) => values.map(escapeLiteral).join(", ");
const dateLiteral = (iso) => `DATE ${escapeLiteral(iso)}`;

function scope({ goldTyreType, goldGranularity, category }) {
  return (
    `UPPER(plant) = ${escapeLiteral(CTP_QUALITY_PLANT)} ` +
    `AND department = ${escapeLiteral(CTP_QUALITY_DEPARTMENT)} ` +
    (category ? `AND category = ${escapeLiteral(category)} ` : "") +
    `AND tyre_type = ${escapeLiteral(goldTyreType)} ` +
    `AND granularity = ${escapeLiteral(goldGranularity)}`
  );
}

/**
 * One round-trip for a whole tab: the landing cards over the sparkline
 * window, plus the card companions and every drill KPI for the selected
 * period.
 *
 * @param {"process"|"product"} tab
 */
export function tabSummaryQuery(
  tab,
  { goldTyreType, goldGranularity, anchor, sparkFrom },
) {
  const def = CTP_QUALITY_TABS[tab];
  const atAnchor = [
    ...Object.values(def.companions).flatMap((c) => Object.values(c)),
    ...def.drills,
  ];
  return (
    `SELECT ${SELECT_COLS} FROM ${CTP_QUALITY_TABLE} ` +
    `WHERE ${scope({ goldTyreType, goldGranularity, category: def.category })} ` +
    `AND ((kpi_name IN (${list(Object.values(def.cards))}) ` +
    `AND date BETWEEN ${dateLiteral(sparkFrom)} AND ${dateLiteral(anchor)}) ` +
    `OR (kpi_name IN (${list(atAnchor)}) ` +
    `AND date = ${dateLiteral(anchor)}))`
  );
}

/** One landing KPI over a date range, for the trend pop-up. */
export function trendQuery({
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
