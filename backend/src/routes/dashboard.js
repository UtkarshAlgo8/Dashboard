import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { buildFetchQuery, QueryValidationError } from "../dashboard-query.js";

export const router = Router();

/**
 * POST /api/v1/dashboard/fetch
 *
 * Universal dashboard fetch per docs/dashboard_logic_guide_v2.pdf.
 *
 * Body schema:
 *   {
 *     context: { plant?, department?, section?, sub_section?,
 *                product_type?, category?, tyre_type?, granularity? },
 *     date: ISO "yyyy-mm-dd" or DD-MM-YYYY,
 *     drillKpis: string[] | null   ← null = landing, array = drill
 *     parentFilters: { machine?, itemcode? },
 *     limit?: number
 *   }
 *
 * Returns raw gold_dummy rows as `{ data: [...] }`.
 */
router.post("/fetch", async (req, res, next) => {
  try {
    const {
      context = {},
      date,
      drillKpis = null,
      parentFilters = {},
      limit,
    } = req.body ?? {};

    if (typeof context !== "object" || context === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "context must be an object" } });
      return;
    }

    let sql;
    try {
      sql = buildFetchQuery({ context, date, drillKpis, parentFilters, limit });
    } catch (err) {
      const status = err instanceof QueryValidationError ? 400 : 500;
      res.status(status).json({
        error: { code: err.name === "QueryValidationError" ? "VALIDATION_ERROR" : "INTERNAL_ERROR", message: err.message },
      });
      return;
    }

    const cacheKey = buildCacheKey("/dashboard/fetch", { context, date, drillKpis, parentFilters, limit });
    const rows = await cached(cacheKey, () => runQuery(sql));
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/dashboard/vocab
 *
 * Return distinct values for the frontend picker allow-lists so
 * the UI can render pills dynamically without hard-coding them.
 * Cached aggressively (the vocabulary changes rarely).
 */
router.get("/vocab", async (req, res, next) => {
  try {
    const vocab = await cached("dashboard:vocab", async () => {
      const grab = (sql) => runQuery(sql).then((rows) => rows.map((r) => Object.values(r)[0]));

      const [sections, categories, granularities, tyreTypes] = await Promise.all([
        grab(`SELECT DISTINCT section FROM gold_dummy WHERE section IS NOT NULL AND section != 'nan' AND section != '' ORDER BY section`),
        grab(`SELECT DISTINCT category FROM gold_dummy WHERE category IS NOT NULL AND category != 'nan' AND category != '' ORDER BY category`),
        grab(`SELECT DISTINCT granularity FROM gold_dummy WHERE granularity IS NOT NULL AND granularity != 'nan' AND granularity != '' ORDER BY granularity`),
        grab(`SELECT DISTINCT tyre_type FROM gold_dummy WHERE tyre_type IS NOT NULL AND tyre_type != 'nan' AND tyre_type != '' ORDER BY tyre_type`),
      ]);

      return { sections, categories, granularities, tyreTypes };
    });
    res.json({ data: vocab });
  } catch (err) {
    next(err);
  }
});
