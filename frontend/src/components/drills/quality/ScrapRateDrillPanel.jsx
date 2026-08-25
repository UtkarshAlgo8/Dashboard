import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Scrap Rate drill — kpi_name = Scrap_Rate_m.
 *
 * Per spec §4 + §11 columns: Machine | Scrap Rate % | Target | Variance.
 * gold_dummy `Scrap_Rate_m` stores the per-machine scrap percentage in
 * `actual_value` and the target in `threshold_value`.
 *
 * Aggregation: AVG (§9 — percentages average, never sum) per machine
 * over the active date range.
 */
function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export default function ScrapRateDrillPanel({
  drillRows,
  granularity = "DAY",
  onClose,
}) {
  const byMachine = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Scrap_Rate_m") continue;
    if (r.granularity !== granularity) continue;
    if (!r.machine) continue;
    if (!byMachine.has(r.machine)) {
      byMachine.set(r.machine, { actuals: [], targets: [] });
    }
    const b = byMachine.get(r.machine);
    if (typeof r.actual === "number") b.actuals.push(r.actual);
    if (typeof r.threshold === "number") b.targets.push(r.threshold);
  }

  const rows = [...byMachine.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([machine, { actuals, targets }]) => {
      const rate = avg(actuals);
      const target = avg(targets);
      const variance = rate != null && target != null ? rate - target : null;
      return [
        machine,
        rate != null ? `${rate.toFixed(2)}%` : "—",
        target != null ? `${target.toFixed(2)}%` : "—",
        variance != null ? `${variance.toFixed(2)}%` : "—",
      ];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Machine-wise Scrap Rate"
        cols={["Machine", "Scrap Rate", "Target", "Variance"]}
        rows={rows}
        downloadFilename="drill-scrap-rate"
        downloadSheetName="ScrapRate"
        onClose={onClose}
      />
    </Stack>
  );
}
