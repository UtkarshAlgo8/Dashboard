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
import { useEffect, useReducer, useCallback, useMemo } from "react";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import {
  toKpiGrid,
  toDrillRows,
  landingKpiNames,
  readsCuringPcrSkuTotal,
  CURING_PCR_TOTAL_KPI,
} from "@/lib/kpi-transformer.js";
import { buildDatePayload } from "@/lib/timeRange.js";
import { DOWNTIME_REASONS } from "@/lib/downtime.js";
import { ctpDowntimePayload } from "@/lib/ctpDowntime.js";
import { getAnchors } from "@/api/dashboard.js";
import client from "@/api/client.js";

const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const DASHBOARD_CACHE_MAX_ENTRIES = 80;
const DASHBOARD_PAGE_SIZE = 4500;
const dashboardCache = new Map();
const dashboardPending = new Map();

// ---------- state shape & actions ----------

const initialState = {
  section: "cur",
  subSection: null,
  productType: null,
  // new_change.md C8/C9: the pinned unit_of_measurement. Multi-unit
  // sub-sections (Stock Extruder / 3 Roll / Bead) and Mixing (KG vs Batch)
  // MUST pin one — the two units are different measures of the same
  // production and may never be combined. It is applied client-side (the
  // transformer + shift box) rather than in the outgoing context, so that
  // pinning a Production unit never filters away the unit-less OEE rows
  // that share the same landing fetch.
  unitOfMeasurement: null,
  // The selected tyre line. null = the plant's default (no filter for a
  // two-line plant like CTP; the single line for a one-line plant, where
  // the header shows a static badge instead of a picker).
  tyreType: null,
  category: "p",
  granularity: null, // null = no granularity filter (Lambda ignores category when granularity is set)
  // "snapshot" → transformer takes latest row's actual_value as the
  // headline (used for Today/Month/Year presets via the pre-aggregated
  // Daily/MTD/YTD rows). "aggregate" → transformer rolls Daily rows per
  // spec §9 (used for custom from/to ranges).
  mode: "snapshot",
  date: null, // single-day equality (Today)
  from: null, // range start (Month / Year / custom)
  to: null, // range end
  // new_change.md C6: true when the USER picked an explicit date / range.
  // Per-KPI anchoring applies to the DEFAULT view only — an explicit window
  // always wins, and a KPI with no rows inside it shows an empty state.
  userWindow: false,
  // The single day the KPI headlines must be dated (Today preset). null =
  // headlines read the newest row in the window.
  headlineDate: null,
  drillKpis: null, // string[] — drill target kpi_names
  drillSourceKpiId: null, // string — the KPI that was originally clicked
  // new_change.md C3/C6: the CARD's already-resolved date. The drill reuses
  // it verbatim and never re-resolves a date of its own.
  drillDate: null,
  parentFilters: {},
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_FILTER": {
      // section/category change uses resetDrill=true. Only the drill
      // chain resets — date / from / to persist across navigation so the
      // user's time-range selection survives switching tabs.
      //
      // `drillDate` is the CARD's resolved date (C3/C6), captured when the
      // drill was opened. It belongs to the window that was active THEN, so a
      // new date window makes it stale: the drill fetch keeps asking for the
      // old day while the panel filters on the card's freshly-resolved one.
      // The two disagree and the machine table renders "not available" until
      // the user closes and reopens the drill, which re-pins it. Drop it and
      // let the drill inherit the new window; the panel still narrows to the
      // card's date client-side, and that date is always inside the window.
      const changesWindow =
        "date" in action.payload ||
        "from" in action.payload ||
        "to" in action.payload;
      return {
        ...state,
        ...action.payload,
        ...(changesWindow ? { drillDate: null } : {}),
        ...(action.resetDrill
          ? {
              drillKpis: null,
              drillSourceKpiId: null,
              drillDate: null,
              parentFilters: {},
            }
          : {}),
      };
    }
    case "SET_DRILL": {
      // Single-drill UX: replace previous drill targets with the new
      // card's targets. Date filter is preserved across drill changes.
      const incoming = action.payload.kpiNames ?? [];
      return {
        ...state,
        drillKpis: incoming.length > 0 ? incoming : null,
        drillSourceKpiId: action.payload.sourceKpiId,
        // new_change.md C3: inherit the CARD's resolved date (C6 anchor).
        drillDate: action.payload.cardDate ?? null,
        parentFilters: action.payload.parentFilters ?? {},
      };
    }
    case "RESET_DRILL":
      return {
        ...state,
        drillKpis: null,
        drillSourceKpiId: null,
        drillDate: null,
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
  // section + category ARE sent to the backend. The v24 gold table is
  // large (tens of thousands of drill_down_level=1 rows per week), so a
  // "fetch everything, filter client-side" approach blows the upstream
  // 5000–10000 row cap and silently drops KPI rows. The backend honours
  // these filters on a landing query (no drillKpis), and the section
  // predicate OR-includes plant-level NULL-section rows so Absenteeism
  // still shows. Result: ~a few thousand rows per section/category.
  ctx.section = sectionIdToName(state.section);
  ctx.category = categoryIdToName(state.category);
  // sub_section / product_type are sent to the backend (server-side
  // filter) so changing them is a real API call. The backend keeps rows
  // with no value for these columns (NULL/'') too, so section-level KPIs
  // (e.g. OEE) and plant-level KPIs (no sub_section) still come through.
  if (state.subSection) ctx.sub_section = state.subSection;
  // product_type only applies to the tabs that have product pills
  // (Productivity / Quality). On Cost / Morale / Safety the KPIs carry a
  // DIFFERENT product_type (e.g. "Compound"), so sending the Productivity
  // product type would filter them all out.
  if ((state.category === "p" || state.category === "q") && state.productType) {
    ctx.product_type = state.productType;
  }
  // tyre_type: sent for every category — the line a KPI belongs to is a
  // property of the row, not of the tab. "All" is omitted rather than sent,
  // since it means "no restriction".
  if (state.tyreType && state.tyreType !== "All") {
    ctx.tyre_type = state.tyreType;
  }
  if (state.granularity) ctx.granularity = state.granularity;
  // date / from / to are NOT in context — they are top-level payload
  // fields. The backend rejects them inside the context object.
  return ctx;
}

function sectionIdToName(id) {
  // Artifact section IDs → gold_dummy section values.
  return { mix: "Mixing", stk: "Stock", tbm: "TBM", cur: "Curing" }[id] ?? id;
}

function categoryIdToName(id) {
  // Tab IDs → gold_dummy category values.
  return (
    {
      p: "Productivity",
      q: "Quality",
      c: "Cost",
      m: "Morale",
      s: "Safety",
      i: "Inventory",
    }[id] ?? id
  );
}
// ---------- API call ----------

// Athena serializes EVERY column as a string ("1641178.55", "" for empty),
// whereas the legacy DuckDB path returned the measure columns as JSON
// numbers / null. Raw-row drill panels (Production / OEE / Downtime) gate on
// `typeof r.actual_value === "number"`, so under Athena those gates match
// zero rows and the tables render blank. Coerce the measure columns back to
// number|null at the fetch boundary to restore the pre-migration row shape;
// numberOrNull-based consumers (KPI grid, toDrillRows) already tolerate both.
const MEASURE_COLUMNS = ["actual_value", "threshold_value"];

function coerceMeasures(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    if (!r || typeof r !== "object") return r;
    const out = { ...r };
    for (const col of MEASURE_COLUMNS) {
      const v = out[col];
      if (typeof v === "number") continue;
      const n = typeof v === "string" ? Number.parseFloat(v) : NaN;
      out[col] = Number.isFinite(n) ? n : null;
    }
    return out;
  });
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function pruneDashboardCache() {
  const now = Date.now();
  for (const [key, entry] of dashboardCache) {
    if (entry.expiresAt <= now) dashboardCache.delete(key);
  }
  while (dashboardCache.size > DASHBOARD_CACHE_MAX_ENTRIES) {
    const oldestKey = dashboardCache.keys().next().value;
    dashboardCache.delete(oldestKey);
  }
}

async function fetchCachedDashboard(payload) {
  const key = stableStringify(payload);
  const now = Date.now();
  const cached = dashboardCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const inflight = dashboardPending.get(key);
  if (inflight) return inflight;

  const promise = fetchPagedDashboard(payload)
    .then((value) => {
      dashboardCache.set(key, {
        value,
        expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
      });
      pruneDashboardCache();
      return value;
    })
    .finally(() => {
      dashboardPending.delete(key);
    });
  dashboardPending.set(key, promise);
  return promise;
}

/**
 * One kpi-data call, returning the WHOLE response envelope:
 *   { rows, truncated, baseline, baselineWindow, baselineGranularity }
 *
 * new_change.md C10: `truncated` says the row cap was hit and the total is
 * INCOMPLETE — the UI must never present it as final.
 * new_change.md C15/C16: `baseline` holds the preceding comparison window,
 * queried with the IDENTICAL pins (only the date window moved), and
 * `baselineWindow` names it for the hover label.
 * `rawEnvelope` keeps the client interceptor from unwrapping to `.data` and
 * discarding those siblings.
 */
async function fetchDashboard(payload) {
  const body = await client.post("/dashboard/kpi-data", payload, {
    rawEnvelope: true,
  });
  // Tolerate a bare array (older/unwrapped shape) so nothing hard-fails.
  const envelope = Array.isArray(body) ? { data: body } : (body ?? {});
  console.log("[kpi-data]", {
    sent: payload,
    receivedRows: (envelope.data ?? []).length,
    receivedBaseline: (envelope.baseline ?? []).length,
    baselineWindow: envelope.baselineWindow,
    baselineGranularity: envelope.baselineGranularity,
  });
  return {
    rows: coerceMeasures(envelope.data ?? []),
    truncated: Boolean(envelope.truncated),
    baseline: Array.isArray(envelope.baseline)
      ? coerceMeasures(envelope.baseline)
      : null,
    baselineWindow: envelope.baselineWindow ?? null,
    baselineGranularity: envelope.baselineGranularity ?? null,
    // The moment this response actually arrived from the backend. Stamped on
    // the envelope (not in the component) so it flows through the cache and a
    // cache hit correctly reports the ORIGINAL fetch time, not "now".
    fetchedAt: new Date(),
  };
}

async function fetchPagedDashboard(payload) {
  if (!payload?.drillOnly) return fetchDashboard(payload);

  const pageLimit =
    Number.isInteger(payload.limit) && payload.limit > 0
      ? Math.min(payload.limit, DASHBOARD_PAGE_SIZE)
      : DASHBOARD_PAGE_SIZE;
  let offset =
    Number.isInteger(payload.offset) && payload.offset > 0 ? payload.offset : 0;
  const rows = [];
  let lastEnvelope = null;

  for (let page = 0; page < 20; page += 1) {
    const envelope = await fetchDashboard({
      ...payload,
      limit: pageLimit,
      offset,
    });
    lastEnvelope = envelope;
    rows.push(...(envelope.rows ?? []));
    if (!envelope.truncated || !envelope.rows?.length) break;
    offset += envelope.rows.length;
  }

  return {
    ...(lastEnvelope ?? {}),
    rows,
    truncated: Boolean(lastEnvelope?.truncated),
  };
}

/**
 * new_change.md C15: which views need a server-side baseline.
 * A day-wise / shift card derives its D−1 baseline from the rows already in
 * the trailing window, so it costs nothing. A MONTH card (previous COMPLETE
 * month) and a custom RANGE card (preceding equal-length window) read rows
 * this fetch never asks for, so the backend must supply them.
 */
function needsBaseline(state) {
  if (state.mode === "aggregate") return true;
  const gran = String(state.granularity ?? "").toUpperCase();
  if (gran === "MONTH") return true;
  // Single-day (Today) and single-shift windows can't read D-1 from the
  // trailing-window rows: the headline is pinned to TODAY, the trailing
  // window is today-only when headlineDate is set. Ask the backend for it.
  if (state.headlineDate) return true;
  return false;
}

// ---------- hook ----------

export function useDashboardFetch({ plantId = "banmore" } = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // The kpi_names the grid renders for the active (section, category) — the
  // same allow-list toKpiGrid narrows to, so the fetch and the filter stay in
  // lockstep.
  const gridKpiNames = landingKpiNames(
    sectionIdToName(state.section),
    state.category.toUpperCase(),
  );

  // Landing payload — always fetched. Carries the 4 KPI cards for every
  // (section, category) combo.
  //
  // new_change.md C2: the landing fetch USED to omit granularity so one
  // call returned DAY + SHIFT A/B/C + MONTH together and each consumer
  // picked its own. That is exactly the predicate the backend now refuses
  // to drop — an absent granularity resolves to DAY, so a Shift A/B/C
  // selection came back as DAY rows and the transformer (which filters to
  // SHIFT A) blanked every card. Pin the ONE granularity the cards are
  // rendered at; the shift-comparison box makes its own per-shift calls.
  const landingPayload = {
    plantId,
    context: {
      ...buildContext(state),
      granularity: state.granularity ?? "DAY",
    },
    // new_change.md C1: from/to OR a single date — never both, and the ISO
    // time component is stripped before it goes out.
    ...buildDatePayload(state),
    // new_change.md C7: the TBM/Curing Production CARD reads
    // `Production_product` (the plain `Production` rows carry only the
    // overall row, so every product selection shows the same number). That
    // KPI is not part of the landing band, so it has to be requested by
    // name — without `drillOnly` the landing rows still come back alongside
    // it, and the backend pins product_type to exactly one value for the
    // product-split levels (C4), so the aggregate is never summed with its
    // children.
    drillKpis:
      state.section === "tbm" || state.section === "cur"
        ? [
            "Production_product",
            // Curing PCR: the card's total comes from the SKU leaf.
            ...(readsCuringPcrSkuTotal(
              sectionIdToName(state.section),
              state.tyreType,
            )
              ? [CURING_PCR_TOTAL_KPI]
              : []),
          ]
        : null,
    // Fetch ONLY the KPIs this grid draws. The landing band otherwise returns
    // every top-level kpi_name in the (section, category) — 6 names in Mixing
    // Productivity against the 3 on screen — and toKpiGrid discards the
    // remainder against this very list. Measured over a default 8-day window
    // (2026-08-06 → 08-13, Banmore): 72 → 40 rows in Mixing, 298 → 162 in
    // Stock. An empty list means the combo has no catalogue entry, in which
    // case we send nothing and keep the old unfiltered behaviour rather than
    // fetching zero rows.
    ...(gridKpiNames.length > 0 ? { landingKpis: gridKpiNames } : {}),
    parentFilters: {},
    limit: 10000,
    // new_change.md C15: ask for the preceding comparison window where the
    // card cannot derive one from the rows it already has.
    ...(needsBaseline(state) ? { withBaseline: true } : {}),
  };

  // CR-11 / Q-DT-01: the 6 OEE-availability-loss reasons only exist at
  // DAY granularity in gold (no MONTH roll-up). The landing fetch above
  // pins to state.granularity which is MONTH for the Month preset —
  // the reasons come back empty and the TotalDowntime tile renders "—".
  // Run a parallel DAY-granularity fetch for the 6 reasons and merge
  // its rows into the data the transformer sees.
  //
  // The 6 reasons live at drill_down_level=2 — they're NOT in the
  // backend's LANDING_PREDICATE — so we must fetch them via drillKpis
  // (not landingKpis). drillOnly=true + drillKpis=names is the only
  // path that returns drill-level rows. landingKpis is intentionally
  // omitted (the backend ignores it under drillOnly=true anyway).
  const includesTotalDowntime =
    state.section === "mix" ||
    state.section === "stk" ||
    state.section === "tbm" ||
    state.section === "cur";
  // CR-11: follow a Shift A/B/C selection instead of always reading DAY.
  // The reason leaves are stored under SHIFT A/B/C as well as DAY, and the
  // three shifts partition the day exactly (verified in gold: Mixing Aug-2026
  // 10,921 + 9,120 + 10,477 = 30,518 = the DAY total). Pinning DAY under a
  // shift selection therefore showed the WHOLE day's downtime on a card
  // labelled "Shift A" — roughly 3x the figure asked for. MONTH stays on DAY
  // so the tile keeps per-date rows to draw a sparkline from.
  const downtimeGranularity = String(state.granularity ?? "")
    .toUpperCase()
    .startsWith("SHIFT")
    ? state.granularity
    : "DAY";

  const downtimePayload = includesTotalDowntime
    ? {
        plantId,
        context: {
          ...buildContext(state),
          granularity: downtimeGranularity,
        },
        ...buildDatePayload(state),
        drillKpis: [...DOWNTIME_REASONS],
        drillOnly: true,
        limit: 10000,
      }
    : null;

  const totalDowntimePayload = includesTotalDowntime
    ? ctpDowntimePayload({
        plantId,
        category: state.category,
        context: buildContext(state),
        dates: buildDatePayload(state),
        withBaseline: needsBaseline(state),
      })
    : null;

  // Never fetch without a resolved date window: a single day (Today) OR a
  // from/to range (Month/Year/custom). On first mount the window is null
  // until the page settles the as-of anchor + preset — gating here stops the
  // redundant no-date landing fetch that used to fire before the range was
  // known (and refetch again once it resolved).
  const hasDateRange = Boolean((state.from && state.to) || state.date);

  // Drill payload — only fetched when a card is drilled. Returns drill
  // children for the active card. Lambda's 5000-row cap applies only to
  // drill-level rows here, not the landing band.
  //
  // Drilldown inherits the SAME granularity as the card (journey.md §5):
  // if the card is Shift B, every machine row is Shift B too; Month → MTD,
  // Year → YTD, Today → Daily. We therefore fetch drill children at the
  // card's effective granularity (state.granularity), falling back to
  // Daily only when no granularity is active (All-Shifts Today / custom
  // range, where the panels aggregate Daily rows over the window).
  //
  // MONTH is no longer downgraded to DAY here. It used to be, which left the
  // OEE card reading the month's pre-aggregated row while the machine table
  // under it read ONE arbitrary day — a machine idle on that day showed 0.0
  // against a real monthly value (Mixing 0201, Jul-2026: 0.0 on the 31st vs
  // 84.12 for the month). MONTH rows exist at every tier this drill needs
  // (OEE_m / Availability_m / Performance_m / Quality_m plus all six
  // availability-loss leaves, for every machine), and the fetch shrinks from
  // ~3.4k rows to ~311. The date-wise view inside the drill fetches its own
  // DAY rows — see useLeafDayRows in OeeDrillPanel.
  const drillGranularity = state.granularity ?? "DAY";
  const drillDateSource =
    state.category === "p" &&
    state.granularity === "MONTH" &&
    state.from &&
    state.to
      ? state
      : state.drillDate
        ? { date: state.drillDate }
        : state;

  // CR-11 / Plan Compliance: the Total Downtime and SKU Plan Fulfillment
  // tiles' drill targets are already fetched in the landing payload.
  // Re-fetching them here is redundant and would create duplicate rows. Skip it.
  const skipDrillFetch =
    state.drillSourceKpiId === "downtime" || state.drillSourceKpiId === "comp";

  const drillPayload =
    state.drillKpis && !skipDrillFetch
      ? {
          plantId,
          context: {
            ...buildContext(state),
            // changes.md §8: fall back to the real "DAY" granularity (not the
            // stale "Daily" literal, which matches no real rows) when no
            // shift/preset granularity is active (All-Shifts Today / custom
            // range). The backend synonym map accepts either, but DAY keeps
            // the drill children aligned with the aggregate DAY rows.
            granularity: drillGranularity,
          },
          // new_change.md C1/C3/C6: the drill inherits the card's EXACT
          // window, built the same way — range only, or a single date only.
          // When the card anchored itself to its OWN latest day (C6), the
          // drill is pinned to that day rather than the whole trailing
          // window, so card and drill always land on the same date.
          ...buildDatePayload(drillDateSource),
          drillKpis: state.drillKpis,
          parentFilters: state.parentFilters,
          limit: 10000,
          drillOnly: true,
        }
      : null;

  const {
    data: landingData,
    isLoading: landingLoading,
    error: landingError,
  } = usePolledQuery(() => fetchCachedDashboard(landingPayload), {
    enabled: hasDateRange,
    interval: 0,
    keepPreviousData: true,
    deps: [JSON.stringify(landingPayload)],
  });

  const {
    data: drillData,
    isLoading: drillLoading,
    error: drillError,
  } = usePolledQuery(
    () =>
      drillPayload ? fetchCachedDashboard(drillPayload) : Promise.resolve(null),
    {
      enabled: Boolean(drillPayload),
      interval: 0,
      deps: [JSON.stringify(drillPayload)],
    },
  );

  // CR-11: parallel DAY-granularity fetch for the 6 OEE-availability-loss
  // reasons so the TotalDowntime tile renders for Month / Year / custom
  // presets (where the main landing fetch at MONTH returns no reason rows).
  const { data: downtimeData, isLoading: downtimeLoading } = usePolledQuery(
    () =>
      downtimePayload
        ? fetchCachedDashboard(downtimePayload)
        : Promise.resolve(null),
    {
      enabled: Boolean(downtimePayload),
      interval: 0,
      deps: [JSON.stringify(downtimePayload)],
    },
  );

  const {
    data: totalDowntimeData,
    isLoading: totalDowntimeLoading,
    error: totalDowntimeError,
  } = usePolledQuery(
    () =>
      totalDowntimePayload
        ? fetchCachedDashboard(totalDowntimePayload)
        : Promise.resolve(null),
    {
      enabled: hasDateRange && Boolean(totalDowntimePayload),
      interval: 0,
      deps: [JSON.stringify(totalDowntimePayload)],
    },
  );

  // new_change.md C6/C14: each KPI's own newest DAY date + the sections whose
  // latest day is still in progress. Fetched once and memoized in the api
  // module, so mounting this hook costs no extra request.
  const { data: anchorData } = usePolledQuery(() => getAnchors(plantId), {
    interval: 0,
    deps: [plantId],
  });
  const anchors = anchorData?.anchors ?? null;
  const partialDays = anchorData?.partialDays ?? null;

  // Merge: landing always present; drill children appended when a card
  // is drilled. The transformer and panels both read from this combined
  // list — landing rows feed the 4 KPI cards, drill rows feed the panel.
  //
  // CR-11: the dedicated downtime rows are deliberately NOT merged in here.
  // They are DAY rows for the 6 reason leaves, and folding them into the one
  // array everything reads broke two things at once:
  //   1. OEE drill blank on Month/Year — OeeDrillPanel collapses `rawRows`
  //      to its latest date, and the DAY reason dates run past the MONTH
  //      rows' date, so every MONTH OEE row was filtered out.
  //   2. Total Downtime doubling on click — drilling the tile (or OEE, whose
  //      targets include all six reasons) fetches those same leaves again,
  //      and the tile summed both copies.
  // They travel separately instead: `downtimeRows` → toKpiGrid for the tile,
  // and → DowntimeDrillPanel for the reason breakdown.
  const landingRows = Array.isArray(landingData?.rows)
    ? landingData.rows
    : null;
  const drillDataRows = Array.isArray(drillData?.rows) ? drillData.rows : null;
  const downtimeRows = Array.isArray(downtimeData?.rows)
    ? downtimeData.rows
    : null;
  const data = useMemo(
    () =>
      landingRows
        ? [
            ...landingRows,
            ...(state.drillKpis && drillDataRows ? drillDataRows : []),
          ]
        : null,
    [landingRows, state.drillKpis, drillDataRows],
  );
  // new_change.md C10: either fetch hitting the row cap makes the totals on
  // screen incomplete — surface it rather than showing a partial sum as final.
  const truncated =
    Boolean(landingData?.truncated) ||
    Boolean(drillData?.truncated) ||
    Boolean(totalDowntimeData?.truncated);
  // LANDING-only loading. Treat "waiting for the date window" as loading too,
  // so the grid shows a skeleton (not an empty "no data" state) while the range
  // resolves and the gated landing fetch has not run yet.
  //
  // The drill fetch is deliberately NOT folded in here. Opening a drill does
  // not re-run the landing query (drillKpis does not feed landingPayload), so
  // the cards are already on screen; reporting them as loading made the page
  // put a full-body loader over content that never changed. Drill-only
  // progress belongs to `isDrillLoading` below, which the panel renders in
  // place.
  const isLoading =
    !hasDateRange ||
    landingLoading ||
    (Boolean(totalDowntimePayload) && totalDowntimeLoading);
  // Drill-only loading flag so drill panels can render a skeleton while
  // their fetch is in flight, without confusing it with landing reload.
  // CR-11: the Total Downtime drill has no drillPayload of its own (see
  // skipDrillFetch) — its panel is backed by the dedicated reason fetch, so
  // report THAT as the in-flight state or the panel renders its empty message
  // instead of a skeleton while the rows are still arriving.
  const isDrillLoading = skipDrillFetch
    ? Boolean(downtimePayload) && downtimeLoading
    : Boolean(drillPayload) && drillLoading;
  const error = landingError || drillError || totalDowntimeError || null;

  // When the latest landing data actually arrived from the backend, stamped
  // on the envelope by the fetcher (see fetchDashboard). Derived purely from
  // data — no effect, no ref — so it advances with each fetch / filter change.
  const lastUpdatedAt = landingData?.fetchedAt ?? null;

  // CR-11: render the grid when EITHER feed has rows — a view whose only
  // data is the dedicated reason fetch still has a Total Downtime tile.
  const kpis = useMemo(
    () =>
      data || downtimeRows || totalDowntimeData?.rows
        ? toKpiGrid(data ?? [], {
            section: sectionIdToName(state.section),
            category: state.category.toUpperCase(),
            granularity: state.granularity ?? "DAY",
            mode: state.mode ?? "snapshot",
            // Decides strict vs soft filter pins — CTP strict, Banmore soft.
            plantId,
            // Equipment KPIs come back for every product type now (backend
            // exemption); the transformer uses this to prefer the selected
            // product's row when it exists and fall back to the line value.
            productType: state.productType ?? null,
            // Curing PCR reads its Production total from the SKU leaf.
            tyreType: state.tyreType ?? null,
            // new_change.md C8/C9: never combine two units of the same series.
            unitOfMeasurement: state.unitOfMeasurement ?? null,
            // The card whose drill is open — lets the transformer switch a
            // multi-unit KPI (Production: Batch/KG) to its mass unit while
            // drilled, and back to Batch when closed.
            drilledKpiId: state.drillSourceKpiId ?? null,
            // new_change.md C6: per-KPI anchors, applied to the DEFAULT view
            // only — an explicit user date/range always wins (C1).
            anchors,
            // Off when the headline is pinned to one day: a stale anchor
            // would hide that day's rows.
            useAnchors:
              !state.userWindow &&
              !state.headlineDate &&
              (state.mode ?? "snapshot") !== "aggregate",
            // Today preset: no fallback to an earlier day — "—" instead.
            headlineDate: state.headlineDate ?? null,
            // new_change.md C14/S-3: suppress the spike on an in-progress day.
            partialDays,
            // new_change.md C15/C16/C17: the real preceding window.
            baselineRows: landingData?.baseline ?? null,
            baselineWindow: landingData?.baselineWindow ?? null,
            baselineGranularity: landingData?.baselineGranularity ?? null,
            // new_change.md C10.
            truncated,
            // CR-11 / Q-DT-01: the ONLY feed for the Total Downtime tile.
            downtimeRows,
            totalDowntimeRows: totalDowntimeData?.rows ?? null,
            baselineTotalDowntimeRows: totalDowntimeData?.baseline ?? null,
            totalDowntimeBaselineWindow:
              totalDowntimeData?.baselineWindow ?? null,
          })
        : [],
    [
      data,
      downtimeRows,
      totalDowntimeData,
      state.section,
      state.category,
      state.granularity,
      state.mode,
      state.productType,
      state.tyreType,
      state.unitOfMeasurement,
      state.drillSourceKpiId,
      state.userWindow,
      state.headlineDate,
      plantId,
      anchors,
      partialDays,
      landingData?.baseline,
      landingData?.baselineWindow,
      landingData?.baselineGranularity,
      truncated,
    ],
  );
  const drillRows = data && state.drillKpis !== null ? toDrillRows(data) : null;

  useEffect(() => {
    if (
      !hasDateRange ||
      isLoading ||
      !Array.isArray(kpis) ||
      kpis.length === 0
    ) {
      return;
    }
    const candidates = kpis
      .filter(
        (kpi) =>
          kpi?.drillable &&
          Array.isArray(kpi.drillTargets) &&
          kpi.drillTargets.length > 0 &&
          // CR-11: the Total Downtime drill fires no fetch of its own
          // (skipDrillFetch), so warming a cache key for it is pure waste —
          // and it would evict a key a real drill still needs.
          kpi.id !== "downtime",
      )
      .slice(0, 3);

    for (const kpi of candidates) {
      const source =
        kpi.resolvedDate && state.granularity !== "MONTH"
          ? { date: kpi.resolvedDate }
          : state;
      // Must match drillGranularity above, or the prefetch warms a cache key
      // the real drill fetch never asks for.
      const gran = state.granularity ?? "DAY";
      fetchCachedDashboard({
        plantId,
        context: {
          ...buildContext(state),
          granularity: gran,
        },
        ...buildDatePayload(source),
        drillKpis: kpi.drillTargets,
        parentFilters: {},
        limit: 3000,
        drillOnly: true,
      }).catch(() => {
        // Prefetch is opportunistic; the foreground drill fetch still owns UX.
      });
    }
  }, [hasDateRange, isLoading, kpis, plantId, state]);

  const setFilter = useCallback((payload, resetDrill = false) => {
    dispatch({ type: "SET_FILTER", payload, resetDrill });
  }, []);

  /**
   * Initiate a drill into `kpiNames` (from kpi.drillDown).
   * `sourceKpiId` is the original clicked KPI's id — used by the router
   * to pick the right panel (OEE → OeeDrillPanel, etc.).
   */
  const drillInto = useCallback(
    (kpiNames, sourceKpiId, parentFilters = {}, cardDate = null) => {
      dispatch({
        type: "SET_DRILL",
        // new_change.md C3/C6: `cardDate` is the card's ALREADY-resolved
        // date — the drill inherits it instead of resolving its own.
        payload: { kpiNames, sourceKpiId, parentFilters, cardDate },
      });
    },
    [],
  );

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
    // CR-11: the 6 OEE-availability-loss reason leaves, kept out of
    // `rawRows` on purpose (see the merge note above). `downtimeGranularity`
    // is the granularity they were actually fetched at, so the drill panel
    // filters on the same one rather than assuming DAY.
    downtimeRows,
    downtimeGranularity,
    // new_change.md C10 — true means the row cap was hit and any total on
    // screen is INCOMPLETE.
    truncated,
    isLoading,
    isDrillLoading,
    lastUpdatedAt,
    error,
    setFilter,
    drillInto,
    resetDrill,
    resetAll,
  };
}
