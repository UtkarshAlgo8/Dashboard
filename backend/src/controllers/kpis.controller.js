import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { kpiGridQuery } from "../queries/queries.js";
import { toKpiGrid } from "../utils/transformers.js";

/**
 * GET /plants/:plantId/production/kpis
 *   ?section=&category=&granularity=&from=&to=&tyreType=
 *
 * URL params carry gold_dummy column values directly (no translation).
 * Inventory has no `category=Inventory` legacy KPI row, so it's
 * special-cased to `{data: []}`.
 */
export async function getKpis(req, res, next) {
  try {
    const { section, category, granularity, from, to, tyreType } = req.query;
    if (!section || !category) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Both `section` and `category` query params are required.",
        },
      });
      return;
    }
    if (category === "Inventory") {
      res.json({ data: [] });
      return;
    }
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/kpis`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = kpiGridQuery({
        plant: req.params.plantId,
        section,
        category,
        granularity,
        from,
        to,
        tyreType: tyreType ?? null,
      });
      const rows = await runQuery(sql);
      return toKpiGrid(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
