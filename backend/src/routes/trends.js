import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { trendQuery } from "../queries.js";
import { toTrendSeries } from "../transformers.js";

export const router = Router({ mergeParams: true });

/**
 * GET /plants/:plantId/production/trends
 *   ?kpiId=&section=&category=&granularity=&from=&to=&tyreType=
 *
 * URL params carry gold_dummy values directly. `kpiId` is still a
 * frontend slug (oee / production / downtime / plan-compliance);
 * we map it to the matching kpi_name.
 */
/**
 * Map frontend KPI id slugs to actual gold_dummy kpi_name values.
 * Updated to match live gold_dummy (confirmed 2026-05-27).
 */
const KPI_NAME_BY_ID = {
  "oee": "OEE_o",
  "production": "Production",
  "downtime": "Downtime",
  "plan-compliance": "Plan_Compliance",
};

router.get("/", async (req, res, next) => {
  try {
    const {
      kpiId,
      section,
      category,
      range,
      granularity,
      from,
      to,
      tyreType,
      productType,
      subSection,
    } = req.query;
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
        range,
        granularity,
        tyreType: tyreType ?? null,
        productType: productType ?? null,
        subSection: subSection ?? null,
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
