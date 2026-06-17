import { cached, buildCacheKey } from "../utils/cache.js";
import { config } from "../config.js";
import { runQuery } from "../utils/upstream.js";
import {
  buildFetchQuery,
  QueryValidationError,
} from "../queries/dashboard-query.js";

/**
 * POST /api/v1/dashboard/fetch — universal dashboard fetch.
 * Returns raw gold_dummy rows as `{ data: [...] }`.
 */
export async function postFetch(req, res, next) {
  try {
    const {
      context = {},
      date,
      from,
      to,
      drillKpis = null,
      parentFilters = {},
      limit,
    } = req.body ?? {};

    if (typeof context !== "object" || context === null) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "context must be an object" },
      });
      return;
    }

    let sql;
    try {
      sql = buildFetchQuery({ context, date, from, to, drillKpis, parentFilters, limit });
    } catch (err) {
      const status = err instanceof QueryValidationError ? 400 : 500;
      res.status(status).json({
        error: {
          code:
            err.name === "QueryValidationError"
              ? "VALIDATION_ERROR"
              : "INTERNAL_ERROR",
          message: err.message,
        },
      });
      return;
    }

    const cacheKey = buildCacheKey("/dashboard/fetch", {
      context,
      date,
      from,
      to,
      drillKpis,
      parentFilters,
      limit,
    });
    const rows = await cached(cacheKey, () => runQuery(sql));
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/dashboard/vocab — distinct vocabulary values for the
 * frontend picker allow-lists. Cached aggressively.
 */
export async function getVocab(_req, res, next) {
  try {
    const vocab = await cached("dashboard:vocab", async () => {
      const grab = (sql) =>
        runQuery(sql).then((rows) => rows.map((r) => Object.values(r)[0]));
      const table = config.upstream.sqlTable;

      const [sections, categories, granularities, tyreTypes] = await Promise.all([
        grab(`SELECT DISTINCT section FROM ${table} WHERE section IS NOT NULL AND section != 'nan' AND section != '' ORDER BY section`),
        grab(`SELECT DISTINCT category FROM ${table} WHERE category IS NOT NULL AND category != 'nan' AND category != '' ORDER BY category`),
        grab(`SELECT DISTINCT granularity FROM ${table} WHERE granularity IS NOT NULL AND granularity != 'nan' AND granularity != '' ORDER BY granularity`),
        grab(`SELECT DISTINCT tyre_type FROM ${table} WHERE tyre_type IS NOT NULL AND tyre_type != 'nan' AND tyre_type != '' ORDER BY tyre_type`),
      ]);

      return { sections, categories, granularities, tyreTypes };
    });
    res.json({ data: vocab });
  } catch (err) {
    next(err);
  }
}
