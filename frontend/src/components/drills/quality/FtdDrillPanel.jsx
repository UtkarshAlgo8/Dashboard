import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * FTQ drill panel — Machine-wise FTQ detail.
 * Columns: Machine | FTQ % | Defects | Top Defect
 *
 * Each drill row has: machine, actual (FTQ%), itemCode (top defect reason).
 * If defect data is sparse, use machine as-is with actual value.
 */
export default function FtdDrillPanel({ drillRows }) {
  const rows = (drillRows ?? []).map((r) => [
    r.machine ?? "—",
    r.actual != null ? `${Number(r.actual).toFixed(1)}%` : "—",
    r.drillDown?.[0] ?? "—", // defects count if present
    r.itemCode ?? r.productType ?? "—", // top defect reason
  ]);

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Machine-wise FTQ"
        cols={["Machine", "FTQ %", "Defects", "Top Defect"]}
        rows={rows}
      />
    </Stack>
  );
}
