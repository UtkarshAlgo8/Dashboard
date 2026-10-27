import client from "./client.js";

/**
 * CTP Quality (Process Audit) API client. The backend caches each answer in
 * Redis (10 min for open periods, 1 h for closed ones); this module keeps a
 * 2-minute browser copy so tab switches and back-clicks cost nothing, and
 * collapses concurrent identical requests into one.
 */

const CTP_QUALITY_CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map();
const pending = new Map();

function cachedGet(path, params) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== ""),
  ).toString();
  const url = query ? `${path}?${query}` : path;

  const hit = cache.get(url);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.data);
  const inflight = pending.get(url);
  if (inflight) return inflight;

  const promise = client
    .get(url)
    .then((data) => {
      cache.set(url, {
        data,
        expiresAt: Date.now() + CTP_QUALITY_CACHE_TTL_MS,
      });
      return data;
    })
    .finally(() => pending.delete(url));
  pending.set(url, promise);
  return promise;
}

/**
 * Landing cards, sparklines and every drill table for one period.
 * @param {{ tyre: "All"|"PCR"|"TBR", granularity: "DAY"|"MONTH"|"YEAR",
 *   date: string, shift?: "All"|"A"|"B"|"C" }} params
 */
export function getCtpProcessSummary({ tyre, granularity, date, shift }) {
  return cachedGet("/quality/ctp/process/summary", {
    tyre,
    granularity,
    date,
    shift: granularity === "DAY" ? shift : undefined,
  });
}

/**
 * One landing KPI over a date range (trend pop-up). Same argument shape as
 * the BTP `getProcessKpiHistory`, so the shared trend panel can call it.
 */
export function getCtpProcessTrend({
  kpiName,
  dateFrom,
  dateTo,
  shift,
  granularity,
  tyre,
}) {
  return cachedGet("/quality/ctp/process/trend", {
    kpi: kpiName,
    tyre,
    granularity,
    shift: granularity === "DAY" ? shift : undefined,
    date_from: dateFrom,
    date_to: dateTo,
  });
}

/** Newest audit day in the Process Audit gold. */
export function getCtpProcessAsOf() {
  return cachedGet("/quality/ctp/process/as-of", {});
}
