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

import {
  parseDrillAttribute as parseDrillAttributeShared,
  normalizeUnit,
  isEmptyValue,
  canonicalizeProductType,
  canonicalizeSubSection,
} from "./normalize.js";

// changes.md §0: the real data's missing-value sentinels are the literal
// strings "nan" AND "null" (not SQL NULL). Treat both (case-insensitively)
// as null at the API boundary so the frontend sees clean nulls and overall
// rows (product_type = "null") are recognised as empty, not a product.
function denan(v) {
  return isEmptyValue(v) ? null : v;
}

// changes.md §6: canonicalize dimension spellings on read so duplicate
// spellings merge into one bucket/bar with a combined total (SideWall vs
// Sidewall; 3 Roll vs Three Roll). Empty sentinels still collapse to null.
function productType(v) {
  const d = denan(v);
  return d == null ? null : canonicalizeProductType(d);
}
function subSection(v) {
  const d = denan(v);
  return d == null ? null : canonicalizeSubSection(d);
}

/** Unit for the API payload — normalized; "(unset)"/"nan" → null. */
function unit(v) {
  return normalizeUnit(denan(v));
}

/** Normalize a date (ISO yyyy-mm-dd or DD-MM-YYYY) to sortable YYYYMMDD. */
function dateKey(d) {
  if (typeof d !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replaceAll("-", "");
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d);
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

/** Date (either format) → ISO yyyy-mm-dd for stable frontend display. */
function toIsoDate(d) {
  const k = dateKey(d);
  return k ? `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}` : d;
}

function numOrNull(v) {
  if (isEmptyValue(v)) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Inventory page payload (BRD §13.4). Maps gold_dummy rows
 * (category = Inventory) to the InventoryPage contract:
 *   { groups: { production, stock, compound }, history: [...] }
 *
 *   kpi_name = "Inventory"       → one bar per product_type (today =
 *                                  latest day, yesterday = prior day).
 *   kpi_name = "Inventory_item"  → item-level live stock per bar.
 *
 * Each product_type is routed to a chart group + stable bar id + the
 * history column key the frontend table expects.
 */
const INVENTORY_BARS = {
  FG: { group: "production", id: "fg", label: "FG", histKey: "fg" },
  Cured: { group: "production", id: "cured", label: "Cured", histKey: "cured" },
  Green: { group: "production", id: "green", label: "Green", histKey: "green" },
  Tread: { group: "stock", id: "tread", label: "Tread", histKey: "tread" },
  Belt: { group: "stock", id: "belt", label: "Belt", histKey: "belt" },
  Ply: { group: "stock", id: "ply", label: "Ply", histKey: "ply" },
  "Cap Strip": { group: "stock", id: "capstrip", label: "Capstrip", histKey: "capstrip" },
  Sidewall: { group: "stock", id: "sidewall", label: "Sidewall", histKey: "sidewall" },
  "Inner Liner": { group: "stock", id: "iliner", label: "I.Liner", histKey: "iLiner" },
  Bead: { group: "stock", id: "bead", label: "Bead", histKey: "bead" },
  "Final Compound": { group: "compound", id: "final", label: "Final", histKey: "final" },
  "Master Compound": { group: "compound", id: "master", label: "Master", histKey: "master" },
};

/**
 * Group an unmapped real product_type. Compounds → compound group; the
 * finished/green/cured products → production; everything else (the bulk of
 * Stock semi-finished items: Belt, Cap Strip, Chaffer, SideWall, …) → stock.
 */
function inferGroup(pt) {
  const s = String(pt).toLowerCase();
  if (s.includes("compound")) return "compound";
  if (s.includes("green") || s.includes("cured") || s === "fg") {
    return "production";
  }
  return "stock";
}

const INVENTORY_GROUP_ORDER = ["production", "stock", "compound"];
const INVENTORY_GROUP_TITLES = {
  production: "Production",
  stock: "Stock Inventory",
  compound: "Compound Inventory",
};

export function toInventory(rows) {
  const all = Array.isArray(rows) ? rows : [];
  const barRows = all.filter((r) => r.kpi_name === "Inventory");
  const itemRows = all.filter((r) => r.kpi_name === "Inventory_item");

  // Item-level live stock per product_type: latest date wins per itemcode.
  const itemsByType = new Map();
  for (const r of itemRows) {
    const pt = productType(r.product_type);
    const code = denan(r.itemcode);
    if (!pt || !code) continue;
    if (!itemsByType.has(pt)) itemsByType.set(pt, new Map());
    const byCode = itemsByType.get(pt);
    const prev = byCode.get(code);
    if (!prev || dateKey(r.date) > dateKey(prev.date)) byCode.set(code, r);
  }
  const itemsFor = (pt) => {
    const byCode = itemsByType.get(pt);
    if (!byCode) return [];
    return [...byCode.values()]
      .map((r) => ({
        itemCode: denan(r.itemcode),
        description: denan(r.itemcode),
        liveStock: numOrNull(r.actual_value) ?? 0,
        unit: unit(r.unit_of_measurement) ?? "",
      }))
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  };

  // Bar today/yesterday: the two most recent dates for each product_type.
  const barsByType = new Map();
  for (const r of barRows) {
    const pt = productType(r.product_type);
    if (!pt) continue;
    if (!barsByType.has(pt)) barsByType.set(pt, []);
    barsByType.get(pt).push(r);
  }

  const groups = {};
  for (const groupId of INVENTORY_GROUP_ORDER) {
    groups[groupId] = { title: INVENTORY_GROUP_TITLES[groupId], bars: [] };
  }

  // realdata.md §7/§16: read product_types from the DATA, don't hardcode. The
  // real inventory products (Belt, Cap Strip, Chaffer, SideWall, Master
  // Compound, Green, …) differ from the dummy's frozen INVENTORY_BARS list.
  // Known products use their mapped group/label; unknown ones get a derived
  // bar in a sensible default group so they still render.
  const metaFor = (pt) =>
    INVENTORY_BARS[pt] ?? {
      group: inferGroup(pt),
      id: slug(pt),
      label: pt,
      histKey: slug(pt),
    };

  // Iterate over the product_types actually present, in stable label order.
  for (const pt of [...barsByType.keys()].sort((a, b) => a.localeCompare(b))) {
    const meta = metaFor(pt);
    const rs = (barsByType.get(pt) ?? []).sort(
      (a, b) => (dateKey(b.date) > dateKey(a.date) ? 1 : -1),
    );
    if (rs.length === 0) continue;
    const today = numOrNull(rs[0].actual_value) ?? 0;
    const yesterday = rs[1] ? (numOrNull(rs[1].actual_value) ?? 0) : today;
    (groups[meta.group] ?? groups.stock).bars.push({
      id: meta.id,
      label: meta.label,
      today,
      yesterday,
      unit: unit(rs[0].unit_of_measurement) ?? "",
      items: itemsFor(pt),
    });
  }

  // History — last 7 dates across all bars, one row per date with every
  // product_type's value under its history column key.
  const byDate = new Map();
  for (const r of barRows) {
    const pt = productType(r.product_type);
    if (!pt) continue;
    const meta = metaFor(pt);
    const k = dateKey(r.date);
    if (!k) continue;
    if (!byDate.has(k)) byDate.set(k, { date: toIsoDate(r.date) });
    byDate.get(k)[meta.histKey] = numOrNull(r.actual_value) ?? 0;
  }
  const history = [...byDate.entries()]
    .sort((a, b) => (a[0] > b[0] ? 1 : -1)) // oldest → newest
    .slice(-7)
    .map(([, v]) => v);

  return { groups, history };
}

// CTP inventory master — see docs/ctp-stock-asset-mapping.md.
//
// Gold layer carries Inventory + Inventory_item rows at (section,
// sub_section, product_type, itemcode, date, actual_value). Per-lot
// facets (status, mhe_code, age_days, expiry_date) DO NOT exist in the
// gold schema — see realdata.md §15. The master payload consumed by
// `frontend/src/lib/ctpInventory.js#buildCtpInventoryModel` is shaped
// around lots, so we synthesise one READY lot per Inventory_item row
// (one lot = the item's full qty) and stamp `data_limits` so callers
// can tell which facets are real vs synthesised.

const CTP_SECTION_ACCENT = {
  Mixing: "ac",
  Stock: "tl",
  "Tyre Building": "bl",
};

// status_master — verbatim copy of the five CTP statuses from
// ctpInventoryMaster.json. Kept stable so the frontend status filter
// chips render the same colours/labels regardless of mock vs live.
const CTP_STATUS_MASTER = [
  { key: "READY", label: "Ready to Use", column: "Ready to use", color: "gn", source_field: "status", source_value: "Ready to Use", gold_metric: "Ready_To_Use", usable: true, blocked: false },
  { key: "PART", label: "Part Use", column: "Part use", color: "bl", source_field: "status", source_value: "Part Use", gold_metric: "Part_Use", usable: true, blocked: false },
  { key: "ATE", label: "About_To_Expire", column: "About_To_Expire", color: "am", source_field: "status", source_value: "About_To_Expire", gold_metric: "About_To_Expire", usable: true, blocked: false },
  { key: "EXP", label: "Expired", column: "Expired", color: "rd", source_field: "status", source_value: "Expired", gold_metric: "Expired", usable: false, blocked: true },
  { key: "HOLD", label: "ON Hold", column: "Held", color: "pp", source_field: "status", source_value: "ON Hold", gold_metric: "Held", usable: false, blocked: true },
];

// insight_cards — config for the four insight tiles at the top of the
// page. Same shape as the mock so the page renders identical tiles.
const CTP_INSIGHT_CARDS = [
  { id: "short_cover", title: "Categories Under 1 Day Cover", type: "cover_below", threshold_days: 1, color: "rd" },
  { id: "on_hold", title: "On Hold Inventory", type: "status_qty", status: "HOLD", color: "pp" },
  { id: "expired", title: "Expired Inventory", type: "status_qty", status: "EXP", color: "rd" },
  { id: "oldest_blocked", title: "Oldest Blocked Lot", type: "oldest_blocked", warn_days: 3, color: "am" },
];

const CTP_TABLE = { default_sort: { key: "READY", dir: "desc" }, top_n: 10 };

const CTP_UOM_DISPLAY = { MTR: "m", KG: "kg", NOS: "nos" };

const CTP_METRICS = [
  { kpi_name: "Total_Inventory", ui_expr: "SUM(lots.quantity)", grain: "lot" },
  { kpi_name: "MHE_Count", ui_expr: "COUNT(DISTINCT lots.mhe_code)", grain: "lot" },
  { kpi_name: "Days_Cover", ui_expr: "SUM(quantity WHERE status.usable) / SUM(items.daily_consumption)", grain: "item|product_type", gold: "(Ready_To_Use + Part_Use + About_To_Expire) / Daily_Consumption" },
  { kpi_name: "Oldest_Blocked_Lot", ui_expr: "MAX(age_days WHERE status.blocked)", gold: "Oldest_Blocked_Lot_Days" },
];

const CTP_GOLD_METRIC_REFERENCE = [
  { kpi_name: "Total_Inventory", gold_expr: "SUM(inventory_qty)" },
  { kpi_name: "MHE_Count", gold_expr: "COUNT(DISTINCT mhe_code)" },
  { kpi_name: "Ready_To_Use", gold_expr: "SUM(CASE WHEN status='Ready To Use' THEN inventory_qty ELSE 0 END)" },
  { kpi_name: "Part_MHE", gold_expr: "SUM(CASE WHEN status='Part MHE' THEN inventory_qty ELSE 0 END)" },
  { kpi_name: "About_To_Expire", gold_expr: "SUM(CASE WHEN expiry_status='About To Expire' THEN inventory_qty ELSE 0 END)" },
  { kpi_name: "Expired", gold_expr: "SUM(CASE WHEN expiry_status='Expired' THEN inventory_qty ELSE 0 END)" },
];

const IST_OFFSET_MIN = 5 * 60 + 30;

/**
 * YYYYMMDD key for a row date — UTC-relative to the IST offset already
 * applied in sql-date.js. We avoid the offset here (the column is already
 * an ISO date) and just emit YYYYMMDD for sorting.
 */
function yyyymmdd(dateStr) {
  const k = dateKey(dateStr);
  return k || null;
}

/**
 * Format `YYYYMMDD` as `YYYY-MM-DDTHH:mm:ss+05:30` (Asia/Kolkata), the
 * shape `as_of` carries in the bundled mock.
 */
function asOfIst(yyyymmddStr) {
  if (!yyyymmddStr || yyyymmddStr.length !== 8) return null;
  return `${yyyymmddStr.slice(0, 4)}-${yyyymmddStr.slice(4, 6)}-${yyyymmddStr.slice(6, 8)}T06:00:00+05:30`;
}

/**
 * Build the CTP inventory master payload from gold rows.
 *
 * Pure: no network, no clock. Group rows by (section, product_type,
 * itemcode), keep the latest date per item, and emit one synthetic READY
 * lot per item with the item's qty. Sections absent from the input
 * (Mixing, Tyre Building at CTP today) are simply omitted.
 *
 * @param {Array<object>} rows - gold rows with category='Inventory' and
 *   kpi_name in ('Inventory', 'Inventory_item'). Expected columns:
 *   date, section, sub_section, product_type, itemcode, tyre_type,
 *   unit_of_measurement, actual_value.
 * @returns {object} master payload matching the contract in
 *   `frontend/src/lib/ctpInventory.js#buildCtpInventoryModel`.
 */
export function toCtpInventoryMaster(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const itemRows = list.filter((r) => r.kpi_name === "Inventory_item");

  // Key per (section|product_type|itemcode) → row, latest date wins.
  const latest = new Map();
  let maxDate = "";
  for (const r of itemRows) {
    const sec = denan(r.section);
    const pt = productType(r.product_type);
    const code = denan(r.itemcode);
    const qty = numOrNull(r.actual_value) ?? 0;
    if (!sec || !pt || !code) continue;
    const k = dateKey(r.date);
    if (!k) continue;
    if (k > maxDate) maxDate = k;
    const key = `${sec}|${pt}|${code}`;
    const prev = latest.get(key);
    if (!prev || dateKey(prev.date) < k) {
      latest.set(key, {
        section: sec,
        sub_section: subSection(r.sub_section) || "",
        product_type: pt,
        itemcode: code,
        tyre_type: denan(r.tyre_type) || "",
        unit: unit(r.unit_of_measurement) || "",
        date: r.date,
        actual_value: qty,
      });
    }
  }

  // Nest: section → product_type → item.
  const sectionMap = new Map();
  for (const r of latest.values()) {
    if (!sectionMap.has(r.section)) sectionMap.set(r.section, new Map());
    const ptMap = sectionMap.get(r.section);
    if (!ptMap.has(r.product_type)) {
      ptMap.set(r.product_type, {
        name: r.product_type,
        sub_section: r.sub_section,
        tyre_type: r.tyre_type,
        uom: r.unit,
        items: new Map(),
      });
    }
    const ptEntry = ptMap.get(r.product_type);
    // Prefer a non-empty uom on the product_type when the first row was empty.
    if (!ptEntry.uom && r.unit) ptEntry.uom = r.unit;
    ptEntry.items.set(r.itemcode, r);
  }

  // Emit sections in stable order: Mixing, Stock, Tyre Building (the only
  // three the page knows about) — any other section appears at the end in
  // case ETL ever adds one. Each section's accent comes from the same map
  // the mock uses.
  const SECTION_ORDER = ["Mixing", "Stock", "Tyre Building"];
  const sectionNames = [
    ...SECTION_ORDER.filter((s) => sectionMap.has(s)),
    ...[...sectionMap.keys()].filter((s) => !SECTION_ORDER.includes(s)).sort(),
  ];

  let totalLots = 0;
  let totalItems = 0;
  let totalQty = 0;

  const sections = sectionNames.map((secName) => {
    const ptMap = sectionMap.get(secName);
    const productTypeNames = [...ptMap.keys()].sort();
    const productTypes = productTypeNames.map((ptName) => {
      const pt = ptMap.get(ptName);
      const items = [...pt.items.values()]
        .sort((a, b) => a.itemcode.localeCompare(b.itemcode))
        .map((r) => {
          const lotId = `SYN-${r.itemcode}-${yyyymmdd(r.date) || "00000000"}`;
          totalLots += 1;
          totalItems += 1;
          totalQty += r.actual_value;
          return {
            item_code: r.itemcode,
            uom: r.unit,
            tyre_type: r.tyre_type,
            daily_consumption: 0,
            lots: [
              {
                lot_id: lotId,
                status: "READY",
                mhe_code: null,
                production_date: toIsoDate(r.date),
                age_days: null,
                expiry_date: null,
                quantity: r.actual_value,
              },
            ],
          };
        });
      return {
        name: pt.name,
        source_name: pt.name,
        tyre_type: pt.tyre_type,
        sub_section: pt.sub_section,
        uom: pt.uom,
        shelf_life_days: 0,
        mapping_source: "gold.ctp_gold",
        gold_kpi_groups: ["inventory_stock"],
        items,
      };
    });
    return {
      name: secName,
      source_codes: [secName],
      accent: CTP_SECTION_ACCENT[secName] || "tl",
      product_types: productTypes,
    };
  });

  return {
    schema_version: "1.0.0",
    plant: "Chennai",
    plant_id: "chennai",
    function: "Production",
    navigation: "Inventory",
    as_of: asOfIst(maxDate),
    data_origin: "gold.ctp_gold (Inventory + Inventory_item); lot-level facets absent — see data_limits",
    data_limits: {
      sections_populated: sections.map((s) => s.name),
      sections_absent: SECTION_ORDER.filter((s) => !sectionMap.has(s)),
      lot_synthesis: "READY",
      mhe_count: null,
      oldest_blocked_age: null,
      daily_consumption: null,
    },
    status_master: CTP_STATUS_MASTER,
    metrics: CTP_METRICS,
    gold_metric_reference: CTP_GOLD_METRIC_REFERENCE,
    insight_cards: CTP_INSIGHT_CARDS,
    table: CTP_TABLE,
    uom_display: CTP_UOM_DISPLAY,
    validation: {
      expected_total_inventory: totalQty,
      expected_mhe_count: 0,
      lots: totalLots,
      items: totalItems,
    },
    sections,
  };
}

/**
 * Parse the `drill_down_attribute` column into a real array of child KPI
 * names. The real data stores a Python-style SINGLE-quoted list
 * (['Production_m', …]) which a strict JSON.parse can't read — the shared
 * tolerant parser (normalize.js §6) handles single OR double quotes and
 * aliases Production_sku_m → Production_m_sku. Never throws.
 */
export const parseDrillAttribute = parseDrillAttributeShared;

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

/** KPI ids whose drill panel exists in the frontend. Downtime is removed
 *  entirely in the real data (realdata.md §15) — its drill is gone. */
const DRILLABLE_IDS = new Set([
  "oee",
  "production",
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
    if (isEmptyValue(name)) continue;
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
      unit: unit(latest.unit_of_measurement) ?? null,
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
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(mean * 100) / 100;
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
      kpiName: denan(r.kpi_name),
      sku: denan(r.itemcode),
      itemCode: denan(r.itemcode),
      machine: denan(r.machine),
      productType: productType(r.product_type),
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

/**
 * Coerce upstream value → number, NaN/null-safe. Rounds to 2 decimals
 * so the API never emits values like 91.66666666666667 (SQL AVG
 * produces those for monthly/yearly aggregates). 2 decimals is enough
 * for every KPI in the artifact; downstream callers can format
 * further (e.g. drop the decimal when the value is a whole number).
 */
function numberOrNull(v) {
  if (isEmptyValue(v)) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
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
