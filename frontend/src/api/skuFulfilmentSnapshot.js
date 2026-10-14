/**
 * TEMPORARY: serves Curing SKU Fulfillment rows from a static extract of the
 * gold table (public/temp/curing-sku-fulfilment.json) until gold carries the
 * *_SKU_Fulfilment_* KPI family. Delete this file and the JSON once
 * TEMP_SKU_FULFILMENT_FROM_JSON is off.
 *
 * The JSON is stored compactly (date → granularity → kpi_name → value). This
 * module expands the requested slice back into gold-shaped rows, so callers
 * cannot tell it apart from the live /dashboard/kpi-data response.
 *
 *   total KPI         → number | null
 *   _producttype KPI  → { [product_type]: number | null }
 *   _sku KPI          → { [skuIndex]: number }   (zero / null values dropped)
 */

const SNAPSHOT_URL = `${import.meta.env.BASE_URL}temp/curing-sku-fulfilment.json`;

let snapshotPromise = null;

function loadSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = fetch(SNAPSHOT_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`SKU Fulfillment snapshot: HTTP ${res.status}`);
        }
        return res.json();
      })
      .catch((err) => {
        snapshotPromise = null; // let the next call retry
        throw err;
      });
  }
  return snapshotPromise;
}

/**
 * Gold-shaped rows for one slice of the snapshot.
 *
 * @param {object} params
 * @param {string} params.section       e.g. "Curing"
 * @param {string} params.granularity   "DAY" | "SHIFT A" | "SHIFT B" | "SHIFT C" | "MONTH"
 * @param {string} params.from          ISO yyyy-mm-dd (inclusive)
 * @param {string} params.to            ISO yyyy-mm-dd (inclusive)
 * @param {string[]} params.kpiNames
 * @returns {Promise<object[]>}
 */
export async function getSnapshotRows({
  section,
  granularity,
  from,
  to,
  kpiNames,
}) {
  const snap = await loadSnapshot();
  if (section !== snap.section) return [];
  const wanted = new Set(kpiNames);
  const rows = [];
  for (const [date, byGranularity] of Object.entries(snap.data)) {
    if (date < from || date > to) continue;
    const byKpi = byGranularity[granularity];
    if (!byKpi) continue;
    for (const [kpiName, stored] of Object.entries(byKpi)) {
      if (!wanted.has(kpiName)) continue;
      const base = { date, granularity, section, kpi_name: kpiName };
      if (kpiName.endsWith("_sku")) {
        for (const [i, value] of Object.entries(stored)) {
          rows.push({
            ...base,
            product_type: snap.skuProductType[i],
            itemcode: snap.skus[i],
            actual_value: value,
          });
        }
      } else if (kpiName.endsWith("_producttype")) {
        for (const [productType, value] of Object.entries(stored)) {
          rows.push({
            ...base,
            product_type: productType,
            itemcode: null,
            actual_value: value,
          });
        }
      } else {
        rows.push({
          ...base,
          product_type: snap.totalProductType,
          itemcode: null,
          actual_value: stored,
        });
      }
    }
  }
  return rows;
}
