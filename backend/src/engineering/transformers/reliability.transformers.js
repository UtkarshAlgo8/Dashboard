/**
 * Row → response transformers for the Engineering Reliability tab
 * (spec 16/17). The DB/excel rows arrive already sentinel-normalized
 * (loader), but "no row" is applied here: a missing row always means
 * "nothing to measure" → `null` ("—" in the UI). Unlike Quality, there is
 * no zero-fill counter concept for Engineering — never invent a 0.
 * Values are echoed as stored; nothing is computed except this gap rule.
 */
import { parseDrillDown, valueOrNull } from "../normalize.js";

/**
 * kpi-value-batch: maps each requested kpi_name to its stored Overall-level
 * value. Absent → null, always.
 */
export function toKpiValueBatch(rows, kpiNames) {
  const byName = new Map(rows.map((r) => [r.kpi_name, r]));
  const out = {};
  for (const name of kpiNames) {
    const row = byName.get(name);
    out[name] = row ? valueOrNull(row.actual_value) : null;
  }
  return out;
}

/* ----------------------------------------------------------------- *
 * Group keys                                                        *
 * ----------------------------------------------------------------- */

// A `group_by` may name SEVERAL dimensions ("machine,remarks") — the
// Breakdown Pareto's "Machine × Phenomenon" lens, where one row is one
// (machine, failure) pair. One dimension is the ordinary case and reads as a
// one-element list, so both paths share this code.
const GROUP_KEY_SEP = "\u241F"; // ␟ — a separator no dimension value carries.

/** "machine,remarks" -> ["machine", "remarks"]. */
function groupDims(groupBy) {
  return String(groupBy)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The composite key of a row's group, or null when any dimension is empty —
 * a row missing part of its key does not belong to a group and is dropped,
 * rather than collapsing into a blank-labelled one.
 */
function groupKeyOf(row, dims) {
  const parts = [];
  for (const dim of dims) {
    const v = row[dim];
    if (v == null || v === "") return null;
    parts.push(String(v));
  }
  return parts.join(GROUP_KEY_SEP);
}

/** Spread a composite key back into one field per dimension. */
function keyToDims(key, dims) {
  const parts = key.split(GROUP_KEY_SEP);
  const out = {};
  dims.forEach((dim, i) => {
    out[dim] = parts[i];
  });
  return out;
}

// Display-only columns carried forward from the anchor row of each group —
// useful to the frontend for rendering without a second round trip (e.g. the
// Top Machine Breakdowns table wants `section`/`status` alongside `machine`).
const CARRY_FORWARD_DIMS = [
  "status",
  "section",
  "sub_section",
  "remarks",
  "unit_of_measurement",
];

/**
 * kpi-children: pivots flat rows into one row per group (whichever
 * dimension — or comma-separated dimensions — `groupBy` names at this drill
 * level), JOINing the requested
 * kpi_names as sibling columns. Valid when the scope filters already pin
 * every OTHER dimension to a single value, so each group has at most one
 * row per kpi_name (true for Breakdown/MTBF/MTTR/Top-Machine/Zero-
 * Breakdown — NOT for Loss Tree, which never pins status/section; see
 * `toLossTree` below for that family).
 *
 * @param {Array} rows
 * @param {{ kpiNames: string[], groupBy: string }} opts
 */
export function toKpiChildren(rows, { kpiNames, groupBy }) {
  const dims = groupDims(groupBy);
  // Preserve first-seen order of groups.
  const keys = [];
  const seen = new Set();
  const keyByRow = new Map();
  for (const r of rows) {
    const key = groupKeyOf(r, dims);
    keyByRow.set(r, key);
    if (key != null && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  const anchor = kpiNames[0]; // drill anchor = the clicked/primary base
  const outRows = keys.map((key) => {
    const scopeRows = rows.filter((r) => keyByRow.get(r) === key);
    const out = keyToDims(key, dims);
    for (const name of kpiNames) {
      const row = scopeRows.find((r) => r.kpi_name === name);
      out[name] = row ? valueOrNull(row.actual_value) : null;
    }
    const anchorRow = scopeRows.find((r) => r.kpi_name === anchor) ?? scopeRows[0];
    out.drill_down = parseDrillDown(anchorRow?.drill_down_attribute);
    for (const dim of CARRY_FORWARD_DIMS) {
      if (dims.includes(dim)) continue;
      if (anchorRow && anchorRow[dim] != null) out[dim] = anchorRow[dim];
    }
    return out;
  });
  return { group_by: groupBy, rows: outRows };
}

/**
 * Loss Tree children: SUMs `actual_value` per kpi_name within each group
 * instead of joining one row — the Loss Tree family (LostTime_ and
 * Occurrences_ kpi_names) never pins status/section, so a group can span several
 * rows that must be added together (confirmed against the real Aug totals:
 * summing ALL status/section rows per product_type reproduces the plain
 * 5-category loss figures).
 *
 * A kpi_name with zero contributing rows in a group stays `null` (absent),
 * never a fabricated 0 — the same gap rule as everywhere else here.
 *
 * Also the Breakdown Pareto's path: `groupBy` may name several dimensions
 * ("machine,remarks"), and a (machine, failure) pair spans one row per
 * sub_section, so those rows must be added together too.
 *
 * @param {Array} rows
 * @param {{ kpiNames: string[], groupBy: string }} opts
 */
export function toLossTree(rows, { kpiNames, groupBy }) {
  const dims = groupDims(groupBy);
  const sums = new Map(); // group key -> { kpiName: number }
  const order = [];
  const keyByRow = new Map();
  for (const r of rows) {
    const key = groupKeyOf(r, dims);
    keyByRow.set(r, key);
    if (key == null || !kpiNames.includes(r.kpi_name)) continue;
    if (!sums.has(key)) {
      sums.set(key, {});
      order.push(key);
    }
    const v = valueOrNull(r.actual_value);
    if (v == null) continue;
    const bucket = sums.get(key);
    bucket[r.kpi_name] = (bucket[r.kpi_name] ?? 0) + v;
  }
  const outRows = order.map((key) => {
    const bucket = sums.get(key);
    const out = keyToDims(key, dims);
    for (const name of kpiNames) out[name] = bucket[name] ?? null;
    const anchorRow = rows.find(
      (r) => keyByRow.get(r) === key && r.kpi_name === kpiNames[0],
    );
    out.drill_down = parseDrillDown(anchorRow?.drill_down_attribute);
    return out;
  });
  return { group_by: groupBy, rows: outRows };
}

/**
 * Period summary: rebuilds the four headline cards for a multi-day range
 * from the summed machine-level components (see COMPONENT_KPIS).
 *
 * Returns the SAME four `_Overall` keys a single-day summary returns, so the
 * card grid needs no knowledge of which path produced them.
 *
 * Gap rule, unchanged from everywhere else here — a figure that cannot be
 * measured is null, never a fabricated 0:
 *   - no scheduled minutes at all  → Breakdown % is null (nothing ran)
 *   - zero breakdowns in a period  → MTBF/MTTR are null, NOT 0. A mean time
 *     between failures is undefined when there were no failures; 0 would
 *     read as "fails constantly", the exact opposite of the truth.
 *     Breakdown minutes are legitimately 0 in that case.
 */
export function toAggregatedSummary(rows) {
  const totals = {};
  for (const r of rows ?? []) {
    // `component_sum`, not `total` — the latter is a reserved word in alasql.
    const raw = r.component_sum ?? r.COMPONENT_SUM ?? r["SUM(actual_value)"] ?? null;
    const v = valueOrNull(raw);
    if (typeof v === "number") totals[r.kpi_name] = v;
  }
  const breakdownMin = totals.BreakdownMin_m ?? null;
  const occurrences = totals.BreakdownOcc_m ?? null;
  const operatingMin = totals.OperatingMin_m ?? null;
  const scheduledMin = totals.ScheduledMin_m ?? null;

  // Scheduled minutes exist for every machine that ran, breakdown rows only
  // for machines that actually broke — so a period with no breakdowns still
  // has a denominator, and 0 minutes lost is a real measurement.
  const measured = scheduledMin != null && scheduledMin > 0;
  const lostMin = breakdownMin ?? (measured ? 0 : null);

  return {
    Breakdown_Pct_Overall: measured ? (lostMin / scheduledMin) * 100 : null,
    BreakdownMin_Overall: lostMin,
    MTBF_Overall: occurrences ? operatingMin / occurrences : null,
    MTTR_Overall: occurrences ? lostMin / occurrences : null,
  };
}

/** kpi-history: ordered {date, value} points for a trend modal line chart. */
export function toKpiHistory(rows) {
  return {
    points: rows.map((r) => ({
      date: r.date,
      value: valueOrNull(r.actual_value),
    })),
  };
}

/**
 * latest-date: the most recent date among the returned rows, as a plain ISO
 * string (or null).
 *
 * The max is taken HERE rather than trusted from SQL ordering: alasql does
 * not reliably honour `ORDER BY date DESC` on a GROUPed string column (it
 * returned the earliest qualifying month, not the latest), the same class of
 * quirk that made `MAX(date)` unusable on that engine. Dates are ISO
 * `YYYY-MM-DD`, so a lexicographic max is a chronological max, and this is
 * correct whether the query returned one pre-sorted row or many unsorted.
 */
export function toLatestDate(rows) {
  const dates = [];
  for (const row of rows ?? []) {
    const raw = row.max_date ?? row.MAX_date ?? row["MAX(date)"] ?? null;
    if (raw == null) continue;
    const iso = String(raw).slice(0, 10);
    if (!dates.includes(iso)) dates.push(iso);
  }
  // Newest first. `dates` is every period that qualified — the multi-KPI
  // form returns one row per complete period, so this doubles as the list of
  // selectable periods for the header's picker (the live feed is daily, so
  // there is no month to pick from).
  dates.sort().reverse();
  return { date: dates[0] ?? null, dates };
}
