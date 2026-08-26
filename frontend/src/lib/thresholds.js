/**
 * Centralized Threshold Engine for KPI & Shift Chart Color Selection.
 *
 * Implements deterministic operational thresholds across:
 * - OEE (Overall Equipment Effectiveness)
 * - Production (Actual vs Capacity)
 * - Plan Compliance (%)
 * - Scrap & Rework shift values
 */

export function normalizeStatus(rawStatus) {
  if (!rawStatus) return null;
  const s = String(rawStatus).trim().toLowerCase();
  if (s === "green") return "green";
  if (s === "yellow" || s === "amber") return "amber";
  if (s === "red") return "red";
  return null;
}

/**
 * Evaluates KPI threshold tier: "green" | "amber" | "red" | "neutral"
 */
export function evaluateKpiTier(kpi) {
  if (!kpi) return "neutral";

  // 1. Raw status from backend takes first priority if explicitly specified
  const explicit = normalizeStatus(kpi.status || kpi.statusRaw);
  if (explicit) return explicit;

  const id = String(kpi.id || kpi.rawName || "").toLowerCase();
  const name = String(kpi.name || "").toLowerCase();
  const val = typeof kpi.value === "number" ? kpi.value : parseFloat(kpi.value);

  // 2. OEE KPI logic (≥90% Green, 80-89.9% Amber, <80% Red)
  if (
    id.includes("oee") ||
    name.includes("oee") ||
    name.includes("effectiveness")
  ) {
    if (isNaN(val)) return "amber";
    if (val >= 90) return "green";
    if (val >= 80) return "amber";
    return "red";
  }

  // 3. Plan Compliance KPI logic (≥98% Green, 95-97.9% Amber, <95% Red)
  if (
    id.includes("comp") ||
    name.includes("compliance") ||
    name.includes("plan")
  ) {
    if (isNaN(val)) return "red";
    if (val >= 98) return "green";
    if (val >= 95) return "amber";
    return "red";
  }

  // 4. Production KPI logic (Actual / Capacity or Target)
  if (id.includes("prod") || name.includes("production")) {
    const target =
      typeof kpi.target === "number" ? kpi.target : parseFloat(kpi.target);
    if (!isNaN(val) && !isNaN(target) && target > 0) {
      const ratio = val / target;
      if (ratio >= 0.95) return "green";
      if (ratio >= 0.85) return "amber";
      return "red";
    }
    // Default favorable production is Green
    return kpi.trendFavourable !== false ? "green" : "amber";
  }

  // Generic fallback based on trend
  if (kpi.trendFavourable === true) return "green";
  if (kpi.trendFavourable === false) return "red";
  return "neutral";
}

/**
 * Returns dynamic styling tokens for a KPI card theme.
 */
export function getKpiCardTheme(theme, tier) {
  const status = theme.custom.status;
  const cards = theme.custom.cards;

  switch (tier) {
    case "green":
      return {
        cardBg: cards.green,
        textColor: status.green,
        accentColor: status.greenAccent,
        barColor: status.green,
        barGradient: status.greenGradient,
        trackColor: status.greenTrack,
        sparkColor: status.green,
        iconColor: status.green,
        trendColor: status.green,
      };
    case "amber":
      return {
        cardBg: cards.amber,
        textColor: status.amber,
        accentColor: status.amber,
        barColor: status.amber,
        barGradient: status.amberGradient,
        trackColor: status.amberTrack,
        sparkColor: status.amber,
        iconColor: status.amber,
        trendColor: status.green, // positive delta is still green
      };
    case "red":
      return {
        cardBg: cards.red,
        textColor: status.red,
        accentColor: status.redAccent,
        barColor: status.red,
        barGradient: status.redGradient,
        trackColor: status.redTrack,
        sparkColor: status.red,
        iconColor: status.red,
        trendColor: status.green, // positive delta is still green
      };
    default:
      return {
        cardBg: cards.neutral,
        textColor: theme.palette.text.primary,
        accentColor: theme.palette.primary.main,
        barColor: theme.palette.primary.main,
        barGradient: theme.palette.primary.main,
        trackColor: theme.palette.divider,
        sparkColor: theme.palette.primary.main,
        iconColor: theme.palette.text.primary,
        trendColor: status.green,
      };
  }
}

/**
 * Evaluates Shift Lollipop stem & marker tier based on threshold rules:
 * - Production: higher is better (val >= target/max -> Green, moderate -> Amber, low -> Red)
 * - Scrap & Rework: lower is better (val == 0 or low -> Green, moderate -> Amber, high -> Red)
 */
export function evaluateShiftTier(
  metricType,
  value,
  shiftData = [],
  thresholdVal = null,
) {
  if (value == null || isNaN(value)) return "neutral";

  // 1. If explicit target/threshold is provided
  if (thresholdVal != null && !isNaN(thresholdVal) && thresholdVal > 0) {
    const ratio = value / thresholdVal;
    if (metricType === "production") {
      if (ratio >= 0.95) return "green";
      if (ratio >= 0.8) return "amber";
      return "red";
    } else {
      // For scrap/rework: lower is better
      if (ratio <= 0.8) return "green";
      if (ratio <= 1.1) return "amber";
      return "red";
    }
  }

  // 2. Relative evaluation across active shifts (Shift A, B, C)
  const validVals = (Array.isArray(shiftData) ? shiftData : [])
    .map((v) => (v == null || isNaN(v) ? 0 : Number(v)))
    .filter((v) => !isNaN(v));

  if (validVals.length > 0) {
    const maxVal = Math.max(...validVals);

    if (metricType === "production") {
      if (maxVal === 0) return "green";
      const ratioToMax = value / maxVal;
      if (ratioToMax >= 0.9) return "green";
      if (ratioToMax >= 0.7) return "amber";
      return "red";
    } else {
      // Scrap or Rework: lower is better
      if (value === 0) return "green";
      if (maxVal === 0) return "green";
      const ratioToMax = value / maxVal;
      if (ratioToMax <= 0.35) return "green";
      if (ratioToMax <= 0.75) return "amber";
      return "red";
    }
  }

  return "green";
}

/**
 * Returns color string for a stem tier.
 */
export function getStemColor(theme, tier) {
  const status = theme.custom.status;
  if (tier === "green") return status.green;
  if (tier === "amber") return status.amber;
  if (tier === "red") return status.red;
  return theme.palette.primary.main;
}
