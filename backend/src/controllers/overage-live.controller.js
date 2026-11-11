import {
  OVERAGE_SECTIONS,
  overageSummaryQuery,
  overageItemsQuery,
  overageBarcodesQuery,
} from "../queries/overage-live.js";
import { cached, cacheGet, cacheSet, buildCacheKey } from "../utils/cache.js";
import { runQuery, UpstreamError } from "../utils/upstream.js";
import { normalizePlantId } from "../utils/normalize.js";

const TTL = 5 * 60_000;
const SOURCE_FAILURE_KEY = "overage-live:v3:source-failure";
const conflictKey = (section) =>
  buildCacheKey("overage-live:v3:classification-failure", { section });
const conflictMessage = (section) =>
  `Overage classification conflict in ${section}: a barcode maps to multiple product types. Master-data correction is required; totals are not shown.`;
const NUMERIC_FIELDS = new Set([
  "section_order",
  "product_order",
  "overage_qty",
  "assumed_qty",
  "barcodes",
  "max_aging_hours",
  "max_hours_over_limit",
  "age_hours",
  "hours_over_limit",
]);
const TIMESTAMP_FIELDS = new Set([
  "produced_at",
  "oldest_produced_at",
  "expired_at",
  "as_of",
]);

/** Athena's selected timestamps are IST wall-clock, never browser-local time. */
function istTimestamp(value) {
  if (!value) return null;
  return (
    String(value)
      .replace(" ", "T")
      .replace(/(\.\d{3})\d+$/, "$1") + "+05:30"
  );
}

/** Type normalization only; metrics and totals are computed exclusively in SQL. */
function normalizeRow({ classification_conflict: _conflict, ...row }) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (NUMERIC_FIELDS.has(key)) {
        if (value === null || value === undefined || value === "")
          return [key, null];
        const number = Number(value);
        if (!Number.isFinite(number))
          throw new UpstreamError(`Invalid overage numeric field: ${key}`);
        return [key, number];
      }
      if (TIMESTAMP_FIELDS.has(key)) return [key, istTimestamp(value)];
      return [key, value === "" ? null : value];
    }),
  );
}

function text(query, key, required = false) {
  const value = query[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${key} must be a non-empty string`);
  return value;
}
function integer(query, key, fallback, max) {
  const value = query[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value))
    throw new TypeError(`${key} must be an integer`);
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    number < (key === "limit" ? 1 : 0) ||
    number > max
  )
    throw new TypeError(`${key} is out of range`);
  return number;
}
function scopeFromRequest(req, kind) {
  if (normalizePlantId(req.params.plantId) !== "banmore")
    throw new TypeError("Live overage is supported only for Banmore");
  const scope = {};
  const section = text(req.query, "section", kind !== "summary");
  if (section !== undefined) {
    if (!OVERAGE_SECTIONS.includes(section))
      throw new TypeError("Unsupported overage section");
    scope.section = section;
  }
  if (kind !== "summary") {
    scope.productType = text(req.query, "product_type", kind === "barcodes");
    scope.limit = integer(req.query, "limit", 100, 200);
    scope.offset = integer(req.query, "offset", 0, 100000);
  }
  if (kind === "barcodes") {
    scope.itemCode = text(req.query, "item_code", true);
    // Level 1 is item × unit: retaining its unit in Level 2 reconciles totals.
    scope.unit = text(req.query, "unit");
  }
  if (req.query.refresh !== undefined && req.query.refresh !== "1")
    throw new TypeError("refresh must be 1");
  return scope;
}

const BUILDERS = {
  summary: () => overageSummaryQuery(),
  items: overageItemsQuery,
  barcodes: overageBarcodesQuery,
};
function handler(kind) {
  return async (req, res, next) => {
    let scope, sql;
    try {
      scope = scopeFromRequest(req, kind);
      sql = BUILDERS[kind](scope); // validate even on cache hits
    } catch (error) {
      if (!(error instanceof TypeError)) return next(error);
      return res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: error.message } });
    }
    try {
      if (kind !== "summary") {
        const conflict = await cacheGet(conflictKey(scope.section));
        if (conflict)
          throw new UpstreamError(conflict, {
            type: "OVERAGE_CLASSIFICATION_CONFLICT",
            status: 503,
          });
      }
      const failure = await cacheGet(SOURCE_FAILURE_KEY);
      if (failure)
        throw new UpstreamError(failure, {
          type: "OVERAGE_SOURCE_UNAVAILABLE",
          status: 503,
        });
      // All six tiny summaries share ONE query/cache, including scoped consumers.
      // Only the already-aggregated display rows are filtered after this cache.
      const key = buildCacheKey(
        `/overage-live/v3/${kind}`,
        kind === "summary" ? {} : scope,
      );
      if (req.query.refresh === "1") {
        const gate = `${key}:refresh-guard`;
        if (!(await cacheGet(gate))) {
          await cacheSet(gate, true, 15_000);
          await cacheSet(key, null, 1);
        }
      }
      const data = await cached(
        key,
        async () => {
          const startedAt = new Date().toISOString();
          const raw = await runQuery(sql, { engine: "athena", tables: [] });
          if (kind === "summary" && !raw.some((row) => row.kind === "total"))
            throw new UpstreamError(
              "Overage query returned no section total; a zero snapshot cannot be inferred.",
            );
          const badSections = [
            ...new Set(
              raw
                .filter((row) => Number(row.classification_conflict) === 1)
                .map((row) => row.dashboard_section ?? scope.section),
            ),
          ];
          if (kind !== "summary" && badSections.length)
            throw new UpstreamError(conflictMessage(scope.section), {
              type: "OVERAGE_CLASSIFICATION_CONFLICT",
              status: 503,
            });
          // Fail only conflicting sections, never all six or an invented subtotal.
          for (const section of badSections)
            await cacheSet(
              conflictKey(section),
              conflictMessage(section),
              60_000,
            );
          const rows = raw
            .filter((row) => !badSections.includes(row.dashboard_section))
            .map(normalizeRow);
          const metadata = {
            as_of: istTimestamp(raw[0]?.as_of) ?? startedAt,
            timezone: "Asia/Kolkata",
            lookback_hours: 720,
          };
          if (kind === "summary")
            return {
              ...metadata,
              totals: rows.filter((row) => row.kind === "total"),
              products: rows.filter((row) => row.kind === "product"),
              unavailable_sections: badSections.map((section) => ({
                dashboard_section: section,
                code: "OVERAGE_CLASSIFICATION_CONFLICT",
                message: conflictMessage(section),
              })),
            };
          return {
            ...metadata,
            rows: rows.slice(0, scope.limit),
            limit: scope.limit,
            offset: scope.offset,
            has_more: rows.length > scope.limit,
          };
        },
        TTL,
      );
      if (kind === "summary" && scope.section) {
        const conflict = data.unavailable_sections.find(
          (row) => row.dashboard_section === scope.section,
        );
        if (conflict)
          throw new UpstreamError(conflict.message, {
            type: conflict.code,
            status: 503,
          });
        const totals = data.totals.filter(
          (row) => row.dashboard_section === scope.section,
        );
        if (!totals.length)
          throw new UpstreamError(
            "Overage batch returned no total for the requested section.",
          );
        return res.json({
          data: {
            ...data,
            totals,
            products: data.products.filter(
              (row) => row.dashboard_section === scope.section,
            ),
            unavailable_sections: [],
          },
        });
      }
      res.json({ data });
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        error.type === "OVERAGE_CLASSIFICATION_CONFLICT" &&
        scope.section
      )
        await cacheSet(conflictKey(scope.section), error.message, 60_000);
      if (
        error instanceof UpstreamError &&
        /TABLE_NOT_FOUND|COLUMN_NOT_FOUND|ACCESS_DENIED|AccessDenied|not authorized/i.test(
          error.message,
        )
      ) {
        const message =
          "Live overage Silver sources are unavailable. Required: fct_o_production, dim_bom, dim_tblitemmaster, dim_tblunitmaster and dim_tblmaterialcategorymaster. No Gold fallback is used.";
        await cacheSet(SOURCE_FAILURE_KEY, message, 60_000);
        return next(
          new UpstreamError(message, {
            type: "OVERAGE_SOURCE_UNAVAILABLE",
            status: 503,
          }),
        );
      }
      next(error);
    }
  };
}

// Additive routes: preserve the legacy /overage response for existing consumers.
export const getLiveOverageSummary = handler("summary");
export const getLiveOverageItems = handler("items");
export const getLiveOverageBarcodes = handler("barcodes");
