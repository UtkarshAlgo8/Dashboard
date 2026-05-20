import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import {
  PRODUCTIVITY_KPIS_BY_SECTION,
  OTHER_TAB_KPIS_BY_SECTION,
} from "@/lib/mockData.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

/**
 * Fetch the KPI grid for a given (plant, section, tab, sub-selector)
 * slice. Phase 1 mock handles Banmore + Productivity tab for all
 * four sections; other tabs return an empty array until spec 12.
 *
 * Sub-selector semantics:
 *   - Mixing  → `compound` (master / final)
 *   - Stock   → `stockSelector` (4roll / extruder / 3roll / cutter / slitter)
 *   - TBM/Cur → no sub-selector
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section   - "mix" | "tbm" | "cur" | "stk"
 * @param {string} params.tab       - "p" | "q" | "c" | "d" | "m" | "s"
 * @param {string} [params.compound] - Mixing only
 * @param {string} [params.stockSelector] - Stock only; default "4roll"
 * @returns {Promise<Array>}
 */
export function getKpis({ plantId, section, tab, compound, stockSelector }) {
  if (USE_MOCK) {
    if (plantId !== "banmore") return mockDelay([]);

    if (tab === "p") {
      const bucket = PRODUCTIVITY_KPIS_BY_SECTION[section];
      if (!bucket) return mockDelay([]);
      if (section === "mix") {
        const key = compound === "master" ? "master" : "final";
        return mockDelay(bucket[key] ?? []);
      }
      if (section === "stk") {
        const key = stockSelector ?? "4roll";
        return mockDelay(bucket[key] ?? []);
      }
      return mockDelay(bucket);
    }

    if (["q", "c", "d", "m", "s"].includes(tab)) {
      return mockDelay(OTHER_TAB_KPIS_BY_SECTION[section]?.[tab] ?? []);
    }

    // tab === "i" (Inventory) — spec 15
    return mockDelay([]);
  }
  const query = new URLSearchParams({ section, tab });
  if (compound) query.set("compound", compound);
  if (stockSelector) query.set("stockSelector", stockSelector);
  return client.get(`/plants/${plantId}/production/kpis?${query.toString()}`);
}
