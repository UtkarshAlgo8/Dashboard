import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { DATE_YYYYMMDD } from "../queries/dashboard-query.js";
import { goldSource } from "../queries/gold-source.js";
import { toInventory } from "../utils/transformers.js";
import {
  plantDepartmentPredicate,
  normalizePlantId,
  excludeUnknownKpiPredicate,
} from "../utils/normalize.js";

// changes.md §8.5: Inventory is a STOCK LEVEL, not a flow — never summed or
// averaged over a range. When a custom range is supplied we clamp the data
// to the range so the transformer's latest-date-wins pick returns the
// balance as of the range END (latest in-range day), not the global latest.
function isoToYyyymmdd(iso) {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(iso);
  return dmy ? `${dmy[3]}${dmy[2]}${dmy[1]}` : null;
}

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
  const plantId = normalizePlantId(req.params.plantId) ?? "banmore";
  // Optional custom-range clamp (§8.5). `to` = range end = the "as-of" day
  // whose balance we want; `from` bounds the window fetched. Only DAY-level
  // Inventory rows exist, so no granularity handling is needed here.
  const from = isoToYyyymmdd(req.query.from);
  const to = isoToYyyymmdd(req.query.to);
  const key = buildCacheKey(`/plants/${plantId}/inventory`, { from, to });
  try {
    const data = await cached(key, async () => {
      const rangeClauses = [];
      if (from) rangeClauses.push(`AND ${DATE_YYYYMMDD} >= '${from}'`);
      if (to) rangeClauses.push(`AND ${DATE_YYYYMMDD} <= '${to}'`);
      const table = goldSource({ plantId, fromKey: from, toKey: to });
      const sql = `
        SELECT CAST(date AS VARCHAR) AS date, section, product_type, itemcode,
               kpi_name, unit_of_measurement, actual_value, drill_down_level
        FROM ${table}
        WHERE ${plantDepartmentPredicate(plantId)}
          AND ${excludeUnknownKpiPredicate()}
          AND category = ${escapeLiteral("Inventory")}
          ${rangeClauses.join("\n          ")}
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
