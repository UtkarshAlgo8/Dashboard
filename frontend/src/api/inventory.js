import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import { INVENTORY_BY_PLANT } from "@/lib/mockData.js";
import CTP_INVENTORY_MASTER from "@/lib/ctpInventoryMaster.json";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

const EMPTY = { groups: {}, history: [] };

/**
 * Fetch Inventory data for a plant (spec 15). Phase 1 mock returns
 * Banmore only.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @returns {Promise<{ groups: object, history: Array }>}
 */
export function getInventory({ plantId, from = null, to = null }) {
  if (USE_MOCK) {
    return mockDelay(INVENTORY_BY_PLANT[plantId] ?? EMPTY);
  }
  // changes.md §8.5: pass the custom range so the backend clamps to the
  // latest IN-RANGE day (balance as of range end), never summing/averaging.
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return client.get(`/plants/${plantId}/inventory${suffix}`);
}

/**
 * Fetch the CTP (Chennai) Inventory master — sections → product types →
 * items → lots, plus status master, insight-card and table config.
 *
 * `VITE_USE_MOCK_DATA` gates the TRANSPORT only:
 *   - `true`  (default in dev): served from the bundled mock fixture
 *     at `@/lib/ctpInventoryMaster.json` so the page works offline.
 *   - `false`: hits the backend endpoint, which reads the latest DAY
 *     snapshot of the per-status Inventory KPIs from `gold.ctp_gold`
 *     (docs/Inventory_Mapping_Final.xlsx). Lots are synthesised one per
 *     (item, status); MHE identities are absent, but Gold MHE_Count is
 *     preserved per item (with unmapped counts retained for the headline).
 *
 * @param {object} [params]
 * @param {string} [params.plantId="chennai"]
 * @param {string|null} [params.granularity] - DAY / MONTH / SHIFT A-C
 * @param {string|null} [params.from] - window start (ISO)
 * @param {string|null} [params.to] - window end, the "as of" day (ISO)
 * @returns {Promise<object>} master payload — see
 *   `frontend/src/lib/ctpInventory.js#buildCtpInventoryModel` for the
 *   shape.
 */
export function getCtpInventoryMaster({
  plantId = "chennai",
  granularity = null,
  from = null,
  to = null,
} = {}) {
  if (USE_MOCK) return mockDelay(CTP_INVENTORY_MASTER);
  const qs = new URLSearchParams();
  if (granularity) qs.set("granularity", granularity);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return client.get(`/plants/${plantId}/inventory/master${suffix}`);
}
