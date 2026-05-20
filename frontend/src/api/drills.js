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
 * Fetch compound-wise Production drill rows (spec 07).
 * Phase 1 mock returns Banmore + Mixing only.
 *
 * @param {object} params
 * @param {string} params.plantId
 * @param {string} params.section - "mix" (Production drill exists for Mixing only in BRD)
 * @param {"master"|"final"} params.compound
 * @returns {Promise<Array>}
 */
export function getProductionDrill({ plantId, section, compound }) {
  if (USE_MOCK) {
    const key = `${plantId}/${section}`;
    const bucket = PRODUCTION_DRILL_BY_PLANT_SECTION[key];
    if (!bucket) return mockDelay([]);
    return mockDelay(bucket[compound] ?? []);
  }
  return client.get(
    `/plants/${plantId}/production/drills/production?section=${section}&compound=${compound}`,
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
