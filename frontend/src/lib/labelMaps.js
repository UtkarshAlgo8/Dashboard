/**
 * Frontend internal ID → gold_dummy column value translation.
 *
 * Internal React state still uses short IDs ("mix", "p", "a") because
 * the React tree, mock data, and routing all key off those. On the
 * WIRE we send the full gold_dummy column value so the backend
 * doesn't need a translation table — it just passes the value
 * through into the WHERE clause (with allow-list validation).
 *
 * See CR-07's "vocabulary" section: section / category / granularity
 * are the gold_dummy column names; values are the human strings the
 * data actually carries.
 */

/** `section` URL param. Internal ID → gold_dummy.section value. */
export const SECTION_BY_ID = {
  mix: "Mixing",
  stk: "Stock",
  tbm: "TBM",
  cur: "Curing",
};

/** `category` URL param. Internal tab ID → gold_dummy.category value. */
export const CATEGORY_BY_ID = {
  p: "Productivity",
  q: "Quality",
  c: "Cost",
  m: "Morale",
  s: "Safety",
  // i intentionally omitted — Inventory tab is Phase 2; the api/kpis
  // route short-circuits before any backend call.
};

/**
 * `granularity` URL param. Internal shift ID → gold_dummy.granularity
 * value. `"all"` is intentionally absent — when the user picks "All
 * Shifts" we omit the query param so no granularity predicate is
 * emitted.
 */
export const GRANULARITY_BY_SHIFT = {
  daily: "Daily",
  a: "Shift A",
  b: "Shift B",
  c: "Shift C",
};

/** Convenience: convert internal section ID, falling back to the raw value. */
export const toSectionValue = (id) => SECTION_BY_ID[id] ?? id;
export const toCategoryValue = (id) => CATEGORY_BY_ID[id] ?? id;
/** Returns `undefined` when shift is "all" — caller skips the param. */
export const toGranularityValue = (id) => GRANULARITY_BY_SHIFT[id];
