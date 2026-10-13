import { cached, buildCacheKey, CACHE_TTL } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { DATE_YYYYMMDD } from "../queries/dashboard-query.js";
import { goldSource } from "../queries/gold-source.js";
import {
  toInventory,
  toCtpInventoryMaster,
  CTP_INVENTORY_KPIS,
  CTP_CARD_KPIS,
} from "../utils/transformers.js";
import {
  plantDepartmentPredicate,
  plantPredicate,
  normalizePlantId,
  excludeUnknownKpiPredicate,
  normalizeGranularity,
  GRAN_DAY,
  GRAN_MONTH,
  GRAN_SHIFT_A,
  GRAN_SHIFT_B,
  GRAN_SHIFT_C,
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

// Grains an inventory snapshot can be read at (mapping "Query filters"
// sheet). Anything else — including no selection — reads DAY.
const CTP_INVENTORY_GRANULARITIES = new Set([
  GRAN_DAY,
  GRAN_MONTH,
  GRAN_SHIFT_A,
  GRAN_SHIFT_B,
  GRAN_SHIFT_C,
]);

/**
 * The single granularity an inventory read uses: the header's Today /
 * shift / Month selection, defaulting to DAY.
 *
 * @param {unknown} raw - `granularity` query param
 * @returns {string} one of CTP_INVENTORY_GRANULARITIES
 */
export function ctpInventoryGranularity(raw) {
  const g = String(normalizeGranularity(raw) ?? "").toUpperCase();
  return CTP_INVENTORY_GRANULARITIES.has(g) ? g : GRAN_DAY;
}

/**
 * SQL for the CTP inventory master, per docs/Inventory_Mapping_Final.xlsx
 * ("Query filters" sheet):
 *   - category = 'Inventory' (not department — every inventory KPI is
 *     Production, so the category is the real scope);
 *   - one granularity only (DAY for Today, MONTH for Month, SHIFT A/B/C
 *     for a shift) — grains are never summed together;
 *   - drill_down_level 1 for the card KPIs, 2 for the breakdowns;
 *   - inventory is a stock level (§8.5): each series is read at its OWN
 *     latest date within [fromKey, toKey], since not every series is
 *     refreshed daily. MHE_Count is partitioned down to item, machine and
 *     unit because its rows contain separate counts at those dimensions.
 *
 * @param {object} input
 * @param {string} input.plantId - normalized plant id
 * @param {string} input.granularity - one of CTP_INVENTORY_GRANULARITIES
 * @param {string|null} [input.fromKey] - YYYYMMDD window start, or null
 * @param {string|null} [input.toKey] - YYYYMMDD window end ("as of"), or null
 * @returns {string} SELECT statement
 */
export function ctpInventoryMasterSql({
  plantId,
  granularity,
  fromKey = null,
  toKey = null,
}) {
  const table = goldSource({ plantId, fromKey, toKey });
  const cardKpis = CTP_CARD_KPIS.map(escapeLiteral).join(", ");
  const rangeClauses = [];
  if (fromKey) rangeClauses.push(`AND ${DATE_YYYYMMDD} >= '${fromKey}'`);
  if (toKey) rangeClauses.push(`AND ${DATE_YYYYMMDD} <= '${toKey}'`);
  return `
          SELECT date, section, sub_section, product_type, itemcode, tyre_type,
                 machine, unit_of_measurement, kpi_name, actual_value
          FROM (
            SELECT CAST(date AS VARCHAR) AS date, section, sub_section, product_type,
                   itemcode, tyre_type, machine, unit_of_measurement, kpi_name,
                   actual_value,
                   CASE WHEN kpi_name = 'MHE_Count' THEN
                     date = MAX(date) OVER (
                       PARTITION BY section, sub_section, product_type, itemcode,
                                    tyre_type, machine, unit_of_measurement, kpi_name
                     )
                   ELSE date = MAX(date) OVER (
                     PARTITION BY section, product_type, tyre_type, kpi_name
                   ) END AS is_latest
            FROM ${table}
            WHERE ${plantPredicate("plant", plantId)}
              AND ${excludeUnknownKpiPredicate()}
              AND category = ${escapeLiteral("Inventory")}
              AND UPPER(granularity) = ${escapeLiteral(granularity)}
              AND kpi_name IN (${CTP_INVENTORY_KPIS.map(escapeLiteral).join(", ")})
              AND CAST(drill_down_level AS VARCHAR) =
                CASE WHEN kpi_name IN (${cardKpis}) THEN '1' ELSE '2' END
              ${rangeClauses.join("\n              ")}
          )
          WHERE is_latest
          LIMIT 50000
        `.trim();
}

/**
 * GET /plants/:plantId/inventory/master?granularity=&from=&to=
 *
 * CTP inventory master payload consumed by `frontend/src/lib/ctpInventory
 * .js#buildCtpInventoryModel`. Reads the gold per-status inventory KPIs
 * (docs/Inventory_Mapping_Final.xlsx) and assembles the master
 * sections/product_types/items/lots shape.
 *
 * `granularity` picks the grain (Today → DAY, Month → MONTH, a shift →
 * SHIFT A/B/C); `from`/`to` bound the window, and each series reports
 * its balance as of the latest date in it. Cached for 5 min
 * (CACHE_TTL.INVENTORY_MASTER) per (granularity, from, to).
 */
export async function getCtpInventoryMaster(req, res, next) {
  const plantId = normalizePlantId(req.params.plantId) ?? "chennai";
  const granularity = ctpInventoryGranularity(req.query.granularity);
  const fromKey = isoToYyyymmdd(req.query.from);
  const toKey = isoToYyyymmdd(req.query.to);
  const key = buildCacheKey(`/plants/${plantId}/inventory/master`, {
    granularity,
    from: fromKey,
    to: toKey,
  });
  try {
    const data = await cached(
      key,
      async () => {
        const sql = ctpInventoryMasterSql({ plantId, granularity, fromKey, toKey });
        return toCtpInventoryMaster(await runQuery(sql));
      },
      CACHE_TTL.INVENTORY_MASTER,
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
