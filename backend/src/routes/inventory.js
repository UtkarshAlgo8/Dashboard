import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import { escapeLiteral } from "../queries.js";
import { toInventory } from "../transformers.js";
import { config } from "../config.js";

export const router = Router({ mergeParams: true });

/**
 * GET /plants/:plantId/inventory  (BRD §13.4)
 *
 * Inventory data now lives in gold_dummy under category = 'Inventory':
 *   kpi_name = 'Inventory'       → one bar per product_type (FG, Tread,
 *                                  Final Compound, …); today / yesterday
 *                                  are the two latest Daily rows.
 *   kpi_name = 'Inventory_item'  → item-level live stock drill-down.
 *
 * The transformer buckets product_types into the Production / Stock /
 * Compound chart groups and rolls a 7-day history table.
 */
router.get("/", async (req, res, next) => {
  const plantId = req.params.plantId ?? "banmore";
  const key = buildCacheKey(`/plants/${plantId}/inventory`, {});
  try {
    const data = await cached(key, async () => {
      const sql = `
        SELECT CAST(date AS VARCHAR) AS date, product_type, itemcode, kpi_name,
               unit_of_measurement, actual_value, drill_down_level
        FROM ${config.upstream.table}
        WHERE plant = ${escapeLiteral("Banmore")}
          AND department = ${escapeLiteral("Production")}
          AND category = ${escapeLiteral("Inventory")}
        LIMIT 10000
      `.trim();
      const rows = await runQuery(sql);
      return toInventory(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
