import client from "./client.js";

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
 * Fetch the overall (_o) values for the supported Process cards in one call.
 * `shift` is the header value ("All" | "A" | "B" | "C"); the backend maps
 * All→DAY and A/B/C→SHIFT x (FRD §0.9).
 * @returns {Promise<{context:object, values:Record<string,number|null>}>}
 */
export function getProcessKpiValues({ date, shift = "All" }) {
  const params = new URLSearchParams({
    plant: "BANMORE",
    date,
    shift,
    kpi_names: Object.values(PROCESS_KPI_NAME).join(","),
  });
  return client.get(`/quality/process/kpi-value-batch?${params.toString()}`);
}

/**
 * Section/machine drill for a Process KPI family (FRD §1.2). Pass `section`
 * to drill from sections into that section's machines.
 * @returns {Promise<{context:object, group_by:string, rows:object[]}>}
 */
export function getProcessKpiChildren({ kpiNames, date, shift = "All", section }) {
  const params = new URLSearchParams({
    plant: "BANMORE",
    date,
    shift,
    kpi_names: kpiNames.join(","),
  });
  if (section) params.set("section", section);
  return client.get(`/quality/process/kpi-children?${params.toString()}`);
}

export function getSpcSummary({ date, machine } = {}) {
  const params = new URLSearchParams({ plant: "BANMORE" });
  if (date) params.set("date", date);
  if (machine && machine !== "All") params.set("machine", machine);
  return client.get(`/quality/spc/summary?${params.toString()}`);
}

export function getSpcFilterOptions({ date } = {}) {
  const params = new URLSearchParams({ plant: "BANMORE" });
  if (date) params.set("date", date);
  return client.get(`/quality/spc/filter-options?${params.toString()}`);
}

export function getSpcWidgets({ date, machine, recipe, headlineStatus } = {}) {
  const params = new URLSearchParams({ plant: "BANMORE" });
  if (date) params.set("date", date);
  if (machine && machine !== "All") params.set("machine", machine);
  if (recipe && recipe !== "All") params.set("recipe", recipe);
  if (headlineStatus && headlineStatus !== "All") {
    params.set("headline_status", headlineStatus);
  }
  return client.get(`/quality/spc/widgets?${params.toString()}`);
}

export function getSpcDetail({ date, shift = "All", machine, recipe, parameter }) {
  const params = new URLSearchParams({
    plant: "BANMORE",
    date,
    shift,
    machine,
    recipe,
    parameter,
  });
  return client.get(`/quality/spc/detail?${params.toString()}`);
}
