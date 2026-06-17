/**
 * Shared snapshot-date helpers for drill panels.
 *
 * Why this exists (journey.md §3, §15.6): every drill fetches Daily rows
 * over the selected window. For the "today" preset that window is a
 * trailing ~7 days (so sparklines have points), but the headline CARD
 * reads only the latest day's value (snapshot mode). A drill panel that
 * aggregates the whole window — summing minutes, summing counts, or even
 * averaging a week of percentages — will NOT reconcile with the card.
 *
 * Rule: in snapshot mode the drill must collapse to the single latest
 * available date and read each stored row VERBATIM. Only an explicit
 * custom range (aggregate mode) legitimately spans multiple days.
 */

/**
 * Normalise a row date to a sortable YYYYMMDD key, format-agnostic.
 * The gold layer ships dates either as ISO "yyyy-mm-dd" or as
 * "dd-mm-yyyy"; mirror the backend DATE_YYYYMMDD CASE so a plain string
 * max/compare is always correct regardless of which format arrives.
 */
export function dateKey(d) {
  if (typeof d !== "string") return "";
  // ISO yyyy-mm-dd → the 5th char is the first '-'.
  if (d.length >= 10 && d[4] === "-") {
    return d.slice(0, 4) + d.slice(5, 7) + d.slice(8, 10);
  }
  // dd-mm-yyyy → reorder to yyyymmdd.
  if (d.length >= 10 && d[2] === "-") {
    return d.slice(6, 10) + d.slice(3, 5) + d.slice(0, 2);
  }
  return d;
}

/**
 * In snapshot mode, return only the rows on the latest available date
 * (by `r.date`). In aggregate mode (or when mode is unknown), return the
 * rows unchanged so an explicit custom range still spans its full window.
 *
 * Pass an already-scoped array (filtered to one section / kpi / unit etc.)
 * so "latest date" is computed within that series, not across unrelated
 * rows.
 */
export function snapshotLatest(rows, mode) {
  if (!Array.isArray(rows) || rows.length === 0) return rows ?? [];
  if (mode === "aggregate") return rows;

  let maxKey = "";
  for (const r of rows) {
    const k = dateKey(r?.date);
    if (k > maxKey) maxKey = k;
  }
  if (!maxKey) return rows;
  return rows.filter((r) => dateKey(r?.date) === maxKey);
}

/**
 * Per-SERIES snapshot collapse for a heterogeneous drill-row array that
 * mixes many entities (different kpiName / machine / sku / category).
 * A single global "max date" would wrongly drop an entity whose latest
 * row is older than another's, so we compute the latest date PER series
 * key and keep only that series' newest rows.
 *
 * `keyFn` identifies one series; the default keys on the fields a drill
 * row exposes (toDrillRows shape). In aggregate mode the rows pass
 * through untouched so a custom range still spans its full window.
 */
export function snapshotLatestPerSeries(rows, mode, keyFn = drillSeriesKey) {
  if (!Array.isArray(rows) || rows.length === 0) return rows ?? [];
  if (mode === "aggregate") return rows;

  const maxByKey = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    const k = dateKey(r?.date);
    const cur = maxByKey.get(key);
    if (cur == null || k > cur) maxByKey.set(key, k);
  }
  return rows.filter((r) => dateKey(r?.date) === maxByKey.get(keyFn(r)));
}

function drillSeriesKey(r) {
  return [
    r?.kpiName ?? "",
    r?.machine ?? "",
    r?.itemCode ?? "",
    r?.productType ?? "",
    r?.remarks ?? "",
  ].join("||");
}
