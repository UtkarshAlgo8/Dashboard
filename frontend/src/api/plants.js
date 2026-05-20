import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import { PLANTS, FUNCTIONS } from "@/lib/mockData.js";

// Phase 1 default is mock data (Q-BE-01). Only the explicit string
// "false" disables it — handles the case where no .env file exists
// and the var is undefined.
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

/**
 * @returns {Promise<typeof PLANTS>}
 */
export function getPlants() {
  if (USE_MOCK) return mockDelay(PLANTS);
  return client.get("/plants");
}

/**
 * @param {string} id
 * @returns {Promise<typeof PLANTS[number] | null>}
 */
export function getPlant(id) {
  if (USE_MOCK) {
    const match = PLANTS.find((p) => p.id === id) ?? null;
    return mockDelay(match);
  }
  return client.get(`/plants/${id}`);
}

/**
 * Function tiles available across all plants (Plant Head, Production,
 * Quality, Technical, Engineering). The `active` flag here is the
 * data-level flag; Phase 1 UI further restricts to Production per
 * Q-NAV-01.
 *
 * @returns {Promise<typeof FUNCTIONS>}
 */
export function getFunctions() {
  if (USE_MOCK) return mockDelay(FUNCTIONS);
  return client.get("/functions");
}
