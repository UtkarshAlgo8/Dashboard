import { CACHE_TTL, cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { DATE_YYYYMMDD } from "../queries/dashboard-query.js";
import {
  normalizePlantId,
  plantDepartmentPredicate,
  plantSqlTable,
  emptyColumnPredicate,
  GRAN_DAY,
  GRAN_MONTH,
} from "../utils/normalize.js";

// CR-10 / Q-LP-02 placeholder. Plant-aggregate Cured Tire Production's
// MT display is computed as `curedTyreProduction * AVG_MASS_PER_TIRE_KG
// / 1000`. Gold carries only NOS for Curing Production_product; revisit
// when the gold layer carries a true mass field or per-tire-mass lookup.
const AVG_MASS_PER_TIRE_KG = 10;

/**
 * Lookup data + handlers. Labels/coordinates are app configuration; KPI
 * values shown on live plant cards are read from the gold DB.
 */

// sx / sy are SVG coordinates for the India map markers (viewBox
// 0..MAP_W × 0..MAP_H, see frontend/src/lib/indiaMap.js). `sub` is the
// subtitle shown on the plant card and the map hover popover. oee/otif/
// yield are the headline KPI values surfaced on the card (oee = OEE_p,
// current month).
export const PLANTS = [
  {
    id: "banmore",
    name: "Banmore Tyre Plant",
    sub: "Gwalior, Madhya Pradesh",
    location: "Banmore",
    state: "Madhya Pradesh",
    tyreType: "PCR",
    sx: 169.7,
    sy: 228.6,
    oee: null,
    otif: null,
    yield: null,
    enabled: true,
  },
  {
    id: "chennai",
    name: "Chennai Tyre Plant",
    sub: "Tamil Nadu",
    location: "Chennai",
    state: "Tamil Nadu",
    tyreType: "PCR/TBR",
    sx: 202.0,
    sy: 446.6,
    oee: null,
    otif: null,
    yield: null,
    enabled: true,
  },
  {
    id: "laksar",
    name: "Laksar Tyre Plant",
    sub: "Haridwar, Uttarakhand",
    location: "Laksar",
    state: "Uttarakhand",
    tyreType: "PCR/TBR",
    sx: 167.6,
    sy: 170.2,
    oee: null,
    otif: null,
    yield: null,
    enabled: false,
  },
  {
    id: "mysore",
    name: "Mysore Tyre Plant",
    sub: "Karnataka",
    location: "Mysore",
    state: "Karnataka",
    tyreType: "PCR/TBR",
    sx: 163.0,
    sy: 441.0,
    oee: null,
    otif: null,
    yield: null,
    enabled: false,
  },
];

export const FUNCTIONS = [
  { id: "ph", name: "Plant Head", enabled: false },
  { id: "prod", name: "Production", enabled: true },
  { id: "qual", name: "Quality", enabled: false },
  { id: "tech", name: "Technical", enabled: false },
  { id: "eng", name: "Engineering", enabled: false },
];

export const SECTIONS = [
  { id: "mix", name: "Mixing" },
  { id: "stk", name: "Stock" },
  { id: "tbm", name: "TBM" },
  { id: "cur", name: "Curing" },
];

// realdata.md §5: only Productivity / Quality / Inventory exist in the real
// data. Cost / Morale / Safety are shown as tabs but NOT clickable
// (enabled:false → the frontend renders them disabled with a tooltip) until
// that data arrives. Inventory is enabled (category = 'Inventory').
export const CATEGORY_TABS = [
  { id: "p", code: "P", name: "Productivity", enabled: true },
  { id: "q", code: "Q", name: "Quality", enabled: true },
  { id: "c", code: "C", name: "Cost", enabled: false },
  { id: "m", code: "M", name: "Morale", enabled: false },
  { id: "s", code: "S", name: "Safety", enabled: false },
  { id: "i", code: "I", name: "Inventory", enabled: true },
];

// OEE is NOT in this map — the landing tile reads OEE_p at MONTH granularity
// through its own query (see landingOeePForPlant). Only OTIF / Yield still use
// the generic latest-row-by-alias lookup.
const LANDING_KPI_ALIASES = {
  otif: ["otif"],
  yield: ["yield", "yield_%", "yield_pct"],
};

function aliasList(names) {
  return names.map(escapeLiteral).join(", ");
}

function percentOrNull(v) {
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Current-month plant OEE for the landing card. OEE_p is the whole-plant
 * figure — section / sub_section / machine / product_type are ALL empty, so
 * the OEE_o predicates would never match it. Monthly rows are stored dated on
 * the 1st of their month at granularity MONTH, so the latest such row (rn=1)
 * IS the current month. No date filter: a data-load lag must not blank the
 * card, it should keep showing the newest month that exists.
 */
async function landingOeePForPlant(plantId) {
  const sql = `
    SELECT actual_value
    FROM (
      SELECT actual_value,
             ROW_NUMBER() OVER (
               ORDER BY ${DATE_YYYYMMDD} DESC
             ) AS rn
      FROM ${plantSqlTable(plantId)}
      WHERE ${plantDepartmentPredicate(plantId)}
        AND kpi_name = ${escapeLiteral("OEE_p")}
        AND ${emptyColumnPredicate("machine")}
        AND ${emptyColumnPredicate("section")}
        AND ${emptyColumnPredicate("sub_section")}
        AND ${emptyColumnPredicate("product_type")}
        AND granularity = ${escapeLiteral(GRAN_MONTH)}
    ) ranked
    WHERE rn = 1
  `.trim();
  const rows = await runQuery(sql);
  return rows.length ? percentOrNull(rows[0].actual_value) : null;
}

/**
 * CR-10: resolve a landing-page time-range (`{ range, from, to }`) to a
 * YYYYMMDD date window for SQL `BETWEEN`. Defaults to "today" when no
 * range is given. `from`/`to` come in as ISO yyyy-mm-dd (per the
 * frontend DateRangeFilterDialog contract) and are normalised to
 * YYYYMMDD for the gold date column.
 */
function resolveLandingWindow(timeRange) {
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const todayKey = `${yyyy}${mm}${dd}`;
  const monthStart = `${yyyy}01`;
  const yearStart = `${yyyy}01`;

  if (!timeRange || !timeRange.range || timeRange.range === "today") {
    return { from: todayKey, to: todayKey };
  }
  if (timeRange.range === "month") {
    return { from: monthStart, to: todayKey };
  }
  if (timeRange.range === "year") {
    return { from: yearStart, to: todayKey };
  }
  if (
    timeRange.range === "custom" &&
    timeRange.from &&
    timeRange.to
  ) {
    const norm = (iso) => {
      if (!iso) return "";
      // ISO yyyy-mm-dd → yyyymmdd
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.replaceAll("-", "");
      // DD-MM-YYYY → yyyymmdd
      const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(iso);
      return m ? `${m[3]}${m[2]}${m[1]}` : "";
    };
    return { from: norm(timeRange.from), to: norm(timeRange.to) };
  }
  return { from: todayKey, to: todayKey };
}

/**
 * CR-10: time-range-aware landing KPIs. Sums Cured Tire Production
 * (Production_product × product_type="Cured Tyre" × section="Curing",
 * all machines/SKUs) and plant-wide Scrap in the active window.
 * Returns the NOS sum and the Scrap Percentage (null when Cured Tire
 * Production is 0 — the "—" tile state). The MT figure is derived
 * client-side via AVG_MASS_PER_TIRE_KG (Q-LP-02).
 */
async function landingTimeAwareKpisForPlant(plantId, timeRange) {
  const { from, to } = resolveLandingWindow(timeRange);
  if (!from || !to) {
    return { curedTyreProduction: 0, scrap: 0, scrapPct: null };
  }
  const fromEsc = escapeLiteral(from);
  const toEsc = escapeLiteral(to);

  const curedTyreSql = `
    SELECT COALESCE(SUM(actual_value), 0) AS total
    FROM ${plantSqlTable(plantId)}
    WHERE ${plantDepartmentPredicate(plantId)}
      AND kpi_name = ${escapeLiteral("Production_product")}
      AND section = ${escapeLiteral("Curing")}
      AND product_type = ${escapeLiteral("Cured Tyre")}
      AND ${emptyColumnPredicate("machine")}
      AND ${emptyColumnPredicate("sub_section")}
      AND granularity = ${escapeLiteral(GRAN_DAY)}
      AND ${DATE_YYYYMMDD} BETWEEN ${fromEsc} AND ${toEsc}
  `.trim();

  const scrapSql = `
    SELECT COALESCE(SUM(actual_value), 0) AS total
    FROM ${plantSqlTable(plantId)}
    WHERE ${plantDepartmentPredicate(plantId)}
      AND kpi_name = ${escapeLiteral("Scrap")}
      AND ${emptyColumnPredicate("machine")}
      AND ${emptyColumnPredicate("sub_section")}
      AND granularity = ${escapeLiteral(GRAN_DAY)}
      AND ${DATE_YYYYMMDD} BETWEEN ${fromEsc} AND ${toEsc}
  `.trim();

  const [curedTyreRows, scrapRows] = await Promise.all([
    runQuery(curedTyreSql),
    runQuery(scrapSql),
  ]);

  const curedTyreProduction = Number(curedTyreRows[0]?.total ?? 0);
  const scrap = Number(scrapRows[0]?.total ?? 0);
  const scrapPct =
    curedTyreProduction > 0
      ? Math.round((scrap / curedTyreProduction) * 1000) / 10
      : null;

  return { curedTyreProduction, scrap, scrapPct };
}

async function landingKpisForPlant(plantId) {
  const sql = `
    SELECT metric, actual_value
    FROM (
      SELECT
        CASE
          WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.otif)}) THEN 'otif'
          WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.yield)}) THEN 'yield'
        END AS metric,
        actual_value,
        ROW_NUMBER() OVER (
          PARTITION BY
            CASE
              WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.otif)}) THEN 'otif'
              WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.yield)}) THEN 'yield'
            END
          ORDER BY ${DATE_YYYYMMDD} DESC
        ) AS rn
      FROM ${plantSqlTable(plantId)}
      WHERE ${plantDepartmentPredicate(plantId)}
        AND LOWER(kpi_name) IN (
          ${aliasList([
            ...LANDING_KPI_ALIASES.otif,
            ...LANDING_KPI_ALIASES.yield,
          ])}
        )
        AND ${emptyColumnPredicate("machine")}
    ) ranked
    WHERE rn = 1
  `.trim();
  const [rows, oee] = await Promise.all([
    runQuery(sql),
    landingOeePForPlant(plantId),
  ]);
  const out = { oee, otif: null, yield: null };
  for (const row of rows) {
    if (row.metric && Object.hasOwn(out, row.metric)) {
      out[row.metric] = percentOrNull(row.actual_value);
    }
  }
  return out;
}

export async function getPlants(req, res, next) {
  try {
    const timeRange = {
      range: typeof req.query.range === "string" ? req.query.range : "today",
      from: typeof req.query.from === "string" ? req.query.from : "",
      to: typeof req.query.to === "string" ? req.query.to : "",
    };
    const staticSummaries = await cached(
      buildCacheKey("/plants:landing-live-kpis", {}),
      async () => {
        const enabled = PLANTS.filter((p) => p.enabled);
        const entries = await Promise.all(
          enabled.map(async (p) => {
            const plantId = normalizePlantId(p.id);
            if (!plantId) return [p.id, { oee: null, otif: null, yield: null }];
            return [p.id, await landingKpisForPlant(plantId)];
          }),
        );
        return Object.fromEntries(entries);
      },
      CACHE_TTL.STATIC_LOOKUPS,
    );
    // Time-aware KPIs are NOT cached at this layer (window changes per
    // user pick). Cheap query; per-plant fan-out.
    const enabled = PLANTS.filter((p) => p.enabled);
    const timeAwareEntries = await Promise.all(
      enabled.map(async (p) => {
        const plantId = normalizePlantId(p.id);
        if (!plantId) {
          return [p.id, { curedTyreProduction: 0, scrap: 0, scrapPct: null }];
        }
        return [p.id, await landingTimeAwareKpisForPlant(plantId, timeRange)];
      }),
    );
    const timeAwareSummaries = Object.fromEntries(timeAwareEntries);
    const data = PLANTS.map((p) => ({
      ...p,
      ...(staticSummaries[p.id] ?? { oee: null, otif: null, yield: null }),
      ...(timeAwareSummaries[p.id] ?? {
        curedTyreProduction: 0,
        scrap: 0,
        scrapPct: null,
      }),
    }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export function getFunctions(_req, res) {
  res.json({ data: FUNCTIONS });
}

export function getSections(_req, res) {
  res.json({ data: SECTIONS });
}

export function getCategoryTabs(_req, res) {
  res.json({ data: CATEGORY_TABS });
}
