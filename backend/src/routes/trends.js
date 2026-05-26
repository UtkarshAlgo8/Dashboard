import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { trendQuery } from "../queries.js";
import { toTrendSeries } from "../transformers.js";

export const router = Router({ mergeParams: true });

/**
 * GET /plants/:plantId/trends/:kpiId
 *   ?section=&category=&kpiName=&range=&granularity=&from=&to=&tyreType=
 *
 * Returns `{ labels: string[], values: (number|null)[] }` shaped for
 * the TrendModal LineChart / BarChart / ProgressChart.
 */
router.get("/:kpiId", async (req, res, next) => {
  try {
    const { section, category, kpiName, granularity, from, to, tyreType } =
      req.query;
    if (!section || !category || !kpiName) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "`section`, `category`, and `kpiName` query params are required.",
        },
      });
      return;
    }
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/trends/${req.params.kpiId}`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = trendQuery({
        plant: "Banmore",
        section,
        category,
        kpiName,
        granularity: granularity ?? "Daily",
        tyreType: tyreType ?? null,
        from,
        to,
      });
      const rows = await runQuery(sql);
      return toTrendSeries(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
