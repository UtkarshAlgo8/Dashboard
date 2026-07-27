/**
 * Upstream-backed implementation of the Quality `runQuery(sql)` boundary.
 *
 * Backward-compatible alias for dbSource.js. Prefer
 * QUALITY_DATA_SOURCE=db for new environments.
 *
 * Production's upstream client already holds the single API key and speaks
 * the wire protocol, so we delegate to it rather than duplicating that
 * logic. The only Quality-specific concern is the FROM target, which the
 * query builders already read from `config.quality.sqlTable`.
 */
export { runQuery } from "../../utils/upstream.js";
