import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { kpiGridQuery } from "../queries.js";
import { toKpiGrid } from "../transformers.js";

export const router = Router({ mergeParams: true });

/**
 * GET /plants/:plantId/production/kpis
 *   ?section=&category=&granularity=&compound=&stockSelector=&from=&to=&tyreType=
 *
 * URL params carry gold_dummy column values directly (no translation):
 *   - section:     "Mixing" | "TBM" | "Curing" | "Stock"
 *   - category:    "Productivity" | "Quality" | "Cost" | "Morale" | "Safety"
 *   - granularity: "Daily" | "Shift A" | "Shift B" | "Shift C" (optional;
 *                  omit for "All Shifts" → no granularity predicate)
 *
 * compound / stockSelector are accepted on the URL for client-side
 * polling stability but are not forwarded to the SQL — gold_dummy
 * has no compound / sub-selector columns.
 *
 * Inventory (no `category=Inventory` row in gold_dummy yet) is
 * special-cased to `{data: []}` so the empty Inventory tab tooltip
 * keeps rendering even with the live backend.
 */
router.get("/", async (req, res, next) => {
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
        plant: "Banmore",
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
});
