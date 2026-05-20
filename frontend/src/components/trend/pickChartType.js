/**
 * Auto-select the chart type for a KPI per BRD FR-X13.
 *
 *   line     — continuous rate KPIs (OEE %, FTQ %, Scrap Rate %,
 *              MTBF, kWh/MT, Power Factor, Plan Compliance %, …)
 *   bar      — discrete count KPIs (Breakdown Hours, NCM Hold,
 *              Customer Complaints, Production Loss ₹, Repeat
 *              Failures, Anomalies, Downtime, Production volume, …)
 *   progress — counter KPIs (Days Without Reportable Incident,
 *              Safe Days, …)
 *
 * Lookup order: explicit id map → unit heuristic → fallback "bar".
 * Spec 11/12/14 extend the id map without changing callers.
 *
 * @param {string} kpiId
 * @param {string} [unit]
 * @returns {"line" | "bar" | "progress"}
 */
const ID_TO_TYPE = {
  // Phase 1 — Mixing > Productivity
  oee: "line",
  "plan-compliance": "line",
  production: "bar",
  downtime: "bar",

  // Phase 2+ entries — included so callers needn't change
  ftq: "line",
  "scrap-rate": "line",
  mtbf: "line",
  "kwh-mt": "line",
  "power-factor": "line",
  "breakdown-hours": "bar",
  "ncm-hold": "bar",
  "customer-complaints": "bar",
  "production-loss": "bar",
  "repeat-failures": "bar",
  "anomalies-detected": "bar",
  "days-without-incident": "progress",
  "safe-days": "progress",
};

export function pickChartType(kpiId, unit) {
  if (kpiId && ID_TO_TYPE[kpiId]) return ID_TO_TYPE[kpiId];
  if (unit === "days" || unit === "count") return "progress";
  return "bar";
}
