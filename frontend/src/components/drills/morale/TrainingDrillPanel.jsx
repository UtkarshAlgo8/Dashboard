import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";
import { formatIndianNumber } from "@/lib/numberFormat.js";

/**
 * Training drill — kpi_name = Training_area.
 *
 * Per spec §11 columns: Area | Plan Hrs | Actual Hrs | Compliance %.
 * gold_dummy stores the area label in `remarks`, actual hours in
 * `actual_value`, plan hours in `threshold_value`.
 *
 * Aggregation: AVG (§9, hrs/m is a per-period ratio per spec §3 row).
 */
function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export default function TrainingDrillPanel({ drillRows, granularity = "DAY" }) {
  const byArea = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Training_area") continue;
    if (r.granularity !== granularity) continue;
    const area = r.remarks ?? "—";
    if (area === "—") continue;
    if (!byArea.has(area)) byArea.set(area, { actuals: [], plans: [] });
    const b = byArea.get(area);
    if (typeof r.actual === "number") b.actuals.push(r.actual);
    if (typeof r.threshold === "number") b.plans.push(r.threshold);
  }

  const rows = [...byArea.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, { actuals, plans }]) => {
      const actual = avg(actuals);
      const plan = avg(plans);
      const compliance =
        actual != null && plan != null && plan > 0
          ? `${((actual / plan) * 100).toFixed(0)}%`
          : "—";
      return [
        area,
        plan != null ? formatIndianNumber(plan, { decimals: 1 }) : "—",
        actual != null ? formatIndianNumber(actual, { decimals: 1 }) : "—",
        compliance,
      ];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Training by Area"
        cols={["Area", "Plan Hrs", "Actual Hrs", "Compliance %"]}
        rows={rows}
        downloadFilename="drill-training"
        downloadSheetName="Training"
      />
    </Stack>
  );
}
