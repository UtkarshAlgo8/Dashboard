import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import {
  OEE_DRILL_BY_PLANT_SECTION,
  PRODUCTION_DRILL_BY_PLANT_SECTION,
  SCRAP_TRACEABILITY,
  DOWNTIME_DRILL_BY_PLANT_SECTION,
  PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION,
} from "@/lib/mockData.js";

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

/**
 * Fetch the Production drill bucket for a (plant, section) slice.
 * Returns the raw sub-selector keyed object — the drill panel picks
 * the right sub-array based on the section's UX (compound for Mixing,
 * tyre family for TBM/Curing, category for Stock).
 *
 * For Stock the lookup key includes the stockSelector segment because
 * each sub-selector exposes its own category list.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section - "mix" | "tbm" | "cur" | "stk"
 * @param {string} [params.stockSelector] - required for section "stk"
 * @returns {Promise<Record<string, Array>>}
 */
export function getProductionDrill({ plantId, section, stockSelector }) {
  if (USE_MOCK) {
    const key =
      section === "stk"
        ? `${plantId}/${section}/${stockSelector ?? "4roll"}`
        : `${plantId}/${section}`;
    return mockDelay(PRODUCTION_DRILL_BY_PLANT_SECTION[key] ?? {});
  }
  const query =
    section === "stk" && stockSelector ? `&stockSelector=${stockSelector}` : "";
  return client.get(
    `/plants/${plantId}/production/drills/production?section=${section}${query}`,
  );
}

/**
 * Fetch Production ID-level traceability for a scrap entry (spec 08).
 * Returns [] when the (machine, itemCode) pair has no traceability
 * data configured.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section
 * @param {string} params.machineId
 * @param {string} params.itemCode
 * @returns {Promise<Array>}
 */
export function getScrapTraceability({
  plantId,
  section,
  machineId,
  itemCode,
}) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}/${machineId}/${itemCode}`;
    return mockDelay(SCRAP_TRACEABILITY[key] ?? []);
  }
  return client.get(
    `/plants/${plantId}/production/drills/scrap-traceability?section=${section}&machine=${machineId}&itemCode=${encodeURIComponent(itemCode)}`,
  );
}

/**
 * Fetch the Downtime drill (spec 09) per BRD FR-P60.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section
 * @returns {Promise<Array>}
 */
export function getDowntimeDrill({ plantId, section }) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}`;
    return mockDelay(DOWNTIME_DRILL_BY_PLANT_SECTION[key] ?? []);
  }
  return client.get(
    `/plants/${plantId}/production/drills/downtime?section=${section}`,
  );
}

const EMPTY_PLAN_COMPLIANCE = { skuWise: [], machineWise: [] };

/**
 * Fetch the Plan Compliance drill (spec 09) per BRD FR-P61. Returns
 * both views; consumer toggles client-side.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section
 * @returns {Promise<{ skuWise: Array, machineWise: Array }>}
 */
export function getPlanComplianceDrill({ plantId, section }) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}`;
    return mockDelay(
      PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION[key] ?? EMPTY_PLAN_COMPLIANCE,
    );
  }
  return client.get(
    `/plants/${plantId}/production/drills/plan-compliance?section=${section}`,
  );
}
