import client from "./client.js";
import { TEMP_SKU_FULFILMENT_FROM_JSON } from "@/lib/tempFlags.js";
import { getSnapshotRows } from "./skuFulfilmentSnapshot.js";

const PAGE_SIZE = 5000;
const MAX_PAGES = 20;

/**
 * Raw gold rows for the SKU Fulfillment page — the ONE data seam for it.
 * Every caller gets gold-shaped rows
 *   { date, granularity, section, kpi_name, product_type, itemcode, actual_value }
 * whether they come from the temporary JSON extract or from live gold, so
 * moving to live data is TEMP_SKU_FULFILMENT_FROM_JSON = false and nothing
 * else.
 *
 * Product type is NOT sent as a filter: the caller asks for the KPI level it
 * needs (_producttype / _sku) and filters the rows itself.
 *
 * @param {object} params
 * @param {string} [params.plantId="banmore"]
 * @param {string} params.section      gold section, e.g. "Curing"
 * @param {string} params.granularity  "DAY" | "SHIFT A".."SHIFT C" | "MONTH"
 * @param {string} params.from         ISO yyyy-mm-dd (inclusive)
 * @param {string} params.to           ISO yyyy-mm-dd (inclusive)
 * @param {string[]} params.kpiNames   at most 32 (backend drillKpis cap)
 * @returns {Promise<object[]>}
 */
export function getSkuFulfilmentRows({ plantId = "banmore", ...params }) {
  if (TEMP_SKU_FULFILMENT_FROM_JSON) return getSnapshotRows(params);
  return getGoldRows({ plantId, ...params });
}

async function getGoldRows({
  plantId,
  section,
  granularity,
  from,
  to,
  kpiNames,
}) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await client.post(
      "/dashboard/kpi-data",
      {
        plantId,
        context: { section, granularity },
        from,
        to,
        drillKpis: kpiNames,
        drillOnly: true,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      },
      { rawEnvelope: true },
    );
    const data = Array.isArray(body) ? body : (body?.data ?? []);
    rows.push(...data);
    if (Array.isArray(body) || !body?.truncated) break;
  }
  return rows;
}
