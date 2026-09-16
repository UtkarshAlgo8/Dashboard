import client from "./client.js";

const ENGINEERING_CACHE_TTL_MS = 5 * 60 * 1000;
const engineeringCache = new Map();
const engineeringPending = new Map();

function cachedEngineeringGet(url, ttlMs = ENGINEERING_CACHE_TTL_MS) {
  const now = Date.now();
  const hit = engineeringCache.get(url);
  if (hit && hit.expiresAt > now) return Promise.resolve(hit.data);

  const pending = engineeringPending.get(url);
  if (pending) return pending;

  const promise = client
    .get(url)
    .then((data) => {
      engineeringCache.set(url, { data, expiresAt: Date.now() + ttlMs });
      return data;
    })
    .finally(() => {
      engineeringPending.delete(url);
    });
  engineeringPending.set(url, promise);
  return promise;
}

/**
 * Engineering (Overview + Reliability tabs) API client (spec 16/17). Uses
 * the shared axios instance, so the base URL is VITE_API_BASE_URL and the
 * response envelope is unwrapped the same way as every other resource
 * module. Mirrors api/quality.js's shape.
 *
 * The backend reads the Excel gold workbook today
 * (ENGINEERING_DATA_SOURCE=excel) and the DB later — the frontend is
 * identical across that switch. Only Banmore (BTP) ships Engineering today,
 * so `plant` is hardcoded rather than threaded through from the caller.
 */

function withScope(params = {}) {
  const usp = new URLSearchParams({ plant: "BTP" });
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") usp.set(k, v);
  }
  return usp;
}

/**
 * Overview/Reliability summary cards (Breakdown %, Breakdown Minutes, MTBF,
 * MTTR) in one round trip.
 * @returns {Promise<{context:object, values:Record<string,number|null>}>}
 */
export function getReliabilitySummary({ date, from, to, granularity = "MONTH" }) {
  // A range (from/to) makes the backend REBUILD the four headline KPIs from
  // machine-level components — MTBF/MTTR/Breakdown % are rates and cannot be
  // summed or averaged across days. A single `date` reads the published row.
  const params = withScope({ date, date_from: from, date_to: to, granularity });
  return cachedEngineeringGet(`/engineering/reliability/summary?${params}`);
}

/**
 * The one generic drill endpoint — every level of Breakdown %/Min, MTBF,
 * MTTR, Top Machine Breakdowns, Zero Breakdown Machines, and Loss Tree
 * (levels 2-4, pass `agg: "sum"`) goes through this.
 * @returns {Promise<{context:object, group_by:string, rows:object[]}>}
 */
export function getReliabilityKpiChildren({
  kpiNames,
  date,
  granularity = "MONTH",
  groupBy,
  status,
  section,
  machine,
  subSection,
  productType,
  sort,
  order,
  limit,
  agg,
}) {
  const params = withScope({
    kpi_names: kpiNames.join(","),
    date,
    granularity,
    group_by: groupBy,
    status,
    section,
    machine,
    sub_section: subSection,
    product_type: productType,
    sort,
    order,
    limit,
    agg,
  });
  return cachedEngineeringGet(`/engineering/reliability/kpi-children?${params}`);
}

/**
 * MONTH series (Jan-Sep) for a card's trend modal.
 * @returns {Promise<{context:object, points:Array<{date:string, value:number|null}>}>}
 */
export function getReliabilityKpiHistory({
  kpiName,
  dateFrom,
  dateTo,
  granularity = "MONTH",
  status,
  section,
  machine,
  subSection,
}) {
  const params = withScope({
    kpi_name: kpiName,
    date_from: dateFrom,
    date_to: dateTo,
    granularity,
    status,
    section,
    machine,
    sub_section: subSection,
  });
  return cachedEngineeringGet(`/engineering/reliability/kpi-history?${params}`);
}

/**
 * Latest available date for a kpi_name/granularity (used to resolve the
 * latest DAY for the two Zero-Breakdown KPIs before drawing that card, and
 * by the page shell to resolve its default period/granularity on mount).
 *
 * `granularity` defaults to null/omitted from the query string — the
 * backend's `resolveGranularity` then applies its own mode-aware default
 * (MONTH under excel, DAY under db). Pass an explicit granularity when the
 * caller needs a specific one regardless of data-source mode.
 * @returns {Promise<{context:object, date:string|null}>}
 */
export function getReliabilityLatestDate({
  kpiName,
  kpiNames,
  granularity = null,
}) {
  const params = withScope({
    kpi_name: kpiName,
    // Plural = "latest date where ALL of these have a value", i.e. the last
    // COMPLETE period. The ETL publishes the running day incrementally, so a
    // single-KPI anchor can land on a day where only that one KPI exists.
    kpi_names: kpiNames?.length ? kpiNames.join(",") : null,
    granularity,
  });
  return cachedEngineeringGet(`/engineering/reliability/latest-date?${params}`);
}

/**
 * Loss Tree L1 (pie): the 5 loss categories, summed across all
 * status/section rows.
 * @returns {Promise<{context:object, group_by:string, rows:object[]}>}
 */
export function getEngineeringLossTree({ date, from, to, granularity = "MONTH" }) {
  // Lost time is additive, so a range simply sums the days.
  const params = withScope({ date, date_from: from, date_to: to, granularity });
  return cachedEngineeringGet(`/engineering/reliability/loss-tree?${params}`);
}
