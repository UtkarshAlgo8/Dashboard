import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { escapeLiteral } from "../queries.js";
import { config } from "../config.js";

/**
 * Plant-scoped endpoints. Mount at /api/v1/plants.
 *   GET /:id          → one plant
 *   GET /:id/summary  → headline OEE / FTQ / Scrap (upstream-backed)
 *
 * /plants (list), /sections, /category-tabs, /functions live in
 * routes/static.js because the frontend calls them unscoped.
 */

export const router = Router();

const PHASE_1_PLANT = "banmore";

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
    data: { id: "banmore", name: "Banmore Plant", tyreType: "PCR" },
  });
});

/**
 * Plant summary — headline OEE / FTQ / Scrap values, latest per KPI.
 * Plant-level rows have machine='nan' (the same top-level sentinel
 * used in the KPI grid query). Section column may be 'nan' too for
 * truly plant-wide rows, OR carry one of the section names if the
 * upstream rolls up per section. We pick the latest of either.
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
        SELECT kpi_name, actual_value, year, month, day
        FROM (
          SELECT kpi_name, actual_value, year, month, day,
                 ROW_NUMBER() OVER (
                   PARTITION BY kpi_name
                   ORDER BY year DESC, CAST(month AS INTEGER) DESC, day DESC
                 ) AS rn
          FROM ${config.upstream.table}
          WHERE plant = ${escapeLiteral("Banmore")}
            AND department = ${escapeLiteral("Production")}
            AND machine = ${escapeLiteral("nan")}
            AND kpi_name IN (
              ${escapeLiteral("OEE")},
              ${escapeLiteral("FTQ")},
              ${escapeLiteral("Scrap")}
            )
        ) ranked
        WHERE rn = 1
      `.trim();
      const rows = await runQuery(sql);
      const pick = (name) => {
        const row = rows.find((r) => r.kpi_name === name);
        if (!row) return null;
        const yyyy = row.year;
        const mm = String(row.month).padStart(2, "0");
        const dd = String(row.day).padStart(2, "0");
        return { value: row.actual_value, date: `${dd}-${mm}-${yyyy}` };
      };
      return { oee: pick("OEE"), ftq: pick("FTQ"), scrap: pick("Scrap") };
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export { PHASE_1_PLANT };
