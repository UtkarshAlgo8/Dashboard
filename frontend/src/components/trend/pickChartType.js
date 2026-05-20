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
  // Productivity tab
  oee: "line",
  "plan-compliance": "line",
  production: "bar",
  downtime: "bar",

  // Q (Quality)
  ftq: "line",
  "defect-rate": "line",
  "ncm-hold": "bar",
  "customer-complaints": "bar",

  // C (Cost)
  "cost-per-unit": "bar",
  "energy-cost": "bar",
  "conversion-cost": "bar",
  "material-cost": "bar",

  // D (Delivery)
  otif: "line",
  "schedule-adherence": "line",
  "plan-vs-actual": "line",
  "order-lead-time": "bar",

  // M (Morale)
  attendance: "line",
  "manpower-vs-plan": "line",
  "training-hours": "bar",
  "engagement-score": "line",

  // S (Safety)
  "days-without-incident": "progress",
  "near-misses": "bar",
  "safety-observations": "bar",
  "audit-score": "line",

  // Phase 2+ Quality / Engineering surfaces
  "scrap-rate": "line",
  mtbf: "line",
  "kwh-mt": "line",
  "power-factor": "line",
  "breakdown-hours": "bar",
  "production-loss": "bar",
  "repeat-failures": "bar",
  "anomalies-detected": "bar",
  "safe-days": "progress",
};

export function pickChartType(kpiId, unit) {
  if (kpiId && ID_TO_TYPE[kpiId]) return ID_TO_TYPE[kpiId];
  if (unit === "days" || unit === "count") return "progress";
  return "bar";
}
