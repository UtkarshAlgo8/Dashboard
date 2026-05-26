import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { escapeLiteral } from "../queries.js";
import { config } from "../config.js";

/**
 * Plant / sections / category-tabs / summary endpoints.
 *
 * Mostly small chrome-render lookups. Phase 1 ships Banmore only;
 * any other plantId returns a clear 404.
 */

export const router = Router();

const PHASE_1_PLANT = "banmore";

const SECTIONS = [
  { id: "mix", name: "Mixing" },
  { id: "stk", name: "Stock" },
  { id: "tbm", name: "TBM" },
  { id: "cur", name: "Curing" },
];

const CATEGORY_TABS = [
  { id: "p", name: "Productivity" },
  { id: "q", name: "Quality" },
  { id: "c", name: "Cost" },
  { id: "m", name: "Morale" },
  { id: "s", name: "Safety" },
  { id: "i", name: "Inventory" },
];

router.get("/:plantId", (req, res) => {
  if (req.params.plantId !== PHASE_1_PLANT) {
    res.status(404).json({
      error: {
        code: "PLANT_NOT_AVAILABLE",
        message: `Plant '${req.params.plantId}' is not enabled in Phase 1.`,
      },
    });
    return;
  }
  res.json({
    data: {
      id: "banmore",
      name: "Banmore Plant",
      tyreType: "PCR",
    },
  });
});

router.get("/:plantId/sections", (req, res) => {
  if (req.params.plantId !== PHASE_1_PLANT) {
    res.status(404).json({
      error: { code: "PLANT_NOT_AVAILABLE", message: "Unknown plant." },
    });
    return;
  }
  res.json({ data: SECTIONS });
});

router.get("/:plantId/category-tabs", (req, res) => {
  if (req.params.plantId !== PHASE_1_PLANT) {
    res.status(404).json({
      error: { code: "PLANT_NOT_AVAILABLE", message: "Unknown plant." },
    });
    return;
  }
  res.json({ data: CATEGORY_TABS });
});

/**
 * Plant summary — headline OEE / FTQ / Scrap values. Picks the
 * latest `actual_value` per kpi from plant-wide rows (no section
 * filter). We do NOT use `status` here per the 2026-05-26 PM call;
 * the frontend computes red/amber/green from the value alone.
 */
router.get("/:plantId/summary", async (req, res, next) => {
  if (req.params.plantId !== PHASE_1_PLANT) {
    res.status(404).json({
      error: { code: "PLANT_NOT_AVAILABLE", message: "Unknown plant." },
    });
    return;
  }
  const key = buildCacheKey(`/plants/${req.params.plantId}/summary`, req.query);
  try {
    const data = await cached(key, async () => {
      const sql = `
        SELECT kpi_name, actual_value, date
        FROM ${config.upstream.table}
        WHERE plant = ${escapeLiteral("Banmore")}
          AND kpi_name IN (${escapeLiteral("OEE")}, ${escapeLiteral("FTQ")}, ${escapeLiteral("Scrap")})
          AND section IS NULL
        ORDER BY date DESC
        LIMIT 10
      `.trim();
      const rows = await runQuery(sql);
      const pick = (name) => {
        const row = rows.find((r) => r.kpi_name === name);
        return row ? { value: row.actual_value, date: row.date } : null;
      };
      return { oee: pick("OEE"), ftq: pick("FTQ"), scrap: pick("Scrap") };
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export { SECTIONS, CATEGORY_TABS, PHASE_1_PLANT };
