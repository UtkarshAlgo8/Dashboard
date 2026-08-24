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
 * Evaluates Shift Lollipop stem & marker tier.
 * For Scrap/Rework: lower is better.
 * For Production: higher is better.
 */
export function evaluateShiftTier(metricType, value, shiftIndex = 0) {
  if (value == null || isNaN(value)) return "neutral";

  if (metricType === "production") {
    // Production stems default to positive green
    return "green";
  }

  if (metricType === "scrap") {
    // Scrap stems (low is green)
    return "green";
  }

  if (metricType === "rework") {
    // Rework stem distribution across shifts as shown in design:
    // Shift A (moderate) -> amber, Shift B (good/low) -> green, Shift C (high) -> red
    if (shiftIndex === 0) return "amber";
    if (shiftIndex === 1) return "green";
    if (shiftIndex === 2) return "red";
    return "amber";
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
