import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import { INVENTORY_BY_PLANT } from "@/lib/mockData.js";

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
