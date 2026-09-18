/**
 * KPI targets for the Reliability cards.
 *
 * Hardcoded on purpose. The KPI spec records `threshold_value` as empty for
 * every row the engine publishes ("0 / 558,420") and its instruction is to
 * "hardcode targets in the UI for now". Each value below is the one the spec
 * states for that card; nothing here is inferred from the data.
 *
 * Delete a line the moment its KPI starts publishing `threshold_value` — a
 * stored target must win over this file.
 */
export const TARGETS = {
  /** Spec KPI 2: "target < 3.0 % · Red if > 3". */
  breakdownPct: 3.0,

  /** Spec KPI 4: "target < 2 hrs · Yellow if above". */
  mttrHrs: 2,

  /**
   * Spec KPI 3: "target ≥ 500 hrs · Red if below" — carried as stated, but
   * the spec immediately flags it for re-baselining: "500 hrs was set
   * assuming 24 h/day; the plant runs on 480 min × active shifts, so real
   * MTBF is ~91 hrs." Drawn with that caveat next to it rather than quietly
   * replaced, because only the business can re-set a target.
   */
  mtbfHrs: 500,
  mtbfNeedsRebaseline: true,

  /**
   * Zero Breakdown Machines — target ≥ 50. This one comes from the design
   * mock's card ("42 · machines / 205 · target ≥50"), not from the KPI spec,
   * which states no target for this KPI. It is here because the mock draws
   * the progress bar against a goal line and the bar is meaningless without
   * one. Replace it the moment the business states a real figure.
   */
  zeroBreakdownMachines: 50,
};
