/** BTP Product drill identity, navigation and display-only helpers. */
export const UNIFORMITY_DRILL_CARDS = Object.freeze({
  Mtms_Uniformity_Yield: { id: "mtms", plot: true },
  Tuo_Uniformity_Yield: { id: "tuo", plot: false },
  Zf_Uniformity_Yield: { id: "zf-uniformity", plot: false },
  Zf_Balancing_Yield_o: { id: "zf-balancing", plot: false },
  Dbm_Balancing_Yield: { id: "dbm", plot: true },
});
export function uniformityCard(kpi) {
  return Object.hasOwn(UNIFORMITY_DRILL_CARDS, kpi)
    ? UNIFORMITY_DRILL_CARDS[kpi]
    : null;
}
/** Gold stored periods; Silver receives the matching production-date span. */
export function uniformityPeriod({ preset, from, to, shift, today }) {
  if (preset === "today" || preset === "day") {
    const date = preset === "today" ? today : to;
    return {
      period: "day",
      from: date,
      to: date,
      shift: ["A", "B", "C"].includes(String(shift).toUpperCase())
        ? String(shift).toUpperCase()
        : "ALL",
    };
  }
  return {
    period: preset === "month" ? "month" : preset === "year" ? "year" : "range",
    from,
    to:
      ["month", "year"].includes(preset) && from <= today && to > today
        ? today
        : to,
    shift: "ALL",
  };
}
/** Resolve Technical's selected window, not the trailing sparkline history. */
export function technicalUniformityPeriod(dateWindow, shift) {
  const { from, to, granularity, mode } = dateWindow;
  if (!from || !to) return null;
  const token = String(shift).toUpperCase();
  if (
    ["A", "B", "C"].includes(token) &&
    (mode === "aggregate" || granularity === "MONTH" || granularity === "YEAR")
  )
    return null;
  if (mode === "aggregate") return { period: "range", from, to, shift: "ALL" };
  if (granularity === "MONTH")
    return { period: "month", from, to, shift: "ALL" };
  if (granularity === "YEAR") return { period: "year", from, to, shift: "ALL" };
  const selected = to;
  return {
    period: "day",
    from: selected,
    to: selected,
    shift: ["A", "B", "C"].includes(token) ? token : "ALL",
  };
}
export const INITIAL_UNIFORMITY_NAV = {
  machine: null,
  sku: null,
  parameter: null,
  expected: null,
  offset: 0,
  plot: null,
};
/** Reset descendant scopes when a parent selection or breadcrumb changes. */
export function uniformityNavigation(state, action) {
  if (action.type === "machine")
    return { ...INITIAL_UNIFORMITY_NAV, machine: action.value };
  if (action.type === "sku")
    return {
      ...INITIAL_UNIFORMITY_NAV,
      machine: state.machine,
      sku: action.value,
    };
  if (action.type === "barcodes")
    return {
      ...state,
      parameter: action.value,
      expected: action.expected,
      offset: 0,
      plot: null,
    };
  if (action.type === "page") return { ...state, offset: action.value };
  if (action.type === "plot") return { ...state, plot: action.value };
  if (action.type === "back") {
    if (action.index <= 1) return { ...INITIAL_UNIFORMITY_NAV };
    if (action.index === 2)
      return { ...INITIAL_UNIFORMITY_NAV, machine: state.machine };
    return {
      ...INITIAL_UNIFORMITY_NAV,
      machine: state.machine,
      sku: state.sku,
    };
  }
  return state;
}
export function uniformityLevel(nav) {
  return nav.parameter
    ? "barcodes"
    : nav.sku
      ? "parameter"
      : nav.machine
        ? "sku"
        : "machine";
}
/** Do not reinterpret the backend's recorded clock as a local/UTC instant. */
export function recordedClockMillis(value) {
  const m =
    /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?/.exec(
      String(value),
    );
  if (!m) return null;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Number((m[7] ?? "").padEnd(3, "0")),
  );
}
/** Reject changing/overlapping pages; never silently sample or lose tyres. */
export function appendUniformityPoints(previous, page) {
  if (page.truncated)
    throw new Error(
      "The upstream point page is incomplete. Narrow the date range.",
    );
  if (
    page.offset !== previous.rows.length ||
    (previous.total != null && previous.total !== page.total)
  )
    throw new Error(
      "The source changed between pages. Close and reopen the plot.",
    );
  const seen = new Set(previous.rows.map((row) => row.barcode));
  for (const row of page.rows) {
    if (seen.has(row.barcode))
      throw new Error(
        "Overlapping barcode pages detected. Close and reopen the plot.",
      );
    if (
      recordedClockMillis(row.test_time) == null ||
      !Number.isFinite(row.actual_value)
    )
      throw new Error("Invalid measured point returned by the source.");
    seen.add(row.barcode);
  }
  return {
    rows: [...previous.rows, ...page.rows],
    total: page.total,
    has_more: page.has_more,
  };
}
