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
 * A `group_by` is one dimension ("machine") or a comma-separated tuple of
 * them ("remarks,date"). The tuple form is what the date-wise Failure level
 * reads: one row per (failure, day) over a month of DAY rows, so the drill
 * can show WHEN each failure happened instead of only its monthly total.
 *
 * @param {string} groupBy
 * @returns {string[]}
 */
function groupDims(groupBy) {
  return String(groupBy)
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

// Key for a row's group. A row missing ANY part of the key belongs to no
// group and is dropped — never bucketed under a blank, which would silently
// merge unrelated measurements into one line.
const KEY_SEP = "\u0000";

function groupKey(row, dims) {
  const parts = dims.map((d) => {
    const v = row[d];
    // A `date` key is the DAY, not the instant: the feed writes some rows as
    // "2026-08-04" and some as "2026-08-04 00:00:00", and ungrouped those
    // would be two lines for one day. Same ISO slice `toLatestDate` takes.
    return d === "date" && v != null ? String(v).slice(0, 10) : v;
  });
  if (parts.some((v) => v == null || v === "")) return null;
  return parts.join(KEY_SEP);
}

/**
 * kpi-children: pivots flat rows into one row per group (whichever
 * dimension — or tuple of dimensions — is `groupBy` at this drill level),
 * JOINing the requested kpi_names as sibling columns. Valid when the scope
 * filters already pin every OTHER dimension to a single value, so each
 * group has at most one row per kpi_name (true for Breakdown/MTBF/MTTR/
 * Top-Machine/Zero-Breakdown — NOT for Loss Tree, which never pins
 * status/section; see `toLossTree` below for that family).
 *
 * @param {Array} rows
 * @param {{ kpiNames: string[], groupBy: string }} opts
 */
export function toKpiChildren(rows, { kpiNames, groupBy }) {
  const dims = groupDims(groupBy);
  // Preserve first-seen order of groups.
  const keys = [];
  const seen = new Set();
  for (const r of rows) {
    const k = groupKey(r, dims);
    if (k != null && !seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }
  const anchor = kpiNames[0]; // drill anchor = the clicked/primary base
  const outRows = keys.map((key) => {
    const scopeRows = rows.filter((r) => groupKey(r, dims) === key);
    // Each dimension stays its own field, so the UI labels the tuple with
    // one column per part rather than parsing a joined string back apart.
    const out = {};
    dims.forEach((dim, i) => {
      out[dim] = key.split(KEY_SEP)[i];
    });
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
 * @param {Array} rows
 * @param {{ kpiNames: string[], groupBy: string }} opts
 */
export function toLossTree(rows, { kpiNames, groupBy }) {
  // `groupBy` may be a tuple ("machine,remarks,sub_section"): each part stays
  // its own field, exactly as toKpiChildren returns it.
  const dims = groupDims(groupBy);
  const sums = new Map(); // group key -> { kpiName: number }
  const anchors = new Map(); // group key -> first row of kpiNames[0]
  const order = [];
  for (const r of rows) {
    const key = groupKey(r, dims);
    if (key == null || !kpiNames.includes(r.kpi_name)) continue;
    if (!sums.has(key)) {
      sums.set(key, {});
      order.push(key);
    }
    if (r.kpi_name === kpiNames[0] && !anchors.has(key)) anchors.set(key, r);
    const v = valueOrNull(r.actual_value);
    if (v == null) continue;
    const bucket = sums.get(key);
    bucket[r.kpi_name] = (bucket[r.kpi_name] ?? 0) + v;
  }
  const outRows = order.map((key) => {
    const bucket = sums.get(key);
    const out = {};
    dims.forEach((dim, i) => {
      out[dim] = key.split(KEY_SEP)[i];
    });
    for (const name of kpiNames) out[name] = bucket[name] ?? null;
    const anchorRow = anchors.get(key);
    out.drill_down = parseDrillDown(anchorRow?.drill_down_attribute);
    // Summed range queries still need the display dimensions used by the
    // machine/section filters. Keep the first stable dimension values from
    // the anchor row without changing the arithmetic of the summed KPIs.
    for (const dim of CARRY_FORWARD_DIMS) {
      if (dims.includes(dim)) continue;
      if (anchorRow && anchorRow[dim] != null) out[dim] = anchorRow[dim];
    }
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

// A day counts as complete when at least this share of the busiest day's
// machines have a row. The ETL publishes the running day incrementally, so
// the newest date can hold a handful of machines (2026-10-14: 5 of ~216).
const COMPLETE_DAY_RATIO = 0.9;

/**
 * Zero Breakdown Machines: count of distinct machines with
 * DaysWithoutBreakdown_m above the threshold, per DAY, plus the as-of date —
 * the newest day whose machine coverage is complete.
 *
 * @param {object[]} coverageRows  `date, machine_count` over all machines
 * @param {object[]} overRows      `date, machine_count` over machines > threshold
 */
export function toZeroBreakdownCount(coverageRows, overRows) {
  const iso = (r) => String(r.date).slice(0, 10);
  const num = (r) => Number(r.machine_count ?? r.MACHINE_COUNT ?? 0);
  const over = new Map((overRows ?? []).map((r) => [iso(r), num(r)]));
  const coverage = (coverageRows ?? []).map((r) => ({
    date: iso(r),
    machines: num(r),
  }));
  const peak = Math.max(0, ...coverage.map((c) => c.machines));
  const series = coverage
    .map((c) => ({
      date: c.date,
      machines: c.machines,
      count: over.get(c.date) ?? 0,
      complete: c.machines >= peak * COMPLETE_DAY_RATIO,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const complete = series.filter((p) => p.complete);
  const last = complete[complete.length - 1] ?? null;
  return { date: last?.date ?? null, count: last?.count ?? null, series };
}
