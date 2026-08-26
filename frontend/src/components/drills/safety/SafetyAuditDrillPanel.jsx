import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Safety Audit drill — kpi_name = Audit_area.
 *
 * Per spec §11 columns: Area | Score | NC Major | NC Minor | Observations.
 * gold_dummy stores the area in `remarks` and the audit score in
 * `actual_value`. NC counts and observations aren't stored, so those
 * columns stay blank ("—").
 *
 * Aggregation: AVG of Daily score per area over the active date range.
 */
function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export default function SafetyAuditDrillPanel({
  drillRows,
  granularity = "DAY",
  onClose,
}) {
  const byArea = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Audit_area") continue;
    if (r.granularity !== granularity) continue;
    const area = r.remarks ?? "—";
    if (area === "—") continue;
    if (!byArea.has(area)) byArea.set(area, []);
    if (typeof r.actual === "number") byArea.get(area).push(r.actual);
  }

  const rows = [...byArea.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, vals]) => {
      const score = avg(vals);
      return [
        area,
        score != null ? `${score.toFixed(1)}%` : "—",
        "—",
        "—",
        "—",
      ];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Audit by Area"
        cols={["Area", "Score", "NC Major", "NC Minor", "Observations"]}
        rows={rows}
        downloadFilename="drill-safety-audit"
        downloadSheetName="SafetyAudit"
        onClose={onClose}
      />
    </Stack>
  );
}
