/**
 * Downtime taxonomy — CR-11.
 *
 * The 6 OEE-availability-loss reason leaves that the backend's
 * `PRODUCT_AGNOSTIC_KPIS` set exempts from the product_type filter
 * (dashboard-query.js:119-140). realdata.md §15 says the legacy
 * "Downtime" kpi is removed entirely; its purpose is served by
 * these six reasons summed.
 *
 * "Total Downtime" is a frontend virtual concept (Q-DT-01). The
 * kpi-data endpoint accepts these six names in one `drillKpis`
 * array; the frontend sums them per date for the tile value and
 * for the Downtime Plot's "Overall" series.
 */
export const DOWNTIME_REASONS = [
  "Breakdown",
  "No Schedule",
  "Power Failure",
  "Preventive Maintenance",
  "Setup & Change",
  "Operations/Material/Manpower",
];

// Virtual kpi_name for the new "Total Downtime" tile. Frontend-only;
// the backend never sees this string (we expand it to the six
// reasons before posting).
export const TOTAL_DOWNTIME_NAME = "TotalDowntime";

// The reason set the KPI CARD sums — 'No Schedule' is a planned non-run,
// not machine downtime, so the tile's headline value, its per-machine
// average denominator, and its "top machine" figure all exclude it. The
// drill-down keeps the full 6-reason DOWNTIME_REASONS list — 'No Schedule'
// is still a real reason row there.
export const CARD_DOWNTIME_REASONS = DOWNTIME_REASONS.filter(
  (r) => r !== "No Schedule",
);

// Convert the virtual kpi_name into the 6 reason leaves for an
// actual kpi-data fetch. If `name` is already a real kpi_name
// (i.e. one of the 6 reasons, or anything else), return as-is.
export function expandDowntimeKpiName(name) {
  if (name === TOTAL_DOWNTIME_NAME) return DOWNTIME_REASONS;
  return [name];
}
