import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import { MIXING_PRODUCTIVITY_KPIS } from "@/lib/mockData.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

/**
 * Fetch the KPI grid for a given (plant, section, tab, compound)
 * slice. Phase 1 mock handles Banmore + mix + p only — other slices
 * return an empty array. Subsequent specs (11 other-sections, 12
 * other-tabs) widen the matrix.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section   - "mix" | "tbm" | "cur" | "stk"
 * @param {string} params.tab       - "p" | "q" | "c" | "d" | "m" | "s"
 * @param {string} [params.compound] - "master" | "final" (Mixing only)
 * @returns {Promise<Array>}
 */
export function getKpis({ plantId, section, tab, compound }) {
  if (USE_MOCK) {
    if (plantId === "banmore" && section === "mix" && tab === "p") {
      const key = compound === "master" ? "master" : "final";
      return mockDelay(MIXING_PRODUCTIVITY_KPIS[key]);
    }
    return mockDelay([]);
  }
  const query = new URLSearchParams({ section, tab });
  if (compound) query.set("compound", compound);
  return client.get(`/plants/${plantId}/production/kpis?${query.toString()}`);
}
