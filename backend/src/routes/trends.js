import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { trendQuery } from "../queries.js";
import { toTrendSeries } from "../transformers.js";

export const router = Router({ mergeParams: true });

/**
 * GET /plants/:plantId/production/trends
 *   ?kpiId=&section=&category=&shift=&from=&to=&tyreType=
 *
 * Frontend's getTrend() (src/api/trends.js) hits this URL.
 *
 * `kpiId` is the frontend's slug ("oee" / "production" / etc).
 * Map slug → human kpi_name for the gold_dummy query.
 */
const KPI_NAME_BY_ID = {
  oee: "OEE",
  production: "Production",
  downtime: "Downtime",
  "plan-compliance": "Plan Compliance",
};

router.get("/", async (req, res, next) => {
  try {
    const { kpiId, section, category, shift, from, to, tyreType } = req.query;
    if (!kpiId || !section || !category) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "`kpiId`, `section`, and `category` query params are required.",
        },
      });
      return;
    }
    const kpiName = KPI_NAME_BY_ID[kpiId] ?? kpiId;
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/trends`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = trendQuery({
        plant: "Banmore",
        section,
        category,
        kpiName,
        shift,
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
