import { config } from "../../config.js";
import {
  freshCutoffKey,
  resolveGoldSource,
} from "../../queries/gold-source.js";
import { UpstreamError } from "../../utils/upstream.js";

const invalidPeriod = () => {
  throw new UpstreamError(
    "Engineering requires valid ISO dates and an ordered date range.",
    {
      type: "VALIDATION_ERROR",
      status: 400,
    },
  );
};

// The shared source resolver interpolates normalized date keys in its branch predicates.
// Validate here rather than passing arbitrary request text into those SQL fragments.
function dateKey(value) {
  if (value == null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    invalidPeriod();
  return value.replaceAll("-", "");
}

/** Cache identity follows the actual source configuration and IST window, including Redis across deploys. */
export function engineeringSourceCacheScope() {
  const excel = config.engineering.dataSource === "excel";
  return {
    mode: config.engineering.dataSource,
    base: config.engineering.sqlTable,
    daily: excel ? null : config.engineering.dailySqlTable,
    cutoff: excel ? null : freshCutoffKey(),
  };
}

/** Engineering's thin adapter over the existing Production/Quality fresh/history policy. */
export function engineeringGoldSource({ date, from, to, granularity } = {}) {
  const window = Boolean(from && to);
  const fromKey = dateKey(window ? from : date);
  const toKey = dateKey(window ? to : date);
  if (fromKey && toKey && fromKey > toKey) invalidPeriod();
  if (config.engineering.dataSource === "excel")
    return config.engineering.sqlTable;
  return resolveGoldSource({
    baseTable: config.engineering.sqlTable,
    dailyTable: config.engineering.dailySqlTable,
    fromKey,
    toKey,
    granularity,
  });
}
