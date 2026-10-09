/**
 * Live DB-backed implementation of the Engineering `runQuery(sql)` boundary.
 *
 * Keep the exported function name identical to excelSource.js. The
 * Engineering controllers import only from datasource/index.js, so
 * switching from the local workbook to the live gold table is just a
 * source selection change (ENGINEERING_DATA_SOURCE=db).
 *
 * Confirmed against the live table: `gold.gold` carries
 * department='Engineering', category='Reliability', plant='BTP' rows for all
 * 40 Reliability kpi_names at both DAY and MONTH grain, and every drill level
 * of every KPI family resolves through it (re-verified 2026-09-17). This is
 * the default source; `excel` is the local escape hatch.
 */
export { runQuery } from "../../utils/upstream.js";
