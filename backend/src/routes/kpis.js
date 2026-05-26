import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { kpiGridQuery } from "../queries.js";
import { toKpiGrid } from "../transformers.js";

export const router = Router({ mergeParams: true });

/**
 * GET /plants/:plantId/kpis?section=&tab=&from=&to=&tyreType=
 *
 * Returns the KPI grid for the (section, tab) slice of a plant.
 * Phase 1 contract — see api-contract.md.
 */
router.get("/", async (req, res, next) => {
  try {
    const { section, tab, from, to, tyreType } = req.query;
    if (!section || !tab) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Both `section` and `tab` query params are required.",
        },
      });
      return;
    }
    const key = buildCacheKey(`/plants/${req.params.plantId}/kpis`, req.query);
    const data = await cached(key, async () => {
      const sql = kpiGridQuery({
        plant: "Banmore",
        section,
        category: tab,
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
});
