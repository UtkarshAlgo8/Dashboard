/**
 * Threshold logic for OEE components per BRD FR-P26.
 *
 *   Availability: green ≥ 95%, amber ≥ 85%, red < 85%.
 *   Performance:  green ≥ 95%, amber ≥ 90%, red < 90%.
 *   Quality:      green ≥ 99%, amber ≥ 98%, red < 98%.
 *
 * Returns one of "green" | "amber" | "red". Consumers look up the
 * theme token via `theme.custom.brand.green/amber/red`.
 *
 * `component` is the OEE component id: "availability" | "performance"
 * | "quality".
 */
const TIERS = {
  availability: { green: 95, amber: 85 },
  performance: { green: 95, amber: 90 },
  quality: { green: 99, amber: 98 },
};

export function thresholdTier(component, value) {
  const t = TIERS[component];
  if (!t || typeof value !== "number") return "red";
  if (value >= t.green) return "green";
  if (value >= t.amber) return "amber";
  return "red";
}

export function thresholdColor(theme, component, value) {
  const tier = thresholdTier(component, value);
  return theme.custom.brand[tier];
}
