import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import {
  OEE_DRILL_BY_PLANT_SECTION,
  PRODUCTION_DRILL_BY_PLANT_SECTION,
  SCRAP_TRACEABILITY,
  DOWNTIME_DRILL_BY_PLANT_SECTION,
  PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION,
} from "@/lib/mockData.js";
import { toSectionValue, toGranularityValue } from "@/lib/labelMaps.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

const EMPTY_OEE = { overall: null, machines: [], subDrill: {} };

/**
 * Append optional `from`, `to`, `granularity` params. Translates the
 * internal shift id (e.g. "a") into the gold_dummy value
 * ("Shift A") before writing the URL. Skips empty/null values so
 * the URL stays compact when no filter is active.
 */
function appendTimeShift(query, { from, to, shift } = {}) {
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const granularity = toGranularityValue(shift);
  if (granularity) query.set("granularity", granularity);
}

/**
 * Fetch the OEE drill for a given (plant, section) slice.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section - "mix" | "tbm" | "cur" | "stk"
 * @param {string} [params.from]    ISO yyyy-mm-dd
 * @param {string} [params.to]      ISO yyyy-mm-dd
 * @param {string} [params.shift]   "all" | "daily" | "a" | "b" | "c"
 */
export function getOeeDrill({ plantId, section, from, to, shift }) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}`;
    return mockDelay(OEE_DRILL_BY_PLANT_SECTION[key] ?? EMPTY_OEE);
  }
  const query = new URLSearchParams({ section: toSectionValue(section) });
  appendTimeShift(query, { from, to, shift });
  return client.get(
    `/plants/${plantId}/production/drills/oee?${query.toString()}`,
  );
}

/**
 * Fetch the Production drill bucket for a (plant, section) slice.
 * Returns the raw sub-selector keyed object — the drill panel picks
 * the right sub-array based on the section's UX (compound for Mixing,
 * tyre family for TBM/Curing, category for Stock).
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section
 * @param {string} [params.stockSelector]
 * @param {string} [params.from]
 * @param {string} [params.to]
 * @param {string} [params.shift]
 */
export function getProductionDrill({
  plantId,
  section,
  stockSelector,
  from,
  to,
  shift,
}) {
  if (USE_MOCK) {
    const key =
      section === "stk"
        ? `${plantId}/${section}/${stockSelector ?? "4roll"}`
        : `${plantId}/${section}`;
    return mockDelay(PRODUCTION_DRILL_BY_PLANT_SECTION[key] ?? {});
  }
  const query = new URLSearchParams({ section: toSectionValue(section) });
  if (section === "stk" && stockSelector)
    query.set("stockSelector", stockSelector);
  appendTimeShift(query, { from, to, shift });
  return client.get(
    `/plants/${plantId}/production/drills/production?${query.toString()}`,
  );
}

/**
 * Fetch Production ID-level traceability for a scrap entry (spec 08).
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section
 * @param {string} params.machineId
 * @param {string} params.itemCode
 * @param {string} [params.from]
 * @param {string} [params.to]
 */
export function getScrapTraceability({
  plantId,
  section,
  machineId,
  itemCode,
  from,
  to,
}) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}/${machineId}/${itemCode}`;
    return mockDelay(SCRAP_TRACEABILITY[key] ?? []);
  }
  const query = new URLSearchParams({
    section: toSectionValue(section),
    machine: machineId,
    itemCode,
  });
  appendTimeShift(query, { from, to });
  return client.get(
    `/plants/${plantId}/production/drills/scrap-traceability?${query.toString()}`,
  );
}

/**
 * Fetch the Downtime drill (spec 09) per BRD FR-P60.
 */
export function getDowntimeDrill({ plantId, section, from, to, shift }) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}`;
    return mockDelay(DOWNTIME_DRILL_BY_PLANT_SECTION[key] ?? []);
  }
  const query = new URLSearchParams({ section: toSectionValue(section) });
  appendTimeShift(query, { from, to, shift });
  return client.get(
    `/plants/${plantId}/production/drills/downtime?${query.toString()}`,
  );
}

const EMPTY_PLAN_COMPLIANCE = { skuWise: [], machineWise: [] };

/**
 * Fetch the Plan Compliance drill (spec 09) per BRD FR-P61.
 */
export function getPlanComplianceDrill({ plantId, section, from, to, shift }) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}`;
    return mockDelay(
      PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION[key] ?? EMPTY_PLAN_COMPLIANCE,
    );
  }
  const query = new URLSearchParams({ section: toSectionValue(section) });
  appendTimeShift(query, { from, to, shift });
  return client.get(
    `/plants/${plantId}/production/drills/plan-compliance?${query.toString()}`,
  );
}
