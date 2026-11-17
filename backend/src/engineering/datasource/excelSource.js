/**
 * Excel-backed implementation of the Engineering `runQuery(sql)` boundary.
 *
 * Mirrors quality/datasource/excelSource.js exactly: loads the reference
 * workbook once, registers it as an in-memory alasql table, and executes the
 * query builders' single-table Excel variant (no rolling daily/history union).
 */
import alasql from "alasql";

import { config } from "../../config.js";
import { loadEngineeringRows } from "./loadExcel.js";

let ready = false;
const LOCAL_TABLE = "engineering_gold";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localizeTableName(sql) {
  const configured = config.engineering.sqlTable;
  if (!configured || configured === LOCAL_TABLE) return sql;
  const tableRef = escapeRegExp(configured);
  return sql.replace(
    new RegExp(`\\b(FROM|JOIN)\\s+${tableRef}\\b`, "gi"),
    `$1 ${LOCAL_TABLE}`,
  );
}

/** Load rows and register the alasql table exactly once per process. */
function ensureTable() {
  if (ready) return;
  const rows = loadEngineeringRows();
  alasql(`CREATE TABLE IF NOT EXISTS ${LOCAL_TABLE}`);
  alasql.tables[LOCAL_TABLE].data = rows;
  ready = true;
}

/**
 * Run one read query against the in-memory Engineering gold table.
 * Mirrors upstream.runQuery: SELECT/WITH only, returns row-objects.
 *
 * @param {string} sql
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function runQuery(sql) {
  if (typeof sql !== "string" || !/^\s*(SELECT|WITH)\b/i.test(sql)) {
    throw new Error("Only SELECT / WITH queries are allowed.");
  }
  ensureTable();
  return alasql(localizeTableName(sql));
}

/** Test/ops hook: force a reload on next query (e.g. after cache rebuild). */
export function _reset() {
  ready = false;
}
