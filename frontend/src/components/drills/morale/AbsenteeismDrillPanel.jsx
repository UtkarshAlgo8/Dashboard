import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Absenteeism drill — kpi_name = Absenteeism_section.
 *
 * Per spec §6/§10 Absenteeism is plant-level (parent has section=NULL).
 * The drill child `Absenteeism_section` is stored per section with the
 * absenteeism rate in `actual_value`. gold_dummy has no sub-area /
 * headcount breakdown — Total / Present / Absent columns from §11 can't
 * be filled, so we surface what's available: Area (section) and Rate
 * (AVG over the active date range).
 */
function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export default function AbsenteeismDrillPanel({
  drillRows,
  granularity = "DAY",
}) {
  const bySection = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Absenteeism_section") continue;
    if (r.granularity !== granularity) continue;
    const sec = r.section ?? "—";
    if (!bySection.has(sec)) bySection.set(sec, []);
    if (typeof r.actual === "number") bySection.get(sec).push(r.actual);
  }

  const rows = [...bySection.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sec, vals]) => {
      const rate = avg(vals);
      return [sec, "—", "—", "—", rate != null ? `${rate.toFixed(1)}%` : "—"];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Section-wise Absenteeism (plant-level)"
        cols={["Area", "Total", "Present", "Absent", "Rate"]}
        rows={rows}
        downloadFilename="drill-absenteeism"
        downloadSheetName="Absenteeism"
      />
    </Stack>
  );
}
