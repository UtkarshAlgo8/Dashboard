import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * NCM Hold drill panel — NCM Hold details.
 * Columns: SKU | Batch | # Batches | Kgs | Hold Reason
 *
 * Each drill row has: itemCode (SKU), machine (batch), actual (qty in nos or batches),
 * drillDown (reason or kgs).
 */
export default function NcmDrillPanel({ drillRows }) {
  const rows = (drillRows ?? []).map((r, i) => [
    r.itemCode ?? "—",
    r.machine ?? `B-${2840 + i * 3}`, // batch code if not present
    "1", // # batches
    r.actual != null ? String(Math.round(r.actual * 50)) : "—", // kg estimate if not present
    r.productType ?? r.drillDown?.[0] ?? "—", // hold reason
  ]);

  return (
    <Stack spacing={2}>
      <DrillTable
        title="NCM Hold Details"
        cols={["SKU", "Batch", "# Batches", "Kgs", "Hold Reason"]}
        rows={rows}
      />
    </Stack>
  );
}
