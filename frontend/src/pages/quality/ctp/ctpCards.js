/**
 * CTP Quality — card registries for the Process and Product tabs, and the
 * builder that merges a summary payload into the card shape QKpiCard
 * renders.
 *
 * Source: CTP_Quality_Gold_KPI_Frontend_Handoff. Targets are not in gold, so
 * they live here (sample dashboard + handoff values). Cards marked
 * `awaitingSource` are queried like the rest but have no gold rows yet
 * ("waiting for silver"): they stay greyed until rows appear, then light up
 * with no code change. `pending` cards have no gold KPI at all.
 */
import {
  ctpCardTier,
  ctpTargetLabel,
  describeCtpTier,
} from "@/lib/ctpQualityRag.js";

const atLeast = (value) => ({ op: ">=", value });
const atMost = (value) => ({ op: "<=", value });
const below = (value) => ({ op: "<", value });

const formatPct = (v) => `${Number(v.toFixed(2))}%`;

export const CTP_PROCESS_CARDS = [
  {
    id: "pqr",
    kpiName: "PQR",
    n: "PQR / Process Audit Rating",
    u: "%",
    target: atLeast(90),
    drill: "pqr",
  },
  {
    id: "audit",
    kpiName: "Audit_Compliance",
    n: "Audit Compliance",
    u: "%",
    target: atLeast(95),
    drill: "audit",
  },
  {
    id: "mqv",
    kpiName: "MQV",
    n: "Critical Deviation",
    u: "nos",
    target: atMost(5),
    lowerIsBetter: true,
    drill: "mqv",
  },
  {
    id: "ndev",
    kpiName: "Audit_Deviation",
    n: "Non Critical Deviation",
    u: "nos",
    target: null,
    lowerIsBetter: true,
    drill: "ndev",
  },
  {
    id: "cpc",
    kpiName: "CPC",
    n: "Critical Param. Compliance",
    u: "%",
    target: atLeast(100),
    drill: "cpc",
  },
  {
    id: "ftq",
    kpiName: "FTQ",
    n: "FTQ (Curing)",
    u: "%",
    target: atLeast(99),
    drill: "ftq",
  },
  {
    id: "spr",
    kpiName: "SPR",
    n: "SPR (Straight Pass Ratio)",
    u: "%",
    target: atLeast(99),
    drill: "spr",
  },
  {
    id: "capa",
    kpiName: "Open_CAPA_NC",
    n: "Open CAPA / NC",
    u: "items",
    target: atMost(0),
    lowerIsBetter: true,
    drill: "capa",
    subLine: ({ overdue }) =>
      overdue == null
        ? null
        : {
            text: `${overdue.toLocaleString("en-IN")} overdue (> 7 days)`,
            alert: overdue > 0,
          },
  },
  { id: "spc", n: "SPC Health", pending: true },
];

export const CTP_PRODUCT_CARDS = [
  {
    id: "uy",
    kpiName: "Uniformity_Yield",
    n: "Uniformity Yield",
    u: "%",
    target: atLeast(95),
    drill: "uy",
  },
  {
    id: "fvi",
    kpiName: "First_Line_VI_Yield",
    n: "1st Line VI Yield",
    u: "%",
    target: null,
    drill: "fvi",
  },
  {
    id: "sl",
    kpiName: "Second_Line_Yield",
    n: "2nd Line Inspection Yield",
    u: "%",
    target: atLeast(98),
    drill: "sl",
  },
  {
    id: "eg",
    kpiName: "E_Grade_Count",
    n: "E-Grade Count",
    u: "nos",
    target: below(20),
    lowerIsBetter: true,
    drill: "eg",
  },
  {
    id: "sc",
    kpiName: "Product_Scrap_Pct",
    n: "Scrap %",
    u: "%",
    target: below(1),
    amberBand: 0.5,
    lowerIsBetter: true,
    drill: "sc",
  },
  {
    id: "gtw",
    kpiName: "GT_Weight_Within_1pct",
    n: "GT Weight Variation",
    u: "%",
    target: atLeast(95),
    metricLabel: "Within ±1%",
    drill: "gtw",
    subLine: ({ within2, within3 }) =>
      within2 == null && within3 == null
        ? null
        : {
            text: [
              within2 != null && `±2%: ${formatPct(within2)}`,
              within3 != null && `±3%: ${formatPct(within3)}`,
            ]
              .filter(Boolean)
              .join(" · "),
          },
  },
  {
    id: "dbm",
    kpiName: "DBM_Yield",
    n: "DBM Yield",
    u: "%",
    target: atLeast(96),
    drill: "dbm",
    awaitingSource: true,
  },
  {
    id: "dy",
    kpiName: "Dispatch_Yield",
    n: "Dispatch Yield",
    u: "%",
    target: atLeast(95),
    drill: "dy",
    awaitingSource: true,
  },
  {
    id: "oe",
    kpiName: "OE_Yield",
    n: "OE Yield",
    u: "%",
    target: atLeast(92),
    drill: "oe",
    awaitingSource: true,
  },
  {
    id: "bay",
    kpiName: "Bay_Area_Inspection_Yield",
    n: "Bay Area Inspection",
    u: "%",
    target: atLeast(99.5),
    drill: "bay",
    awaitingSource: true,
  },
  { id: "zkd", n: "ZKD", pending: true },
  { id: "cta", n: "CTA Compliance", pending: true },
];

export const CTP_TAB_CARDS = {
  process: CTP_PROCESS_CARDS,
  product: CTP_PRODUCT_CARDS,
};

const TIER_TO_STATUS = { green: "Green", amber: "Yellow", red: "Red" };

const BASELINE = {
  DAY: "vs prev day",
  SHIFT: "vs same shift prev day",
  MONTH: "vs prev month",
  YEAR: "vs prev year",
};

/** Greyed card: no drill, no trend, a reason instead of a value. */
const greyed = (def, emptyReason) => ({
  id: def.id,
  n: def.n,
  u: def.u,
  v: null,
  na: true,
  greyed: true,
  emptyReason,
});

/**
 * @param {object[]} defs CTP_PROCESS_CARDS or CTP_PRODUCT_CARDS
 * @param {Array<{id: string, value: number|null, previous: number|null,
 *   spark: {date: string, value: number}[], extra?: object}>} apiCards
 * @param {{ grain: string, isShift: boolean, periodLabel: string,
 *   emptyReason: string }} view
 * @returns {object[]} cards in registry order
 */
export function buildCtpCards(
  defs,
  apiCards,
  { grain, isShift, periodLabel, emptyReason },
) {
  const byId = new Map((apiCards ?? []).map((c) => [c.id, c]));
  return defs.map((def) => {
    if (def.pending) return greyed(def, "Coming soon — awaiting gold KPI");
    const api = byId.get(def.id);
    const value = api?.value ?? null;
    if (def.awaitingSource && value == null && !api?.spark?.length) {
      return greyed(def, "Awaiting data — source not in gold yet");
    }
    const previous = api?.previous ?? null;
    const hasBoth = value != null && previous != null;
    const trendPct =
      hasBoth && previous !== 0
        ? ((value - previous) / Math.abs(previous)) * 100
        : null;
    const trendFavourable = hasBoth
      ? def.lowerIsBetter
        ? value <= previous
        : value >= previous
      : undefined;
    const rule = { target: def.target, amberBand: def.amberBand, unit: def.u };
    const tier = ctpCardTier({ ...rule, value, trendFavourable });
    const { subLine, ...rest } = def;
    return {
      ...rest,
      v: value,
      target: ctpTargetLabel(def.target, def.u),
      status: TIER_TO_STATUS[tier],
      sp: (api?.spark ?? []).map((p) => p.value),
      trendPct,
      trendBaseline: BASELINE[isShift ? "SHIFT" : grain],
      periodLabel: value != null ? periodLabel : null,
      emptyReason,
      ragInfo: describeCtpTier(rule),
      subLine: value != null && subLine ? subLine(api?.extra ?? {}) : null,
      trendApi: true,
      trendKpiName: def.kpiName,
    };
  });
}
