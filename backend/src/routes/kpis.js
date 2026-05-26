import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { kpiGridQuery } from "../queries.js";
import { toKpiGrid } from "../transformers.js";

export const router = Router({ mergeParams: true });

/**
 * GET /plants/:plantId/production/kpis
 *   ?section=&tab=&shift=&compound=&stockSelector=&from=&to=&tyreType=
 *
 * - section: mix | tbm | cur | stk
 * - tab:     p | q | c | m | s   (i = Inventory disabled in Phase 1)
 * - shift:   all | daily | a | b | c    (maps to gold_dummy.granularity)
 *
 * compound / stockSelector are accepted on the URL so the frontend
 * polled refetches don't break, but are not forwarded to the SQL —
 * gold_dummy doesn't (yet) carry compound or sub-selector columns.
 */
router.get("/", async (req, res, next) => {
  try {
    const { section, tab, shift, from, to, tyreType } = req.query;
    if (!section || !tab) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Both `section` and `tab` query params are required.",
        },
      });
      return;
    }
    if (tab === "i") {
      // Inventory has no rows in gold_dummy yet. Return [] instead of
      // erroring so the frontend renders its empty state cleanly.
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
        category: tab,
        shift,
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
