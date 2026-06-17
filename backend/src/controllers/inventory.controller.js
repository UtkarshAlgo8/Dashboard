import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { toInventory } from "../utils/transformers.js";
import { config } from "../config.js";

/**
 * GET /plants/:plantId/inventory  (BRD §13.4)
 *
 * Reads gold_dummy `category = 'Inventory'` rows:
 *   kpi_name = 'Inventory'       → one bar per product_type.
 *   kpi_name = 'Inventory_item'  → item-level live stock drill-down.
 * The transformer buckets product_types into Production / Stock /
 * Compound groups + a 7-day history table.
 */
export async function getInventory(req, res, next) {
  const plantId = req.params.plantId ?? "banmore";
  const key = buildCacheKey(`/plants/${plantId}/inventory`, {});
  try {
    const data = await cached(key, async () => {
      const sql = `
        SELECT CAST(date AS VARCHAR) AS date, product_type, itemcode, kpi_name,
               unit_of_measurement, actual_value, drill_down_level
        FROM ${config.upstream.sqlTable}
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
}
