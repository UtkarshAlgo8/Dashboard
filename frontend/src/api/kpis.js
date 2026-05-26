import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import {
  PRODUCTIVITY_KPIS_BY_SECTION,
  OTHER_TAB_KPIS_BY_SECTION,
} from "@/lib/mockData.js";
import {
  toSectionValue,
  toCategoryValue,
  toGranularityValue,
} from "@/lib/labelMaps.js";

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
export function getKpis({
  plantId,
  section,
  tab,
  compound,
  stockSelector,
  from,
  to,
  shift,
}) {
  if (USE_MOCK) {
    if (plantId !== "banmore") return mockDelay([]);

    if (tab === "p") {
      const bucket = PRODUCTIVITY_KPIS_BY_SECTION[section];
      if (!bucket) return mockDelay([]);
      if (section === "stk") {
        const key = stockSelector ?? "4roll";
        return mockDelay(bucket[key] ?? []);
      }
      return mockDelay(bucket);
    }

    if (["q", "c", "m", "s"].includes(tab)) {
      return mockDelay(OTHER_TAB_KPIS_BY_SECTION[section]?.[tab] ?? []);
    }

    // tab === "i" (Inventory) — spec 15
    return mockDelay([]);
  }
  // Send gold_dummy values directly on the wire. Backend reads them
  // straight into the WHERE clause (with allow-list validation) — no
  // server-side translation table.
  const query = new URLSearchParams({
    section: toSectionValue(section),
    category: toCategoryValue(tab),
  });
  if (compound) query.set("compound", compound);
  if (stockSelector) query.set("stockSelector", stockSelector);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const granularity = toGranularityValue(shift);
  if (granularity) query.set("granularity", granularity);
  return client.get(`/plants/${plantId}/production/kpis?${query.toString()}`);
}
