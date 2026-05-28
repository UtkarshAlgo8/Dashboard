/**
 * useDashboardFetch — v2 dashboard data hook.
 *
 * Implements the universal fetch pattern per docs/dashboard_logic_guide_v2.pdf.
 *
 * State lives here (not in BanmoreProduction) so the drill chain carries
 * forward across filter changes:
 *   section, sub_section, product_type, category, granularity, date,
 *   drillKpis (array = drill targets), drillSourceKpiId (original clicked KPI id),
 *   parentFilters (machine/itemcode)
 *
 * When drillKpis is set, date is cleared (drill views ignore dates).
 * When a top-level filter (section/category) changes, drill is reset.
 * When granularity/date changes, drill is preserved.
 *
 * Returns { kpis, drillRows, isLoading, error, state, setFilter,
 *          drillInto, resetDrill, resetAll }.
 */
import { useReducer, useCallback } from "react";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { toKpiGrid, toDrillRows } from "@/lib/kpi-transformer.js";
import client from "@/api/client.js";

// ---------- state shape & actions ----------

const initialState = {
  section: "mix",
  subSection: null,
  productType: null,
  category: "p",
  granularity: null, // null = no granularity filter (Lambda ignores category when granularity is set)
  date: null, // single-day equality (Today)
  from: null, // range start (Month / Year / custom)
  to: null, // range end
  drillKpis: null, // string[] — drill target kpi_names
  drillSourceKpiId: null, // string — the KPI that was originally clicked
  parentFilters: {},
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_FILTER":
      // section/category change uses resetDrill=true. Only the drill
      // chain resets — date / from / to persist across navigation so the
      // user's time-range selection survives switching tabs.
      return {
        ...state,
        ...action.payload,
        ...(action.resetDrill
          ? {
              drillKpis: null,
              drillSourceKpiId: null,
              parentFilters: {},
            }
          : {}),
      };
    case "SET_DRILL": {
      // Single-drill UX: replace previous drill targets with the new
      // card's targets. Date filter is preserved across drill changes.
      const incoming = action.payload.kpiNames ?? [];
      return {
        ...state,
        drillKpis: incoming.length > 0 ? incoming : null,
        drillSourceKpiId: action.payload.sourceKpiId,
        parentFilters: action.payload.parentFilters ?? {},
      };
    }
    case "RESET_DRILL":
      return {
        ...state,
        drillKpis: null,
        drillSourceKpiId: null,
        parentFilters: {},
      };
    case "RESET_ALL":
      return initialState;
    default:
      return state;
  }
}

// ---------- context builder ----------

function buildContext(state) {
  const ctx = {};
  if (state.subSection) ctx.sub_section = state.subSection;
  if (state.productType) ctx.product_type = state.productType;
  // section and category are NOT sent — the Lambda ignores both filters
  // when combined with multi-kpi drill targets (returns Mixing rows
  // even when asked for Curing). We fetch ALL sections + categories
  // in one request and filter client-side via row.section + ALLOWED_KPIS
  // in toKpiGrid. Switching section/category becomes instant since the
  // payload is unchanged.
  if (state.granularity) ctx.granularity = state.granularity;
  // date / from / to are NOT in context — they are top-level payload
  // fields. The backend rejects them inside the context object.
  return ctx;
}

function sectionIdToName(id) {
  // Artifact section IDs → gold_dummy section values.
  return { mix: "Mixing", stk: "Stock", tbm: "TBM", cur: "Curing" }[id] ?? id;
}
// ---------- API call ----------

async function fetchDashboard(payload) {
  return client.post("/dashboard/fetch", payload).then((r) => r.data ?? r);
}

// ---------- hook ----------

export function useDashboardFetch() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Landing payload — always fetched. Carries the 4 KPI cards for every
  // (section, category) combo. drillKpis is intentionally null here so
  // the upstream Lambda's 5000-row cap is spent only on landing rows
  // (drill_down_level = 1), guaranteeing every section's 4 cards have
  // data even when a drill is open.
  const landingPayload = {
    context: buildContext(state),
    date: state.date,
    from: state.from,
    to: state.to,
    drillKpis: null,
    parentFilters: {},
    limit: 10000,
  };

  // Drill payload — only fetched when a card is drilled. Returns drill
  // children for the active card. Lambda's 5000-row cap applies only to
  // drill-level rows here, not the landing band.
  const drillPayload = state.drillKpis
    ? {
        context: buildContext(state),
        date: state.date,
        from: state.from,
        to: state.to,
        drillKpis: state.drillKpis,
        parentFilters: state.parentFilters,
        limit: 10000,
      }
    : null;

  const { data: landingData, isLoading: landingLoading, error: landingError } =
    usePolledQuery(() => fetchDashboard(landingPayload), {
      enabled: true,
      interval: 0,
      deps: [JSON.stringify(landingPayload)],
    });

  const { data: drillData, isLoading: drillLoading, error: drillError } =
    usePolledQuery(
      () => (drillPayload ? fetchDashboard(drillPayload) : Promise.resolve([])),
      {
        enabled: Boolean(drillPayload),
        interval: 0,
        deps: [JSON.stringify(drillPayload)],
      },
    );

  // Merge: landing always present; drill children appended when a card
  // is drilled. The transformer and panels both read from this combined
  // list — landing rows feed the 4 KPI cards, drill rows feed the panel.
  const data =
    landingData && Array.isArray(landingData)
      ? state.drillKpis && Array.isArray(drillData)
        ? [...landingData, ...drillData]
        : landingData
      : null;
  const isLoading = landingLoading || (Boolean(drillPayload) && drillLoading);
  // Drill-only loading flag so drill panels can render a skeleton while
  // their fetch is in flight, without confusing it with landing reload.
  const isDrillLoading = Boolean(drillPayload) && drillLoading;
  const error = landingError || drillError || null;

  const kpis = data
    ? toKpiGrid(data, {
        section: sectionIdToName(state.section),
        category: state.category.toUpperCase(),
      })
    : [];
  const drillRows = data && state.drillKpis !== null ? toDrillRows(data) : null;

  const setFilter = useCallback((payload, resetDrill = false) => {
    dispatch({ type: "SET_FILTER", payload, resetDrill });
  }, []);

  /**
   * Initiate a drill into `kpiNames` (from kpi.drillDown).
   * `sourceKpiId` is the original clicked KPI's id — used by the router
   * to pick the right panel (OEE → OeeDrillPanel, etc.).
   */
  const drillInto = useCallback((kpiNames, sourceKpiId, parentFilters = {}) => {
    dispatch({
      type: "SET_DRILL",
      payload: { kpiNames, sourceKpiId, parentFilters },
    });
  }, []);

  const resetDrill = useCallback(() => {
    dispatch({ type: "RESET_DRILL" });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: "RESET_ALL" });
  }, []);

  return {
    state,
    kpis,
    drillRows,
    rawRows: data ?? null,
    isLoading,
    isDrillLoading,
    error,
    setFilter,
    drillInto,
    resetDrill,
    resetAll,
  };
}
