/**
 * Row → response transformers for the Quality Process tab (Backend FRD §1).
 *
 * The DB/excel rows arrive already sentinel-normalized (loader) but the
 * business meaning of "no row" and "no value" (FRD §0.6) is applied here:
 *   - missing violation-counter row  → 0     (zero events)
 *   - missing % / rate row           → null  ("—", not measured)
 * Values are echoed as stored; nothing is computed except this gap rule.
 */
import { parseDrillDown, valueOrNull } from "../normalize.js";

/** Strip the level suffix: "Plant_quality_rating_s" → "Plant_quality_rating". */
function baseName(kpiName) {
  return String(kpiName).replace(/_(o|s|m)$/, "");
}

/**
 * True for additive violation counters (Total/Open/Closed_Violation), which
 * zero-fill when their row is absent. Everything else (ratings, compliance,
 * closure rate) is a % / derived rate → null when absent (FRD §0.6).
 */
function isCounter(kpiName) {
  const b = baseName(kpiName);
  return /violation/i.test(b) && !/rate/i.test(b);
}

/** Default value for a base whose row is absent in a scope (FRD §0.6). */
function absentDefault(kpiName) {
  return isCounter(kpiName) ? 0 : null;
}

/**
 * kpi-value (FRD §1.2 L0). Expects 0 or 1 row. No row → the card's empty
 * state (e.g. Month/Year views, §B.2). Drillability comes from parsing the
 * row's drill_down_attribute (§1.2), never drill_down_level.
 */
export function toKpiValue(rows) {
  const row = rows[0];
  if (!row) {
    return {
      actual_value: null,
      unit: null,
      threshold_value: null,
      status: null,
      drill_down: { is_leaf: true, children: [] },
    };
  }
  return {
    actual_value: valueOrNull(row.actual_value),
    unit: valueOrNull(row.unit_of_measurement),
    threshold_value: valueOrNull(row.threshold_value),
    status: valueOrNull(row.status),
    drill_down: parseDrillDown(row.drill_down_attribute),
  };
}

/**
 * kpi-value-batch (FRD §1.4 L0). Maps each requested base to its stored
 * value, applying the §0.6 gap rule for any base with no row.
 */
export function toKpiValueBatch(rows, kpiNames) {
  const byName = new Map(rows.map((r) => [r.kpi_name, r]));
  const out = {};
  for (const name of kpiNames) {
    const row = byName.get(name);
    out[name] = row ? valueOrNull(row.actual_value) : absentDefault(name);
  }
  return out;
}

/**
 * kpi-children (FRD §1.2 L1/L2). Pivots the flat rows into one row per group
 * (section, or machine when drilling into a section). Groups are the distinct
 * group-column values that appear (the rating base has a row for every
 * audited scope), so counter zero-fill lands on real scopes only.
 *
 * @param {Array} rows
 * @param {{ kpiNames: string[], groupBy: "section"|"machine" }} opts
 */
export function toKpiChildren(rows, { kpiNames, groupBy }) {
  // Preserve first-seen order of groups.
  const groups = [];
  const seen = new Set();
  for (const r of rows) {
    const g = r[groupBy];
    if (g != null && !seen.has(g)) {
      seen.add(g);
      groups.push(g);
    }
  }
  const anchor = kpiNames[0]; // drill anchor = the clicked/primary base
  const outRows = groups.map((group) => {
    const scopeRows = rows.filter((r) => r[groupBy] === group);
    const out = { [groupBy]: group };
    for (const name of kpiNames) {
      const row = scopeRows.find((r) => r.kpi_name === name);
      out[name] = row ? valueOrNull(row.actual_value) : absentDefault(name);
    }
    const anchorRow =
      scopeRows.find((r) => r.kpi_name === anchor) ?? scopeRows[0];
    out.drill_down = parseDrillDown(anchorRow?.drill_down_attribute);
    return out;
  });
  return { group_by: groupBy, rows: outRows };
}

/** kpi-history (FRD §1.5): ordered {date, value} points for a sparkline. */
export function toKpiHistory(rows) {
  return {
    points: rows.map((r) => ({
      date: r.date,
      value: valueOrNull(r.actual_value),
    })),
  };
}
