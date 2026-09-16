/**
 * Live DB-backed implementation of the Engineering `runQuery(sql)` boundary.
 *
 * Keep the exported function name identical to excelSource.js. The
 * Engineering controllers import only from datasource/index.js, so
 * switching from the local workbook to the live gold table is just a
 * source selection change (ENGINEERING_DATA_SOURCE=db).
 *
 * TODO: the real Engineering gold table naming/schema on the upstream
 * Lambda has not been confirmed yet — this stub is unverified until a real
 * `gold.gold` (or equivalent) table carrying department='Engineering' rows
 * is reachable and `ENGINEERING_SQL_TABLE` is pointed at it. Only "excel"
 * mode has been exercised end-to-end.
 */
export { runQuery } from "../../utils/upstream.js";
