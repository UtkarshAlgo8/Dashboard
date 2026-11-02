import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";
import {
  PLANTS,
  FUNCTIONS,
  SECTIONS,
  CATEGORY_TABS,
  PLANT_SUMMARIES,
  ENGINEERING_OVERALL_KPIS,
  ENGINEERING_RELIABILITY_KPIS,
  ENGINEERING_MAINTENANCE_KPIS,
  ENGINEERING_UTILITIES_KPIS,
  ENGINEERING_PROJECTS_KPIS,
  ENGINEERING_OPS_KPIS,
} from "@/lib/mockData.js";

const ENGINEERING_KPIS_BY_TAB = {
  overall: ENGINEERING_OVERALL_KPIS,
  reliability: ENGINEERING_RELIABILITY_KPIS,
  maintenance: ENGINEERING_MAINTENANCE_KPIS,
  utilities: ENGINEERING_UTILITIES_KPIS,
  projects: ENGINEERING_PROJECTS_KPIS,
  ops: ENGINEERING_OPS_KPIS,
};

// Phase 1 default is mock data (Q-BE-01). Only the explicit string
// "false" disables it — handles the case where no .env file exists
// and the var is undefined.
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

/**
 * Plant list for the landing page (one card per plant, with the
 * per-plant landing KPIs). CR-10: now optionally time-range aware —
 * pass `{ range, from, to }` to scope Cured Tire Production and
 * Scrap Percentage. OEE / OTIF / Yield stay current-snapshot.
 *
 * `part` asks for half of the KPIs: "counts" (Cured Tire Production,
 * Scrap) or "snapshot" (OEE / OTIF / Yield). Omit it for both.
 *
 * @param {{ range?: string, from?: string, to?: string, part?: "counts" | "snapshot" }} [timeRange]
 * @returns {Promise<typeof PLANTS>}
 */
export function getPlants(timeRange = {}) {
  if (USE_MOCK) return mockDelay(PLANTS);
  const rangeVal =
    typeof timeRange.range === "object" && timeRange.range !== null
      ? (timeRange.range.preset ?? "today")
      : (timeRange.range ?? "today");
  const q = buildQuery({
    range: rangeVal,
    from: timeRange.from ?? "",
    to: timeRange.to ?? "",
    part: timeRange.part,
  });
  return client.get(`/plants${q}`);
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

/**
 * Production-dashboard sections (Mixing / TBM / Curing / Stock).
 * Static for Phase 1 — same set regardless of plant.
 *
 * @returns {Promise<typeof SECTIONS>}
 */
export function getSections() {
  if (USE_MOCK) return mockDelay(SECTIONS);
  return client.get("/sections");
}

/**
 * Production-dashboard category tabs (P/Q/C/D/M/S/I). Static.
 *
 * @returns {Promise<typeof CATEGORY_TABS>}
 */
export function getCategoryTabs() {
  if (USE_MOCK) return mockDelay(CATEGORY_TABS);
  return client.get("/category-tabs");
}

/**
 * Plant-card summary (overall OEE, production %, scrap %) for the
 * Production dashboard sidebar.
 *
 * @param {string} plantId
 * @returns {Promise<{ prodPct: number, scrapPct: number } | null>}
 */
export function getPlantSummary(plantId, from = null, to = null) {
  if (USE_MOCK) return mockDelay(PLANT_SUMMARIES[plantId] ?? null);
  const q = buildQuery({ from, to });
  return client.get(`/plants/${plantId}/summary${q}`);
}

/**
 * As-of date — the latest available data date (ISO yyyy-mm-dd). The
 * dashboard anchors Today / MTD / YTD windows to this instead of the
 * system clock (BRD §13.5). Mock returns the latest date present in the
 * v24 gold export.
 *
 * @param {string} plantId
 * @returns {Promise<{ asOf: string | null }>}
 */
export function getAsOf(plantId) {
  if (USE_MOCK) return mockDelay({ asOf: "2026-05-14" });
  return client.get(`/plants/${plantId}/as-of`);
}

/**
 * Latest OVERALL OEE per section (for the sidebar donut rings) plus its
 * Availability / Performance / Quality breakdown (for the hover tooltip),
 * keyed by gold section name: { Mixing, Stock, TBM, Curing }. Each value is
 * { oee, availability, performance, quality } (each a number or absent).
 * Optional granularity (Daily / MTD / YTD / Shift A-C).
 *
 * @param {string} plantId
 * @param {string} [granularity]
 * @returns {Promise<Record<string, { oee: number, availability?: number, performance?: number, quality?: number }>>}
 */
export function getSectionOee(plantId, granularity, from = null, to = null) {
  if (USE_MOCK) {
    return mockDelay({
      Mixing: {
        oee: 84.9,
        availability: 88.4,
        performance: 96.7,
        quality: 99.5,
      },
      Stock: {
        oee: 80.2,
        availability: 85.1,
        performance: 94.8,
        quality: 99.3,
      },
      TBM: { oee: 82.6, availability: 87.2, performance: 95.1, quality: 99.6 },
      Curing: {
        oee: 86.1,
        availability: 90.0,
        performance: 96.2,
        quality: 99.7,
      },
    });
  }
  const q = buildQuery({ granularity, from, to });
  return client.get(`/plants/${plantId}/section-oee${q}`);
}

/**
 * Engineering Head dashboard KPI set for a given tab (spec 16). Returns
 * `[]` for any plant other than Banmore — Phase 2 ships Banmore only.
 *
 * @param {string} plantId
 * @param {string} tabId - One of ENGINEERING_TABS' `id` values.
 * @returns {Promise<Array<{id: string, name: string, value: number, unit: string, target: number, status: string}>>}
 */
export function getEngineeringKpis(plantId, tabId) {
  if (plantId !== "banmore") return mockDelay([]);
  // TEMP: backend has no /engineering-kpis route yet (Phase 2, unbuilt
  // server-side) — force mock regardless of USE_MOCK until it ships.
  // Restore the USE_MOCK / client.get(`/plants/${plantId}/engineering-kpis`)
  // branch (see git history) once the backend route exists.
  return mockDelay(ENGINEERING_KPIS_BY_TAB[tabId] ?? []);
}

/** Build a `?a=1&b=2` query string from defined, non-empty values. */
function buildQuery(params) {
  const pairs = Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}
