import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Training drill panel — Training by area.
 * Columns: Area | Plan Hrs | Actual Hrs | Compliance %
 *
 * drillRows have machine=area, actual=actual hrs, threshold_value=plan hrs.
 */
export default function TrainingDrillPanel({ drillRows }) {
  const rows = (drillRows ?? []).map((r) => {
    const area = r.machine ?? r.itemCode ?? "—";
    const plan = r.threshold_value ?? r.drillDown?.[0] ?? 5;
    const actual = r.actual ?? 0;
    const compliance =
      plan > 0 ? ((actual / plan) * 100).toFixed(0) + "%" : "—";
    return [area, String(plan), actual.toFixed(1), compliance];
  });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Training by Area"
        cols={["Area", "Plan Hrs", "Actual Hrs", "Compliance %"]}
        rows={rows}
      />
    </Stack>
  );
}
