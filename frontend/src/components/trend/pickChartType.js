/**
 * Auto-select the chart type for a KPI per BRD FR-X13.
 *
 * Logic ported from docs/artifact.jsx#pickChartType (2026-05-27):
 * decisions are based on the KPI's display name + unit, not its id.
 * That way new KPIs slot in without needing a code change — a unit
 * like "nos" or "kgs" tips into bar; a name containing "downtime
 * hour" tips into bar; counter-style names ("days without …") tip
 * into progress; everything else falls through to line.
 *
 *   progress — counter KPIs ("Days Without Reportable", "Safe Days")
 *   bar      — discrete count units, currency losses, count-style
 *              names without a unit hint
 *   line     — everything else (continuous rates / measurements)
 *
 * @param {string} kpiId
 * @param {string} [unit]
 * @param {string} [name]
 * @returns {"line" | "bar" | "progress"}
 */
const BAR_UNITS = [
  "nos",
  "cases",
  "batches",
  "events",
  "count",
  "tickets",
  "tyres",
  "projects",
  "members",
  "stockouts",
  "alarms",
  "kgs",
];

const BAR_NAME_HINTS = [
  "ncm hold",
  "lot hold",
  "open capa",
  "overdue",
  "stockout",
  "repeat failure",
  "anomalies",
  "audits",
  "stoppage",
  "complaint",
  "breakdown hour",
  "downtime hour",
  "downtime",
  "manpower absent",
  "production loss",
  "milestones",
  "absentee",
  "spare",
];

const CURRENCY_PATTERN = /₹|inr|lakh|cr/i;
const COUNTER_NAME_PATTERN = /days without|days since|safe days/;

export function pickChartType(kpiId, unit, name) {
  const n = String(name ?? "").toLowerCase();
  const u = String(unit ?? "").toLowerCase();

  // Counter-style KPIs render as a filled progress bar.
  if (COUNTER_NAME_PATTERN.test(n)) return "progress";

  // Discrete count units → bar.
  if (BAR_UNITS.some((x) => u.includes(x))) return "bar";

  // Currency-denominated losses → bar.
  if (CURRENCY_PATTERN.test(unit ?? "")) return "bar";

  // Count-style names when the unit is ambiguous → bar.
  if (BAR_NAME_HINTS.some((x) => n.includes(x))) return "bar";

  // Default: continuous rate / measurement → line.
  return "line";
}
