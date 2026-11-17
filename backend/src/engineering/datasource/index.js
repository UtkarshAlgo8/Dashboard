/**
 * The Engineering data-source switch (mirrors quality/datasource/index.js).
 *
 * ONE place decides where Engineering SQL runs. Every Engineering controller
 * calls `runQuery(sql)` from here and knows nothing about excel vs db. Flip
 * `ENGINEERING_DATA_SOURCE` in the environment to change the backing store:
 *
 *   excel → in-process alasql over the reference workbook
 *   db    → the same remote data API Production/Quality use. The query layer
 *           resolves recent DAY rows from the daily table and historical/MONTH
 *           rows from gold.gold using the shared disjoint source policy.
 *
 * Excel queries remain single-table; only DB queries use the daily/history split.
 */
import { config } from "../../config.js";
import { runQuery as excelRunQuery } from "./excelSource.js";
import { runQuery as dbRunQuery } from "./dbSource.js";

const SOURCES = {
  excel: excelRunQuery,
  db: dbRunQuery,
  upstream: dbRunQuery,
};

/**
 * Run one read query against the configured Engineering data source.
 * @param {string} sql
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export function runQuery(sql) {
  const impl = SOURCES[config.engineering.dataSource];
  if (!impl) {
    throw new Error(
      `Unknown ENGINEERING_DATA_SOURCE "${config.engineering.dataSource}". ` +
        `Expected one of: ${Object.keys(SOURCES).join(", ")}.`,
    );
  }
  return impl(sql);
}
