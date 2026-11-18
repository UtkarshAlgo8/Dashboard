import { TARGETS } from "./reliabilityTargets.js";

/** Explicit rules only: never infer a good/bad status from a missing value. */
export function engineeringKpiStatus(id, value) {
  const number = value == null || value === "" ? null : Number(value);
  const valid = number != null && Number.isFinite(number);
  if (id === "breakdown") {
    return {
      status:
        !valid || number === TARGETS.breakdownPct
          ? null
          : number < TARGETS.breakdownPct
            ? "Green"
            : "Red",
      target: `<${TARGETS.breakdownPct}%`,
      info: [
        `Specification: target below ${TARGETS.breakdownPct}%; red above ${TARGETS.breakdownPct}%. At the boundary no status is defined.`,
      ],
    };
  }
  if (id === "mttr") {
    const hours = valid ? number / 60 : null;
    return {
      status:
        !valid || hours === TARGETS.mttrHrs
          ? null
          : hours < TARGETS.mttrHrs
            ? "Green"
            : "Yellow",
      target: `<${TARGETS.mttrHrs} hrs`,
      info: [
        `Specification: target below ${TARGETS.mttrHrs} hours; amber above ${TARGETS.mttrHrs} hours. At the boundary no status is defined.`,
      ],
    };
  }
  if (id === "pm" || id === "daily") {
    return {
      status: !valid
        ? null
        : number >= 98
          ? "Green"
          : number >= 95
            ? "Yellow"
            : "Red",
      target: "≥98% (provisional)",
      info: [
        "Provisional: the Production plan compliance rule is used pending plant approval.",
        "Green: at least 98%; amber: 95% to below 98%; red: below 95%.",
      ],
    };
  }
  if (id === "mtbf")
    return {
      status: !valid ? null : number / 60 >= TARGETS.mtbfHrs ? "Green" : "Red",
      target: `≥${TARGETS.mtbfHrs} hrs (provisional)`,
      info: [
        "Provisional: the specification's 500-hour target is flagged for plant re-baselining and may not reflect actual shift schedules.",
        "Green: at or above target; red: below target.",
      ],
    };
  if (id === "zeroBreakdown")
    return {
      status: !valid
        ? null
        : number >= TARGETS.zeroBreakdownMachines
          ? "Green"
          : "Yellow",
      target: `≥${TARGETS.zeroBreakdownMachines} machines (provisional)`,
      info: [
        "Provisional: the 50-machine target comes from the design mockup and is not an approved plant target.",
        "Green: at or above target; amber: below target.",
      ],
    };
  return {
    status: null,
    info: ["No performance target is defined for this KPI."],
  };
}
