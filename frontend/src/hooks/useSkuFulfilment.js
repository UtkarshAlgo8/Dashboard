import { useMemo } from "react";
import { usePolledQuery } from "./usePolledQuery.js";
import { getSkuFulfilmentRows } from "@/api/skuFulfilment.js";
import {
  buildSkuFulfilment,
  isAllProductTypes,
  skuFulfilmentRequests,
} from "@/lib/skuFulfilment.js";

/**
 * Fetches and models the SKU Fulfillment page for one view + product type.
 * Every filter change refetches (no previous value survives a change), and
 * the model is only built from rows fetched for the CURRENT request.
 *
 * @param {object} params
 * @param {boolean} params.enabled
 * @param {string} [params.plantId="banmore"]
 * @param {string} params.section            gold section, e.g. "Curing"
 * @param {string} params.prefix             KPI name prefix, e.g. "Curing"
 * @param {string} params.totalProductType   the "all products" pill, e.g. "Cured Tyre"
 * @param {object|null} params.view          from resolveSkuFulfilmentView
 * @param {string|null} params.productType   the active product pill
 * @returns {{ model: object|null, isLoading: boolean, error: Error|null }}
 */
export function useSkuFulfilment({
  enabled,
  plantId = "banmore",
  section,
  prefix,
  totalProductType,
  view,
  productType,
}) {
  const allProducts = isAllProductTypes(productType, totalProductType);
  const requests = useMemo(
    () => skuFulfilmentRequests(view, { prefix, allProducts }),
    [view, prefix, allProducts],
  );
  const requestKey = JSON.stringify(requests);
  const active = Boolean(enabled && view && requests.length);

  const { data, error } = usePolledQuery(
    () =>
      Promise.all(
        requests.map((r) => getSkuFulfilmentRows({ plantId, section, ...r })),
      ).then((parts) => ({ key: requestKey, rows: parts.flat() })),
    {
      interval: 0,
      enabled: active,
      deps: [plantId, section, requestKey],
      cacheKey: `sku-fulfilment:${plantId}:${section}:${requestKey}`,
      staleTime: 5 * 60 * 1000,
    },
  );

  const fresh = active && data?.key === requestKey ? data.rows : null;
  const model = useMemo(
    () =>
      fresh
        ? buildSkuFulfilment(fresh, view, { prefix, productType, allProducts })
        : null,
    [fresh, view, prefix, productType, allProducts],
  );

  return { model, isLoading: active && !model && !error, error };
}

export default useSkuFulfilment;
