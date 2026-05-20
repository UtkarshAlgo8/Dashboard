import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import { OEE_DRILL_BY_PLANT_SECTION } from "@/lib/mockData.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

const EMPTY_OEE = { overall: null, machines: [], subDrill: {} };

/**
 * Fetch the OEE drill for a given (plant, section) slice.
 * Phase 1 mock returns Banmore + Mixing only; other slices return
 * an empty payload until spec 11.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section - "mix" | "tbm" | "cur" | "stk"
 * @returns {Promise<{
 *   overall: { availability: number, performance: number, quality: number } | null,
 *   machines: Array,
 *   subDrill: Record<string, Array>
 * }>}
 */
export function getOeeDrill({ plantId, section }) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}`;
    return mockDelay(OEE_DRILL_BY_PLANT_SECTION[key] ?? EMPTY_OEE);
  }
  return client.get(
    `/plants/${plantId}/production/drills/oee?section=${section}`,
  );
}
