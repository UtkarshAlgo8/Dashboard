const PUBLISHED_KPIS = ["BreakdownMin_m", "BreakdownOcc_m", "MTBF_m", "MTTR_m"];
const COMPONENT_KPIS = ["BreakdownMin_m", "BreakdownOcc_m", "OperatingMin_m"];

/** One ranked result for both the card and its table, at the page's period. */
export function topMachineBreakdownRequest(period) {
  const isRange = period.kind === "range";
  return {
    kpiNames: isRange ? COMPONENT_KPIS : PUBLISHED_KPIS,
    date: period.date,
    from: isRange ? period.from : undefined,
    to: isRange ? period.to : undefined,
    granularity: isRange ? "DAY" : period.granularity,
    groupBy: "machine",
    agg: isRange ? "sum" : undefined,
    sort: "BreakdownMin_m",
    order: "desc",
    limit: 10,
  };
}

/**
 * Rates are not additive. For a custom window sum machine components first,
 * then divide once. A zero/missing occurrence count leaves the rate undefined.
 */
export function topMachineBreakdownRows(rows, isRange) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row.machine && row.BreakdownMin_m > 0)
    .map((row) => {
      if (!isRange) return row;
      const occurrences = row.BreakdownOcc_m;
      return {
        ...row,
        MTBF_m:
          occurrences > 0 && row.OperatingMin_m != null
            ? row.OperatingMin_m / occurrences
            : null,
        MTTR_m:
          occurrences > 0 && row.BreakdownMin_m != null
            ? row.BreakdownMin_m / occurrences
            : null,
      };
    })
    .sort((a, b) => b.BreakdownMin_m - a.BreakdownMin_m)
    .slice(0, 10);
}
