import { cached, buildCacheKey } from "../../utils/cache.js";
import { runQuery, UpstreamError } from "../../utils/upstream.js";
import { UNIFORMITY_VERSION, uniformityScope } from "./contract.js";
import { uniformityQuery } from "./queries.js";
import { withUniformitySlot } from "./limiter.js";

/** Detect partial upstream pages instead of presenting capped counts as complete. */
export function uniformityPage(rawRows, scope) {
  if (!Array.isArray(rawRows))
    throw new UpstreamError("Uniformity response is not a row array.", {
      type: "UPSTREAM_SHAPE",
    });
  const total = rawRows.length
    ? Number(rawRows[0]._total)
    : scope.offset === 0
      ? 0
      : null;
  if (
    rawRows.length &&
    (!Number.isSafeInteger(total) ||
      total < 0 ||
      rawRows.some((r) => Number(r._total) !== total))
  )
    throw new UpstreamError("Uniformity response has no consistent total.", {
      type: "UPSTREAM_SHAPE",
    });
  const expected =
    total == null
      ? 0
      : Math.min(scope.limit + 1, Math.max(0, total - scope.offset));
  if (rawRows.length !== expected)
    throw new UpstreamError(
      "Upstream truncated the selected Uniformity page. Narrow the date range and retry.",
      { type: "INCOMPLETE_PAGE" },
    );
  if (rawRows.some((r) => Number(r._duplicates) > 0))
    throw new UpstreamError(
      "Duplicate Gold rows exist for the same Uniformity period and identity; metrics cannot be shown safely.",
      { type: "AMBIGUOUS_GOLD_ROWS" },
    );
  const numberFields = new Set([
    "yield_pct",
    "tyres_tested",
    "failed_tyres",
    "failed_pct",
    "actual_value",
    "is_off_spec",
  ]);
  const rows = rawRows.slice(0, scope.limit).map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, value]) => {
          if (!numberFields.has(k) || value == null) return [k, value];
          const number = Number(value);
          if (value === "" || !Number.isFinite(number))
            throw new UpstreamError("Invalid numeric Uniformity value.", {
              type: "UPSTREAM_SHAPE",
            });
          return [k, number];
        }),
    ),
  );
  return {
    context: scope,
    rows,
    total,
    offset: scope.offset,
    limit: scope.limit,
    has_more: total != null && scope.offset + rows.length < total,
    truncated: false,
  };
}

/** Injectable boundary for route/query-count tests; production uses shared cache/transport. */
export function uniformityHandler(kind, deps = {}) {
  const query = deps.runQuery ?? runQuery;
  const read = deps.cached ?? cached;
  return async (req, res, next) => {
    try {
      const scope = uniformityScope(req.query, kind);
      const key = buildCacheKey("/quality/product/uniformity", {
        version: UNIFORMITY_VERSION,
        // Nested serialization preserves free-text separators in identities.
        // Flattened buildCacheKey fields can collide on literal '&key=' text.
        scope,
      });
      const body = await read(
        key,
        async () =>
          withUniformitySlot(async () =>
            uniformityPage(
              await query(uniformityQuery(scope), {
                engine: "athena",
                tables: [],
              }),
              scope,
            ),
          ),
        kind === "gold" ? 300000 : 60000,
      );
      res.json({ data: body });
    } catch (error) {
      if (error.code && [400, 503].includes(error.status))
        return res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
      next(error);
    }
  };
}
