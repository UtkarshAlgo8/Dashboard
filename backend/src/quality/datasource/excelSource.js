/**
 * Excel-backed implementation of the Quality `runQuery(sql)` boundary.
 *
 * Loads the reference workbook once (FRD §B), registers it as an in-memory
 * alasql table, and executes the SAME SQL strings the query builders would
 * send to the real DB. This is the "excel" side of the FRD's data-source
 * switch — swapping to "upstream" changes nothing above this file.
 *
 * The table name is `config.quality.sqlTable` so the query builders' FROM
 * target is identical whether we run locally (alasql) or against the DB.
 */
import alasql from "alasql";

import { config } from "../../config.js";
import { loadQualityRows } from "./loadExcel.js";

let ready = false;
const LOCAL_TABLE = "quality_gold";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localizeTableName(sql) {
  const configured = config.quality.sqlTable;
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
  const rows = loadQualityRows();
  // Register a stable local table. Live sources may use schema-qualified
  // names like gold.gold, which alasql treats as database.table syntax.
  alasql(`CREATE TABLE IF NOT EXISTS ${LOCAL_TABLE}`);
  alasql.tables[LOCAL_TABLE].data = rows;
  ready = true;
}

/**
 * Run one read query against the in-memory Quality gold table.
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
  // alasql is synchronous over in-memory data; wrap to keep the async
  // contract identical to the upstream source.
  return alasql(localizeTableName(sql));
}

/** Test/ops hook: force a reload on next query (e.g. after cache rebuild). */
export function _reset() {
  ready = false;
}
