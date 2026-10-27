/** Pure helpers for the Quality KPI trend panels. */

export function _genInsight(series, target, current, inv) {
  const avg = series.reduce((a, b) => a + b, 0) / series.length;
  const best = inv ? Math.min(...series) : Math.max(...series);
  const worst = inv ? Math.max(...series) : Math.min(...series);
  const gap = inv ? current - target : current - target;
  const last3 = series.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const first3 = series.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const improving = inv ? first3 > last3 : last3 > first3;
  const stable = Math.abs(last3 - first3) / Math.max(Math.abs(avg), 0.5) < 0.02;
  const onTarget = inv ? current <= target : current >= target;
  let txt = "";
  if (onTarget) {
    txt += "Currently meeting target ";
  } else {
    txt +=
      "Currently " +
      Math.abs(gap).toFixed(2) +
      " " +
      (inv ? "above" : "below") +
      " target ";
  }
  if (stable) {
    txt += "— stable performance over the period.";
  } else if (improving) {
    txt += "— trending in the right direction.";
  } else {
    txt += "— negative trend; investigate root cause.";
  }
  return {
    avg: Math.round(avg * 100) / 100,
    best: Math.round(best * 100) / 100,
    worst: Math.round(worst * 100) / 100,
    gap: Math.round(gap * 100) / 100,
    text: txt,
    bestIdx: series.indexOf(best),
    worstIdx: series.indexOf(worst),
  };
}

/* Pick the right chart type based on KPI intent (name + unit) */
export function pickChartType(kpi) {
  if (kpi.chart) return kpi.chart;
  const n = (kpi.n || "").toLowerCase();
  const u = (kpi.u || "").toLowerCase();
  if (/days without|days since|safe days/.test(n)) return "progress";
  const barUnits = [
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
  if (barUnits.some((x) => u.indexOf(x) >= 0)) return "bar";
  if (/₹|inr|lakh|cr/i.test(kpi.u || "")) return "bar";
  const barNames = [
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
    "manpower absent",
    "production loss",
    "milestones",
    "absentee",
    "spare",
  ];
  if (barNames.some((x) => n.indexOf(x) >= 0)) return "bar";
  return "line";
}
