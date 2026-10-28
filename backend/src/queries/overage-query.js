/**
 * Overage Material reads (frontend/specs/17-overage-material.md).
 *
 * Gold dates each inventory lot by the day it was produced, so the current
 * overage stock is spread across many dates. Both reads therefore:
 *   - take every date (no date filter) — the result is today's snapshot;
 *   - read DAY rows only — SHIFT and MONTH rows repeat the same lots;
 *   - keep one value per cell (MIN over section … itemcode, date), since
 *     some cells repeat many times with the same value (Cutter Ply);
 *   - sum per unit, never across units.
 * Assumes each Gold run replaces the inventory rows (Q-OVG-01).
 */
import { escapeLiteral } from "./queries.js";
import { DATE_YYYYMMDD } from "./sql-date.js";
import { goldSource } from "./gold-source.js";
import { plantPredicate, GRAN_DAY } from "../utils/normalize.js";

const OVERAGE_STATUS = "Overage";
const TOTALS_KPI = "Inventory";
const SKU_KPI = "Inventory_item";

/** One value per cell for `kpiName`'s DAY Overage rows, across all dates. */
function overageCellsCte(plantId, kpiName) {
  return `
    WITH cells AS (
      SELECT section, sub_section, product_type, unit_of_measurement,
             machine, itemcode, ${DATE_YYYYMMDD} AS date_key,
             MIN(actual_value) AS qty
      FROM ${goldSource({ plantId })}
      WHERE ${plantPredicate("plant", plantId)}
        AND kpi_name = ${escapeLiteral(kpiName)}
        AND status = ${escapeLiteral(OVERAGE_STATUS)}
        AND UPPER(granularity) = ${escapeLiteral(GRAN_DAY)}
      GROUP BY section, sub_section, product_type, unit_of_measurement,
               machine, itemcode, ${DATE_YYYYMMDD}
    )`;
}

/**
 * Overage totals at section, sub-section and component level in one pass.
 * `level` tags each row: 'section' | 'sub_section' | 'component'.
 *
 * @param {object} input
 * @param {string} input.plantId - normalized plant id
 * @returns {string} SELECT statement
 */
export function buildOverageTotalsSql({ plantId }) {
  return `
    ${overageCellsCte(plantId, TOTALS_KPI)}
    SELECT CASE GROUPING(sub_section, product_type)
             WHEN 3 THEN 'section'
             WHEN 1 THEN 'sub_section'
             ELSE 'component' END AS level,
           section, sub_section, product_type, unit_of_measurement,
           SUM(qty) AS overage_qty,
           MIN(date_key) AS oldest_lot_date,
           COUNT(DISTINCT date_key) AS production_days
    FROM cells
    GROUP BY GROUPING SETS (
      (section, unit_of_measurement),
      (section, sub_section, unit_of_measurement),
      (section, sub_section, product_type, unit_of_measurement)
    )
  `.trim();
}

/**
 * Overage per SKU (Inventory_item), largest first.
 *
 * @param {object} input
 * @param {string} input.plantId - normalized plant id
 * @returns {string} SELECT statement
 */
export function buildOverageSkuSql({ plantId }) {
  return `
    ${overageCellsCte(plantId, SKU_KPI)}
    SELECT section, sub_section, product_type, unit_of_measurement, itemcode,
           SUM(qty) AS overage_qty,
           MIN(date_key) AS oldest_lot_date,
           COUNT(DISTINCT date_key) AS production_days
    FROM cells
    GROUP BY section, sub_section, product_type, unit_of_measurement, itemcode
    ORDER BY overage_qty DESC
  `.trim();
}
