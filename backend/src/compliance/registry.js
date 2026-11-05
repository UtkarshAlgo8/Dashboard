/** BTP compliance guide: exact, case-sensitive Gold names; never infer drills. */
export const COMPLIANCE_KPIS = Object.freeze({
  daily: {
    base: "mechanicalchecksheet_Plan_Compliance",
    counts: {
      planned: "mechanicalchecksheet_Total_Planned",
      complied: "mechanicalchecksheet_Complied",
      nonComplied: "mechanicalchecksheet_Non_Complied",
      missed: "mechanicalchecksheet_Missed",
      inProgress: "mechanicalchecksheet_In_Progress",
    },
  },
  pm: { base: "technicalchecksheet_Plan_Compliance_pm", counts: {} },
  critical: { base: "Critical_Parameter_Compliance", counts: {} },
});

export const LEVEL_SUFFIX = Object.freeze({
  overall: "o",
  section: "s",
  machine: "m",
});

/** Map only the requested level's published percentage and supporting counts. */
export function namesForCompliance(id, level) {
  const definition = COMPLIANCE_KPIS[id];
  const suffix = LEVEL_SUFFIX[level];
  if (!definition || !suffix)
    throw new Error("Unknown compliance KPI or level");
  return Object.fromEntries([
    ["value", `${definition.base}_${suffix}`],
    ...Object.entries(definition.counts).map(([key, base]) => [
      key,
      `${base}_${suffix}`,
    ]),
  ]);
}
