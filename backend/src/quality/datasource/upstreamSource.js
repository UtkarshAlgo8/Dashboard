/**
 * Upstream-backed implementation of the Quality `runQuery(sql)` boundary.
 *
 * This is the "db" side of the FRD's data-source switch. When the Quality
 * gold table ships to the same remote data API Production already uses,
 * flipping QUALITY_DATA_SOURCE=upstream routes the identical SQL there —
 * no query, transformer, or controller changes.
 *
 * Production's upstream client already holds the single API key and speaks
 * the wire protocol, so we delegate to it rather than duplicating that
 * logic. The only Quality-specific concern is the FROM target, which the
 * query builders already read from `config.quality.sqlTable`.
 */
export { runQuery } from "../../utils/upstream.js";
