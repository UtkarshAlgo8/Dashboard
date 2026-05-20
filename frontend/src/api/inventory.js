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
export function getInventory({ plantId }) {
  if (USE_MOCK) {
    return mockDelay(INVENTORY_BY_PLANT[plantId] ?? EMPTY);
  }
  return client.get(`/plants/${plantId}/inventory`);
}
