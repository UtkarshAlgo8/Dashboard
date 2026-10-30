/**
 * CTP Quality — Process tab card registry and card builder.
 *
 * The five live cards come from the Process Audit gold
 * (CTP_Process_Audit_Gold_KPI_v1). The four pending cards are in the design
 * but have no gold KPI name yet; they stay greyed out until the pipeline
 * publishes them and their names are added here.
 */
import { describeKpiTier, evaluateKpiTier } from "@/lib/thresholds.js";

export const CTP_PROCESS_CARDS = [
  {
    id: "pqr",
    kpiName: "PQR",
    n: "PQR / Process Audit Rating",
    u: "%",
    target: 90,
    targetLabel: "90%",
    drill: "pqr",
  },
  {
    id: "audit",
    kpiName: "Audit_Compliance",
    n: "Audit Compliance",
    u: "%",
    target: 95,
    targetLabel: "95%",
    drill: "audit",
  },
  {
    id: "mqv",
    kpiName: "MQV",
    n: "Critical Deviation",
    u: "nos",
    target: 5,
    targetLabel: "≤ 5",
    lowerIsBetter: true,
    drill: "mqv",
  },
  {
    id: "ndev",
    kpiName: "Audit_Deviation",
    n: "Non Critical Deviation",
    u: "nos",
    target: null,
    targetLabel: null,
    lowerIsBetter: true,
    drill: "ndev",
  },
  {
    id: "cpc",
    kpiName: "CPC",
    n: "Critical Param. Compliance",
    u: "%",
    target: 100,
    targetLabel: "100%",
    drill: "cpc",
  },
];

export const CTP_PENDING_CARDS = [
  { id: "spc", n: "SPC Health" },
  { id: "ftq", n: "FTQ" },
  { id: "spr", n: "SPR (Straight Pass Ratio)" },
  { id: "capa", n: "Open CAPA / NC" },
];

const TIER_TO_STATUS = { green: "Green", amber: "Yellow", red: "Red" };

const BASELINE = {
  DAY: "vs prev day",
  SHIFT: "vs same shift prev day",
  MONTH: "vs prev month",
  YEAR: "vs prev year",
};

/**
 * Merge the summary payload into the card shape QKpiCard renders.
 *
 * @param {Array<{id: string, value: number|null, previous: number|null,
 *   spark: {date: string, value: number}[]}>} apiCards
 * @param {{ grain: string, isShift: boolean, periodLabel: string }} view
 */
export function buildProcessCards(apiCards, { grain, isShift, periodLabel }) {
  const byId = new Map((apiCards ?? []).map((c) => [c.id, c]));
  const live = CTP_PROCESS_CARDS.map((def) => {
    const api = byId.get(def.id);
    const value = api?.value ?? null;
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
    const tierInput = {
      id: def.id,
      name: def.n,
      value,
      target: def.target,
      trendFavourable,
    };
    const tier = value == null ? null : evaluateKpiTier(tierInput);
    return {
      ...def,
      v: value,
      target: def.targetLabel,
      status: TIER_TO_STATUS[tier],
      sp: (api?.spark ?? []).map((p) => p.value),
      trendPct,
      trendBaseline: BASELINE[isShift ? "SHIFT" : grain],
      periodLabel: value != null ? periodLabel : null,
      emptyReason: "No audits for this period",
      ragInfo: describeKpiTier(tierInput),
      trendApi: true,
      trendKpiName: def.kpiName,
    };
  });
  const pending = CTP_PENDING_CARDS.map((def) => ({
    ...def,
    v: null,
    na: true,
    emptyReason: "Coming soon — awaiting gold KPI",
  }));
  return { live, pending };
}
