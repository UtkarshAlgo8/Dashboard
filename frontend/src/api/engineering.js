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
 * The backend serves the live gold table (ENGINEERING_DATA_SOURCE=db) and
 * the Excel workbook as a local escape hatch — the frontend is identical
 * across that switch, and both now carry every Reliability KPI at DAY and
 * MONTH grain. Only Banmore (BTP) ships Engineering today, so `plant` is
 * hardcoded rather than threaded through from the caller.
 *
 * `granularity` defaults to "MONTH" here and on the backend: a MONTH row is
 * published for every KPI, dated the 1st of its month, and the running
 * month's row is kept up to date day by day. Pass "DAY" with a full ISO
 * date for a single day.
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
export function getReliabilitySummary({
  date,
  from,
  to,
  granularity = "MONTH",
}) {
  // A single `date` reads the published `_Overall` row at `granularity` —
  // this is the path every period the UI offers takes, including a whole
  // month (its MONTH row IS the rollup).
  //
  // `from`/`to` are the escape hatch for an ARBITRARY range that is not a
  // whole calendar month: the backend then rebuilds the four headline KPIs
  // from machine-level DAY components, because MTBF/MTTR/Breakdown % are
  // rates and cannot be summed or averaged. Nothing in the UI sends them
  // today; they stay because the endpoint supports them.
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
  // Optional window. With `granularity: "DAY"` it turns a level keyed by
  // `remarks,date` into the date-wise Failure table: one row per (failure,
  // day) across the month, instead of one row per failure for the month.
  from,
  to,
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
  // The plot drills show the 'Unmapped' bucket (grey); everything else hides it.
  includeUnmapped = false,
  // Drop Gold's zero-valued rows server-side, for callers that ignore them.
  nonZero = false,
}) {
  const params = withScope({
    kpi_names: kpiNames.join(","),
    date,
    date_from: from,
    date_to: to,
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
    include_unmapped: includeUnmapped ? "1" : null,
    nonzero: nonZero ? "1" : null,
  });
  return cachedEngineeringGet(
    `/engineering/reliability/kpi-children?${params}`,
  );
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
 * `granularity` defaults to null/omitted from the query string, which the
 * backend resolves to MONTH. Pass "DAY" for the Zero-Breakdown panels,
 * which track a running as-of day rather than the selected report period.
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
export function getEngineeringLossTree({
  date,
  from,
  to,
  granularity = "MONTH",
}) {
  // As with the summary: `date` + `granularity` reads published rows (a
  // month included). `from`/`to` sum the DAY rows of an arbitrary range —
  // valid here without recomputation, since lost time is additive.
  const params = withScope({ date, date_from: from, date_to: to, granularity });
  return cachedEngineeringGet(`/engineering/reliability/loss-tree?${params}`);
}

/**
 * Zero Breakdown Machines: distinct machines with DaysWithoutBreakdown_m > 30
 * on the last complete DAY, plus the per-day series.
 * @returns {Promise<{min_days:number, date:string|null, count:number|null, series:Array<{date:string, machines:number, count:number}>}>}
 */
export function getReliabilityZeroBreakdownCount() {
  return cachedEngineeringGet(
    `/engineering/reliability/zero-breakdown-count?${withScope()}`,
  );
}
