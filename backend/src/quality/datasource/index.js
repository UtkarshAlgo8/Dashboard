/**
 * The Quality data-source switch (FRD §A/§B).
 *
 * ONE place decides where Quality SQL runs. Every Quality controller calls
 * `runQuery(sql)` from here and knows nothing about excel vs db. Flip
 * `QUALITY_DATA_SOURCE` in the environment to change the backing store:
 *
 *   excel     → in-process alasql over the reference workbook (default)
 *   upstream  → the same remote data API Production uses
 *
 * The SQL is identical across both; only the executor changes.
 */
import { config } from "../../config.js";
import { runQuery as excelRunQuery } from "./excelSource.js";
import { runQuery as upstreamRunQuery } from "./upstreamSource.js";

const SOURCES = {
  excel: excelRunQuery,
  upstream: upstreamRunQuery,
};

/**
 * Run one read query against the configured Quality data source.
 * @param {string} sql
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export function runQuery(sql) {
  const impl = SOURCES[config.quality.dataSource];
  if (!impl) {
    throw new Error(
      `Unknown QUALITY_DATA_SOURCE "${config.quality.dataSource}". ` +
        `Expected one of: ${Object.keys(SOURCES).join(", ")}.`,
    );
  }
  return impl(sql);
}
