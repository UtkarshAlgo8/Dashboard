/**
 * Live DB-backed implementation of the Engineering `runQuery(sql)` boundary.
 *
 * Keep the exported function name identical to excelSource.js. The
 * Engineering controllers import only from datasource/index.js, so
 * switching from the local workbook to the live gold table is just a
 * source selection change (ENGINEERING_DATA_SOURCE=db).
 *
 * Engineering SQL uses the shared fresh/history policy: current/recent DAY
 * reads come from the configured daily table; older dates and MONTH snapshots
 * remain on the full-history table. Both retain the Engineering/Reliability/BTP
 * scope. `excel` remains an explicit local escape hatch, never a fallback.
 */
export { runQuery } from "../../utils/upstream.js";
