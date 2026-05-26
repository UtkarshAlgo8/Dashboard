/**
 * Auto-select the chart type for a KPI per BRD FR-X13.
 *
 * 2026-05-27 update: per the artifact, every trend chart renders as
 * a LINE — even for discrete-count KPIs like Downtime / Production /
 * NCM Hold. The earlier per-KPI line/bar branching was a misread
 * of FR-X13; the artifact's KPI Trend Analysis modal uses line
 * uniformly. Counter-style KPIs (Days Without Incident, Safe Days)
 * still render as a `progress` bar — that's a different visual
 * (filled progress bar to a target, not a time series).
 *
 * @param {string} kpiId
 * @param {string} [unit]
 * @returns {"line" | "progress"}
 */
const ID_TO_TYPE = {
  // Counter-style KPIs — render as a progress bar, not a time series.
  "days-without-incident": "progress",
  "safe-days": "progress",
};

export function pickChartType(kpiId, unit) {
  if (kpiId && ID_TO_TYPE[kpiId]) return ID_TO_TYPE[kpiId];
  if (unit === "days" || unit === "count") return "progress";
  // Default: line chart for every other KPI (matches artifact).
  return "line";
}
