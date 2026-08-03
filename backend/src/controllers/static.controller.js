import { CACHE_TTL, cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { escapeLiteral } from "../queries/queries.js";
import { DATE_YYYYMMDD } from "../queries/dashboard-query.js";
import {
  normalizePlantId,
  plantDepartmentPredicate,
  plantSqlTable,
  emptyColumnPredicate,
} from "../utils/normalize.js";

/**
 * Lookup data + handlers. Labels/coordinates are app configuration; KPI
 * values shown on live plant cards are read from the gold DB.
 */

// sx / sy are SVG coordinates for the India map markers (viewBox
// 0..MAP_W × 0..MAP_H, see frontend/src/lib/indiaMap.js). `sub` is the
// subtitle shown on the plant card and the map hover popover. oe/otif/
// yield are the headline KPI values surfaced on the card.
export const PLANTS = [
  {
    id: "banmore",
    name: "Banmore Plant",
    sub: "Gwalior, Madhya Pradesh",
    location: "Banmore",
    state: "Madhya Pradesh",
    tyreType: "PCR",
    sx: 169.7,
    sy: 228.6,
    oe: null,
    otif: null,
    yield: null,
    enabled: true,
  },
  {
    id: "chennai",
    name: "Chennai Plant",
    sub: "Tamil Nadu",
    location: "Chennai",
    state: "Tamil Nadu",
    tyreType: "PCR/TBR",
    sx: 202.0,
    sy: 446.6,
    oe: null,
    otif: null,
    yield: null,
    enabled: true,
  },
  {
    id: "laksar",
    name: "Laksar Plant",
    sub: "Haridwar, Uttarakhand",
    location: "Laksar",
    state: "Uttarakhand",
    tyreType: "PCR/TBR",
    sx: 167.6,
    sy: 170.2,
    oe: null,
    otif: null,
    yield: null,
    enabled: false,
  },
  {
    id: "mysore",
    name: "Mysore Plant",
    sub: "Karnataka",
    location: "Mysore",
    state: "Karnataka",
    tyreType: "PCR/TBR",
    sx: 163.0,
    sy: 441.0,
    oe: null,
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

const LANDING_KPI_ALIASES = {
  oe: ["oe", "oee", "oee_o"],
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

async function landingKpisForPlant(plantId) {
  const sql = `
    SELECT metric, actual_value
    FROM (
      SELECT
        CASE
          WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.oe)}) THEN 'oe'
          WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.otif)}) THEN 'otif'
          WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.yield)}) THEN 'yield'
        END AS metric,
        actual_value,
        ROW_NUMBER() OVER (
          PARTITION BY
            CASE
              WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.oe)}) THEN 'oe'
              WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.otif)}) THEN 'otif'
              WHEN LOWER(kpi_name) IN (${aliasList(LANDING_KPI_ALIASES.yield)}) THEN 'yield'
            END
          ORDER BY ${DATE_YYYYMMDD} DESC
        ) AS rn
      FROM ${plantSqlTable(plantId)}
      WHERE ${plantDepartmentPredicate(plantId)}
        AND LOWER(kpi_name) IN (
          ${aliasList([
            ...LANDING_KPI_ALIASES.oe,
            ...LANDING_KPI_ALIASES.otif,
            ...LANDING_KPI_ALIASES.yield,
          ])}
        )
        AND ${emptyColumnPredicate("machine")}
    ) ranked
    WHERE rn = 1
  `.trim();
  const rows = await runQuery(sql);
  const out = { oe: null, otif: null, yield: null };
  for (const row of rows) {
    if (row.metric && Object.hasOwn(out, row.metric)) {
      out[row.metric] = percentOrNull(row.actual_value);
    }
  }
  return out;
}

export async function getPlants(_req, res, next) {
  try {
    const summaries = await cached(
      buildCacheKey("/plants:landing-live-kpis", {}),
      async () => {
        const enabled = PLANTS.filter((p) => p.enabled);
        const entries = await Promise.all(
          enabled.map(async (p) => {
            const plantId = normalizePlantId(p.id);
            if (!plantId) return [p.id, { oe: null, otif: null, yield: null }];
            return [p.id, await landingKpisForPlant(plantId)];
          }),
        );
        return Object.fromEntries(entries);
      },
      CACHE_TTL.STATIC_LOOKUPS,
    );
    const data = PLANTS.map((p) => ({
      ...p,
      ...(summaries[p.id] ?? { oe: null, otif: null, yield: null }),
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
