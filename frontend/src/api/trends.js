import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import { MIXING_PRODUCTIVITY_TRENDS } from "@/lib/mockData.js";
import {
  toSectionValue,
  toCategoryValue,
  toGranularityValue,
} from "@/lib/labelMaps.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

const EMPTY = { labels: [], values: [] };

/**
 * Fetch a trend series for a KPI (spec 10 + CR-07).
 *
 * Live (CR-07) backend expects `?kpiId=&section=&category=&shift=&from=&to=`.
 * Mock returns whichever Mixing/Productivity series matches.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.kpiId   - slug (e.g. "oee", "production")
 * @param {string} [params.section]   "mix" | "tbm" | "cur" | "stk"
 * @param {string} [params.category]  "p" | "q" | "c" | "m" | "s"
 * @param {string} [params.range]     "today" | "month" | "year" | "custom"
 * @param {string} [params.from]      ISO yyyy-mm-dd
 * @param {string} [params.to]        ISO yyyy-mm-dd
 * @param {string} [params.shift]     "a" | "b" | "c" | "all"
 * @param {"master"|"final"} [params.compound]
 */
export function getTrend({
  plantId,
  kpiId,
  section,
  category,
  range,
  from,
  to,
  shift,
  compound,
}) {
  if (USE_MOCK) {
    if (plantId !== "banmore") return mockDelay(EMPTY);
    const compoundKey = compound === "master" ? "master" : "final";
    const seriesByRange = MIXING_PRODUCTIVITY_TRENDS[compoundKey]?.[kpiId];
    if (!seriesByRange) return mockDelay(EMPTY);
    const effectiveRange = range === "custom" ? "month" : range;
    return mockDelay(seriesByRange[effectiveRange] ?? EMPTY);
  }
  const query = new URLSearchParams({ kpiId });
  if (section) query.set("section", toSectionValue(section));
  if (category) query.set("category", toCategoryValue(category));
  if (range) query.set("range", range);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const granularity = toGranularityValue(shift);
  if (granularity) query.set("granularity", granularity);
  if (compound) query.set("compound", compound);
  return client.get(`/plants/${plantId}/production/trends?${query.toString()}`);
}
