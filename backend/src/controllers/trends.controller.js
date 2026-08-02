import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { trendQuery } from "../queries/queries.js";
import { toTrendSeries } from "../utils/transformers.js";

/** Map frontend KPI id slugs to actual gold_dummy kpi_name values. */
const KPI_NAME_BY_ID = {
  oee: "OEE_o",
  production: "Production",
  downtime: "Downtime",
  "plan-compliance": "Plan_Compliance",
};

/**
 * GET /plants/:plantId/production/trends
 *   ?kpiId=&section=&category=&range=&granularity=&from=&to=&tyreType=
 *   &productType=&subSection=
 */
export async function getTrends(req, res, next) {
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
        plant: req.params.plantId,
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
}
