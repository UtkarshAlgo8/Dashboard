import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import { MIXING_PRODUCTIVITY_TRENDS } from "@/lib/mockData.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

const EMPTY = { labels: [], values: [] };

/**
 * Fetch a trend series for a KPI (spec 10). Phase 1 mock only knows
 * Mixing/Productivity KPIs; other slices return an empty series.
 *
 * Custom from/to date ranges fall back to the "month" series for
 * Phase 1 — the mock has no day-resolution data.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.kpiId
 * @param {string} params.range - "today" | "week" | "month" | "year" | "custom"
 * @param {string} [params.from] - ISO date, for "custom"
 * @param {string} [params.to]   - ISO date, for "custom"
 * @param {"master"|"final"} [params.compound]
 * @returns {Promise<{ labels: string[], values: number[] }>}
 */
export function getTrend({ plantId, kpiId, range, from, to, compound }) {
  if (USE_MOCK) {
    if (plantId !== "banmore") return mockDelay(EMPTY);
    const compoundKey = compound === "master" ? "master" : "final";
    const seriesByRange = MIXING_PRODUCTIVITY_TRENDS[compoundKey]?.[kpiId];
    if (!seriesByRange) return mockDelay(EMPTY);
    const effectiveRange = range === "custom" ? "month" : range;
    return mockDelay(seriesByRange[effectiveRange] ?? EMPTY);
  }
  const query = new URLSearchParams({ kpi: kpiId, range });
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (compound) query.set("compound", compound);
  return client.get(`/plants/${plantId}/production/trends?${query.toString()}`);
}
