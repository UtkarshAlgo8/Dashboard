import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Specific Power drill — Machine-wise specific power.
 *
 * Spec §11 calls for columns:
 *   Machine | kWh | Output | Sp. Power | Target | Variance
 * gold_dummy stores `Specific_Power_m` as a single pre-computed ratio
 * (`actual_value` already in kWh/MT) with no separate raw kWh / output
 * fields, so the columns kWh + Output cannot be filled and are dropped.
 *
 * Daily rows for the same machine are averaged (AVG per §9) over the
 * selected date range so each machine appears once.
 */
function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function fmt(v, d = 1) {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";
}

export default function SpecificPowerDrillPanel({ drillRows, granularity = "Daily" }) {
  const byMachine = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Specific_Power_m") continue;
    if (r.granularity !== granularity) continue;
    const m = r.machine;
    if (!m) continue;
    if (!byMachine.has(m)) byMachine.set(m, { actuals: [], targets: [] });
    const bucket = byMachine.get(m);
    if (typeof r.actual === "number") bucket.actuals.push(r.actual);
    if (typeof r.threshold === "number") bucket.targets.push(r.threshold);
  }

  const rows = [...byMachine.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([machine, { actuals, targets }]) => {
      const sp = avg(actuals);
      const target = avg(targets);
      const variance =
        sp != null && target != null ? sp - target : null;
      return [machine, fmt(sp, 2), fmt(target, 1), fmt(variance, 1)];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Machine-wise Specific Power (kWh/MT)"
        cols={["Machine", "Sp. Power", "Target", "Variance"]}
        rows={rows}
      />
    </Stack>
  );
}
