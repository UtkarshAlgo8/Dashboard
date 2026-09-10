import client from "./client.js";

const QUALITY_CACHE_TTL_MS = 5 * 60 * 1000;
const qualityCache = new Map();
const qualityPending = new Map();

function cachedQualityGet(url, ttlMs = QUALITY_CACHE_TTL_MS) {
  const now = Date.now();
  const hit = qualityCache.get(url);
  if (hit && hit.expiresAt > now) return Promise.resolve(hit.data);

  const pending = qualityPending.get(url);
  if (pending) return pending;

  const promise = client
    .get(url)
    .then((data) => {
      qualityCache.set(url, { data, expiresAt: Date.now() + ttlMs });
      return data;
    })
    .finally(() => {
      qualityPending.delete(url);
    });
  qualityPending.set(url, promise);
  return promise;
}

/**
 * Quality Dashboard API client (Backend FRD §1). Uses the shared axios
 * instance, so the base URL is VITE_API_BASE_URL and the response envelope
 * is unwrapped the same way as every other resource module.
 *
 * The backend reads the Excel gold workbook today (QUALITY_DATA_SOURCE=excel)
 * and the DB later — the frontend is identical across that switch.
 */

// Frontend Process card id → gold `kpi_name` (overall level). Only these
// three are backed by the gold layer; FTQ / Audit Deviation / Critical
// Parameter / SPR are "not_available" in the FRD (§1.6) and render as NA.
export const PROCESS_KPI_NAME = {
  pqr: "Plant_quality_rating_o",
  audit: "Plan_Compliance_o",
  mqv: "Total_Violations_o",
};

/**
 * Latest available date in the Quality gold rows (BRD §13.5 mirror). Unscoped
 * — Quality's workbook is plant-agnostic (Process rows label BTP, SPC rows
 * BANMORE), so a plant filter would undercount. Mirrors Production's `getAsOf`
 * shape.
 * @returns {Promise<{ asOf: string | null }>}
 */
export function getQualityAsOf() {
  return cachedQualityGet(`/quality/as-of`);
}

/**
 * Fetch the overall (_o) values for the supported Process cards in one call.
 * `shift` is the header value ("All" | "A" | "B" | "C"); the backend maps
 * All→DAY and A/B/C→SHIFT x (FRD §0.9).
 * @returns {Promise<{context:object, values:Record<string,number|null>}>}
 */
export function getProcessKpiValues({ date, shift = "All", granularity }) {
  const params = new URLSearchParams({
    plant: "BANMORE",
    date,
    shift,
    kpi_names: Object.values(PROCESS_KPI_NAME).join(","),
  });
  if (granularity) params.set("granularity", granularity);
  return cachedQualityGet(
    `/quality/process/kpi-value-batch?${params.toString()}`,
  );
}

export function getProcessSummary({ date, shift = "All", granularity }) {
  const params = new URLSearchParams({
    plant: "BANMORE",
    date,
    shift,
  });
  if (granularity) params.set("granularity", granularity);
  return cachedQualityGet(`/quality/process/summary?${params.toString()}`);
}

/**
 * Section/machine drill for a Process KPI family (FRD §1.2). Pass `section`
 * to drill from sections into that section's machines.
 * @returns {Promise<{context:object, group_by:string, rows:object[]}>}
 */
export function getProcessKpiChildren({
  kpiNames,
  date,
  shift = "All",
  granularity,
  section,
}) {
  const params = new URLSearchParams({
    plant: "BANMORE",
    date,
    shift,
    kpi_names: kpiNames.join(","),
  });
  if (granularity) params.set("granularity", granularity);
  if (section) params.set("section", section);
  return cachedQualityGet(`/quality/process/kpi-children?${params.toString()}`);
}

export function getProcessKpiHistory({
  kpiName,
  dateFrom,
  dateTo,
  shift = "All",
  granularity,
  section,
  machine,
}) {
  const params = new URLSearchParams({
    plant: "BANMORE",
    kpi_name: kpiName,
    date_from: dateFrom,
    date_to: dateTo,
    shift,
  });
  if (granularity) params.set("granularity", granularity);
  if (section) params.set("section", section);
  if (machine) params.set("machine", machine);
  return cachedQualityGet(`/quality/process/kpi-history?${params.toString()}`);
}

// The shift selects both the gold granularity row ("Shift A" vs "Day") and
// the silver time window, so every SPC endpoint needs it — not just detail.
export function getSpcSummary({ date, shift = "All", machine } = {}) {
  const params = new URLSearchParams({ plant: "BANMORE", shift });
  if (date) params.set("date", date);
  if (machine && machine !== "All") params.set("machine", machine);
  return cachedQualityGet(`/quality/spc/summary?${params.toString()}`);
}

export function getSpcFilterOptions({ date, shift = "All" } = {}) {
  const params = new URLSearchParams({ plant: "BANMORE", shift });
  if (date) params.set("date", date);
  return cachedQualityGet(`/quality/spc/filter-options?${params.toString()}`);
}

export function getSpcWidgets({ date, shift = "All", machine, recipe, headlineStatus } = {}) {
  const params = new URLSearchParams({ plant: "BANMORE", shift });
  if (date) params.set("date", date);
  if (machine && machine !== "All") params.set("machine", machine);
  if (recipe && recipe !== "All") params.set("recipe", recipe);
  if (headlineStatus && headlineStatus !== "All") {
    params.set("headline_status", headlineStatus);
  }
  return cachedQualityGet(`/quality/spc/widgets?${params.toString()}`);
}

export function getSpcDetail({
  date,
  shift = "All",
  machine,
  recipe,
  parameter,
}) {
  const params = new URLSearchParams({
    plant: "BANMORE",
    date,
    shift,
    machine,
    recipe,
    parameter,
  });
  return cachedQualityGet(`/quality/spc/detail?${params.toString()}`);
}
