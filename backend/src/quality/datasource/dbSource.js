/**
 * Live DB-backed implementation of the Quality `runQuery(sql)` boundary.
 *
 * Keep the exported function name identical to excelSource.js. The Quality
 * controllers import only from datasource/index.js, so switching from the
 * local workbook to the live gold table is just a source selection change.
 */
export { runQuery } from "../../utils/upstream.js";
