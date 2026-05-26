/**
 * gold_dummy row → frontend payload shape.
 *
 * Scope rule (PM call, 2026-05-26):
 *   These columns are IGNORED for Phase 1 and MUST NOT be surfaced
 *   in any payload:
 *     previous_values, threshold_value, status, remarks,
 *     drill_down_level, record_id, hour.
 *
 *   Each row carries one KPI measurement (actual_value) at one
 *   (plant, section, kpi_name, date) along with its drill-down
 *   detail inline in `drill_down_attribute` (JSON-encoded string).
 *   Drill panels read that JSON.
 *
 * NULL sentinel rule:
 *   gold_dummy stores missing string values as the literal "nan"
 *   (not SQL NULL). We treat "nan" as null at the API boundary so
 *   the frontend sees clean nulls.
 */

const NAN = "nan";

function denan(v) {
  if (v === NAN) return null;
  return v;
}

/**
 * Parse the gold_dummy `drill_down_attribute` column. Documented as
 * a JSON-encoded string (e.g. `"[\"Absenteeism_area\"]"`). Tolerant:
 * plain strings, "nan", and nulls all fall through to null/the raw
 * value. Never throws.
 */
export function parseDrillAttribute(raw) {
  if (raw == null || raw === "" || raw === NAN) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * KPI grid payload — matches frontend/src/components/production/
 * KpiCard.jsx field expectations:
 *
 *   [{
 *     id,                 // slug, used as drill key + trend modal key
 *     name,               // human-readable label
 *     value,              // latest actual_value
 *     unit,               // unit_of_measurement
 *     spark: number[],    // chronological (oldest → newest) actual_values
 *     trend,              // % delta latest vs previous (number | null)
 *     trendFavourable,    // true → arrow green; false → red
 *     drillable,          // true when a drill panel is wired
 *     drillDown,          // parsed drill_down_attribute (latest row)
 *   }]
 *
 * Input rows: SQL emits up to KPI_SPARK_LENGTH rows per kpi_name,
 * ordered `kpi_name ASC, rn ASC` where rn=1 is the newest.
 */

/** KPI ids whose drill panel exists in the frontend. */
const DRILLABLE_IDS = new Set([
  "oee",
  "production",
  "downtime",
  "plan-compliance",
]);

/** Substrings in KPI name that flip "good direction" from up→good to down→good. */
const LOWER_IS_BETTER = [
  "downtime",
  "scrap",
  "reject",
  "loss",
  "defect",
  "absent",
  "hold",
  "ncm",
  "ftc",
  "stoppage",
  "breakdown",
  "complaint",
  "anomaly",
  "anomalies",
];

function isHigherBetter(kpiName) {
  if (!kpiName) return true;
  const lower = kpiName.toLowerCase();
  return !LOWER_IS_BETTER.some((kw) => lower.includes(kw));
}

export function toKpiGrid(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const groups = new Map();
  for (const r of rows) {
    const name = r.kpi_name;
    if (!name || name === NAN) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(r);
  }

  const result = [];
  for (const [name, groupNewestFirst] of groups) {
    const chronological = groupNewestFirst.slice().reverse();
    const sparkValues = chronological
      .map((r) => numberOrNull(r.actual_value))
      .filter((v) => v !== null);

    if (sparkValues.length === 0) continue;

    const latest = groupNewestFirst[0];
    const value = numberOrNull(latest.actual_value);
    const previous =
      groupNewestFirst.length >= 2
        ? numberOrNull(groupNewestFirst[1].actual_value)
        : null;
    const trend =
      value !== null && previous !== null && previous !== 0
        ? Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10
        : null;

    const id = slug(name);
    const higherBetter = isHigherBetter(name);
    const trendFavourable =
      trend === null ? true : higherBetter ? trend >= 0 : trend <= 0;

    result.push({
      id,
      name,
      value,
      unit: denan(latest.unit_of_measurement) ?? null,
      spark: sparkValues,
      trend,
      trendFavourable,
      drillable: DRILLABLE_IDS.has(id),
      drillDown: parseDrillAttribute(latest.drill_down_attribute),
    });
  }
  return result;
}

/**
 * OEE drill payload:
 *
 *   {
 *     overall: { availability, performance, quality } | null,
 *     machines: [{ name, availability, performance, quality, oee }],
 *     subDrill: { [machine]: <whatever drill_down_attribute carries> }
 *   }
 */
export function toOeeDrill(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { overall: null, machines: [], subDrill: {} };
  }

  const byMachine = new Map();
  const subDrill = {};

  for (const r of rows) {
    const machineRaw = denan(r.machine);
    if (!machineRaw) continue;
    const attr = parseDrillAttribute(r.drill_down_attribute);
    const metricName = attrName(attr);

    const m =
      byMachine.get(machineRaw) ?? {
        name: machineRaw,
        availability: null,
        performance: null,
        quality: null,
        oee: null,
      };

    switch ((metricName ?? "").toLowerCase()) {
      case "availability":
        m.availability = numberOrNull(r.actual_value);
        break;
      case "performance":
        m.performance = numberOrNull(r.actual_value);
        break;
      case "quality":
        m.quality = numberOrNull(r.actual_value);
        break;
      case "oee":
        m.oee = numberOrNull(r.actual_value);
        break;
      default:
        if (attr && typeof attr === "object") {
          subDrill[machineRaw] = subDrill[machineRaw] ?? [];
          subDrill[machineRaw].push(attr);
        }
        break;
    }
    byMachine.set(machineRaw, m);
  }

  const machines = Array.from(byMachine.values());
  return { overall: aggregateOee(machines), machines, subDrill };
}

function aggregateOee(machines) {
  if (machines.length === 0) return null;
  const avg = (k) => {
    const vals = machines.map((m) => m[k]).filter((v) => typeof v === "number");
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  return {
    availability: avg("availability"),
    performance: avg("performance"),
    quality: avg("quality"),
  };
}

/**
 * Production drill — buckets rows by a caller-supplied key fn. The
 * frontend's ProductionDrillPanel reads `bucket[selectedKey]`.
 */
export function toProductionDrill(rows, { keyOf }) {
  const buckets = {};
  for (const r of rows ?? []) {
    const key = keyOf(r);
    if (!key) continue;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push({
      sku: denan(r.itemcode),
      itemCode: denan(r.itemcode),
      machine: denan(r.machine),
      productType: denan(r.product_type),
      actual: numberOrNull(r.actual_value),
      drillDown: parseDrillAttribute(r.drill_down_attribute),
    });
  }
  return buckets;
}

export function toDowntimeDrill(rows) {
  return (rows ?? []).map((r) => ({
    machine: denan(r.machine),
    date: denan(r.date),
    durationMin: numberOrNull(r.actual_value),
    drillDown: parseDrillAttribute(r.drill_down_attribute),
  }));
}

export function toPlanComplianceDrill(rows) {
  return (rows ?? []).map((r) => ({
    machine: denan(r.machine),
    itemCode: denan(r.itemcode),
    actual: numberOrNull(r.actual_value),
    drillDown: parseDrillAttribute(r.drill_down_attribute),
  }));
}

export function toScrapTrace(rows) {
  return (rows ?? []).map((r) => ({
    productionId: denan(r.production_ids),
    machine: denan(r.machine),
    itemCode: denan(r.itemcode),
    date: denan(r.date),
    scrap: numberOrNull(r.actual_value),
    drillDown: parseDrillAttribute(r.drill_down_attribute),
  }));
}

export function toTrendSeries(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { labels: [], values: [] };
  }
  return {
    labels: rows.map((r) => String(denan(r.date) ?? "")),
    values: rows.map((r) => numberOrNull(r.actual_value)),
  };
}

/* ---------- helpers ---------- */

function numberOrNull(v) {
  if (v === null || v === undefined || v === "" || v === NAN) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function attrName(attr) {
  if (!attr) return null;
  if (typeof attr === "string") return attr;
  if (Array.isArray(attr)) return attr[0] ?? null;
  if (typeof attr === "object") return attr.name ?? attr.metric ?? null;
  return null;
}

function slug(s) {
  return String(s ?? "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
}
