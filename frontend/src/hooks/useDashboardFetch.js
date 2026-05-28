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
      // Merge new drill targets with existing ones so multiple drills
      // (one per clicked card) all get their children fetched together.
      const existing = state.drillKpis ?? [];
      const incoming = action.payload.kpiNames ?? [];
      const merged = [...new Set([...existing, ...incoming])];
      return {
        ...state,
        drillKpis: merged.length > 0 ? merged : null,
        // Store source kpi id separately (multi-drill: last-wins is fine for UI state).
        drillSourceKpiId: action.payload.sourceKpiId,
        parentFilters: {
          ...state.parentFilters,
          ...action.payload.parentFilters,
        },
        date: null,
      };
    }
    case "RESET_DRILL":
      return {
        ...state,
        drillKpis: null,
        drillSourceKpiId: null,
        parentFilters: {},
        date: state.date ?? null,
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
  // (returns Mixing/Productivity data regardless of what you ask for).
  // We fetch ALL sections + categories in one request and filter
  // client-side via `row.section ===` + ALLOWED_KPIS[section][category]
  // in toKpiGrid. This also means switching section/category does NOT
  // refetch — the payload is unchanged — so UI navigation stays instant
  // and the user's date filter is naturally preserved.
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

  const fetchPayload = {
    context: buildContext(state),
    date: state.date,
    from: state.from,
    to: state.to,
    drillKpis: state.drillKpis,
    parentFilters: state.parentFilters,
    // Backend caps at 10000. We pull the max because we now fetch across
    // all 4 sections × 5 categories in one shot and filter client-side.
    limit: 10000,
  };

  const { data, isLoading, error } = usePolledQuery(
    () => fetchDashboard(fetchPayload),
    {
      enabled: true,
      interval: 0,
      deps: [JSON.stringify(fetchPayload)],
    },
  );

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
    error,
    setFilter,
    drillInto,
    resetDrill,
    resetAll,
  };
}
