/**
 * gold_bi row → frontend payload shape.
 *
 * Scope rule (PM call, 2026-05-26):
 *   These columns are IGNORED for Phase 1 and MUST NOT be surfaced
 *   in any payload:
 *     previous_values, threshold_value, status, remarks,
 *     drill_down_level, record_id.
 *
 *   Each row carries one KPI measurement (actual_value) at one
 *   (plant, section, kpi_name, date) along with its drill-down
 *   detail inline in `drill_down_attribute` (JSON-encoded string).
 *   Drill panels read that JSON; they do NOT depend on
 *   drill_down_level.
 *
 * Frontend mocks (frontend/src/lib/mockData.js) defined a richer
 * shape (target, previous, status) — the frontend already renders
 * those as optional. We just leave them out. Client-side colour
 * rules (e.g. `value >= 90 → green`) keep working without an
 * upstream status field.
 */

/**
 * Parse the gold_bi `drill_down_attribute` column. Documented as a
 * JSON-encoded string (array or object) but tolerant: plain strings
 * and nulls fall through. Never throws.
 */
export function parseDrillAttribute(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * KPI grid payload — what the frontend's KpiGrid component reads:
 *
 *   [{ id, name, value, unit, drillDown }]
 *
 * `drillDown` is the parsed drill_down_attribute payload (or null).
 * The frontend's drill panels can pick this up without a second
 * round-trip.
 */
export function toKpiGrid(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: slug(r.kpi_name),
    name: r.kpi_name,
    value: numberOrNull(r.actual_value),
    unit: r.unit_of_measurement ?? null,
    drillDown: parseDrillAttribute(r.drill_down_attribute),
  }));
}

/**
 * OEE drill payload:
 *
 *   {
 *     overall: { availability, performance, quality } | null,
 *     machines: [{ name, availability, performance, quality, oee }],
 *     subDrill: { [machine]: <whatever drill_down_attribute carries> }
 *   }
 *
 * Phase 1 best-effort: machine-level rows contribute their
 * actual_value to whichever component the parsed drill_down_attribute
 * names. If the attribute is a richer object, it gets stashed on
 * subDrill[machine] verbatim for the frontend to render.
 */
export function toOeeDrill(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { overall: null, machines: [], subDrill: {} };
  }

  const byMachine = new Map();
  const subDrill = {};

  for (const r of rows) {
    if (!r.machine) continue;
    const attr = parseDrillAttribute(r.drill_down_attribute);
    const metricName = attrName(attr);

    const m =
      byMachine.get(r.machine) ??
      {
        name: r.machine,
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
        // Unknown attribute — keep the parsed object available for
        // the frontend to render however it wants.
        if (attr && typeof attr === "object") {
          subDrill[r.machine] = subDrill[r.machine] ?? [];
          subDrill[r.machine].push(attr);
        }
        break;
    }
    byMachine.set(r.machine, m);
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
 *
 * Per row we surface only what the panel needs: sku/itemCode,
 * machine, actual_value (rendered as "Actual"), and the parsed
 * drill_down_attribute (for client-side aggregation by Machine /
 * SKU / Machine+SKU per CR-05).
 */
export function toProductionDrill(rows, { keyOf }) {
  const buckets = {};
  for (const r of rows ?? []) {
    const key = keyOf(r);
    if (!key) continue;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push({
      sku: r.itemcode ?? null,
      itemCode: r.itemcode ?? null,
      machine: r.machine ?? null,
      productType: r.product_type ?? null,
      actual: numberOrNull(r.actual_value),
      drillDown: parseDrillAttribute(r.drill_down_attribute),
    });
  }
  return buckets;
}

export function toDowntimeDrill(rows) {
  return (rows ?? []).map((r) => {
    const attr = parseDrillAttribute(r.drill_down_attribute);
    return {
      machine: r.machine ?? null,
      date: r.date ?? null,
      durationMin: numberOrNull(r.actual_value),
      drillDown: attr,
    };
  });
}

export function toPlanComplianceDrill(rows) {
  return (rows ?? []).map((r) => ({
    machine: r.machine ?? null,
    itemCode: r.itemcode ?? null,
    actual: numberOrNull(r.actual_value),
    drillDown: parseDrillAttribute(r.drill_down_attribute),
  }));
}

export function toScrapTrace(rows) {
  return (rows ?? []).map((r) => ({
    productionId: r.production_ids ?? null,
    machine: r.machine ?? null,
    itemCode: r.itemcode ?? null,
    date: r.date ?? null,
    scrap: numberOrNull(r.actual_value),
    drillDown: parseDrillAttribute(r.drill_down_attribute),
  }));
}

export function toTrendSeries(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { labels: [], values: [] };
  }
  return {
    labels: rows.map((r) => String(r.date ?? "")),
    values: rows.map((r) => numberOrNull(r.actual_value)),
  };
}

export function toInventory(rows) {
  return (rows ?? []).map((r) => ({
    section: r.section ?? null,
    name: r.kpi_name ?? null,
    itemCode: r.itemcode ?? null,
    quantity: numberOrNull(r.actual_value),
    unit: r.unit_of_measurement ?? null,
    drillDown: parseDrillAttribute(r.drill_down_attribute),
  }));
}

/* ---------- helpers ---------- */

function numberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
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
