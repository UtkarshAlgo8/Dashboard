import { toKpiGrid } from "./kpi-transformer.js";
import { TOTAL_DOWNTIME_NAME } from "./downtime.js";

/**
 * Technical dashboard → Production dashboard KPI sources.
 *
 * The Technical page reuses the Production KPI grid (useDashboardFetch) for
 * the KPIs Production already computes. Technical names/ids differ from
 * Production's, so each Technical card id maps to the Production category
 * tab it is fetched under and the Production card id it reads:
 *   - Held / NCR Material is Production's NCM Hold (Quality tab).
 *   - Scrap / Cured Tyre Scrap are Production's Scrap (Quality tab); in
 *     Curing, Production's Scrap is the Cured Tyre scrap.
 *   - Breakdown / Batch Change & Setup Loss are single OEE-availability-loss
 *     reasons ("Breakdown", "Setup & Change") that Production only shows
 *     inside Total Downtime; they are built here from the same reason rows.
 *
 * Building's "Cured Tyre Scrap" (bctscrap) is intentionally NOT mapped:
 * Production only has TBM scrap and Curing scrap, with no attribution of
 * cured-tyre scrap back to building — mapping it would show a wrong number.
 */
const PRODUCTION_DRILL_KPIS = [
  "Production_m",
  "Production_sku",
  "Production_m_sku",
];
const SCRAP_DRILL_KPIS = [
  "Scrap_s",
  "Scrap_reason",
  "Scrap_m",
  "Scrap_sku",
  "Scrap_m_sku",
];

// `drillKpis` are the child rows fetched when the card is clicked; the
// downtime cards drill from the reason rows already fetched for the card.
export const TECHNICAL_KPI_SOURCES = {
  prod: {
    category: "p",
    productionId: "prod",
    drillKpis: PRODUCTION_DRILL_KPIS,
  },
  scrap: { category: "q", productionId: "scrap", drillKpis: SCRAP_DRILL_KPIS },
  ctscrap: {
    category: "q",
    productionId: "scrap",
    drillKpis: SCRAP_DRILL_KPIS,
  },
  ncr: { category: "q", productionId: "ncm", drillKpis: ["NCM_Hold_sku"] },
  bdown: { category: "downtime", productionId: "bdown", reason: "Breakdown" },
  bcs: { category: "downtime", productionId: "bcs", reason: "Setup & Change" },
};

// Single-reason variants of Production's Total Downtime card: same
// per-machine averaging and period rules, narrowed to one reason. They drill
// into the Total Downtime panel, opened on their own reason.
const DOWNTIME_REASON_KPIS = Object.entries(TECHNICAL_KPI_SOURCES)
  .filter(([, source]) => source.reason)
  .map(([id, source]) => ({
    id,
    reasons: [source.reason],
    name: TOTAL_DOWNTIME_NAME,
    unit: "min",
    agg: "SUM",
    drillType: "downtime",
    drillTargets: null,
  }));

/**
 * Breakdown and Setup & Change cards for one section, from the reason rows
 * useDashboardFetch returns as `downtimeRows`.
 *
 * @param {object[] | null} downtimeRows
 * @param {{ section: string, granularity: string, mode: string,
 *           plantId: string }} opts section is the gold name ("Curing")
 * @returns {object[]}
 */
export function toDowntimeReasonKpis(
  downtimeRows,
  { section, granularity, mode, plantId },
) {
  if (!Array.isArray(downtimeRows) || downtimeRows.length === 0) return [];
  return DOWNTIME_REASON_KPIS.flatMap((kpiDef) =>
    toKpiGrid([], {
      section,
      category: "P",
      granularity,
      mode,
      plantId,
      downtimeRows,
      kpiDefs: [kpiDef],
    }),
  );
}

/**
 * The live Production card behind one Technical KPI definition, relabelled
 * with the Technical id/name, or null when the KPI has no Production source
 * or the source card is absent.
 *
 * @param {{ id: string, name: string }} definition Technical KPI definition
 * @param {Record<string, object[]>} kpisByCategory Production cards keyed by
 *        category tab id ("p", "q")
 * @returns {object | null}
 */
export function resolveTechnicalKpi(definition, kpisByCategory) {
  const source = TECHNICAL_KPI_SOURCES[definition.id];
  if (!source) return null;
  const cards = kpisByCategory?.[source.category];
  if (!Array.isArray(cards)) return null;
  const live = cards.find(
    (kpi) => String(kpi?.id ?? "").toLowerCase() === source.productionId,
  );
  if (!live) return null;
  return { ...live, id: definition.id, name: definition.name };
}

// Building's aggregate product: its rows already total every other TBM
// product, so a machine's card reads it alone (as the section card does).
const BUILDING_AGGREGATE_PRODUCT = "Green Tyre";
const MACHINE_PRODUCTION_KPI = {
  id: "prod",
  name: "Production_m",
  agg: "SUM",
  drillType: "machine",
  drillTargets: null,
};

/**
 * The Production card for one Building machine, from that machine's
 * `Production_m` rows (fetched with a machine parentFilter), or null when
 * the machine has no rows in the window.
 *
 * @param {object[] | null} rows
 * @param {{ granularity: string, mode: string, plantId: string }} opts
 * @returns {object | null}
 */
export function toMachineProductionKpi(rows, { granularity, mode, plantId }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const [card] = toKpiGrid(rows, {
    section: "TBM",
    category: "P",
    granularity,
    mode,
    plantId,
    productType: BUILDING_AGGREGATE_PRODUCT,
    kpiDefs: [MACHINE_PRODUCTION_KPI],
  });
  return card ?? null;
}
