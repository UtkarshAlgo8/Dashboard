import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Scrap drill panel — Scrap detail by SKU / Machine.
 * Columns: SKU | Machine | Reason
 *
 * Each drill row has: itemCode (SKU), machine, actual (qty), productType/drillDown (reason).
 */
export default function ScrapDrillPanel({ drillRows }) {
  const rows = (drillRows ?? []).map((r) => [
    r.itemCode ?? "—",
    r.machine ?? "—",
    r.productType ?? r.drillDown?.[0] ?? "—", // scrap reason
  ]);

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Scrap Detail"
        cols={["SKU", "Machine", "Reason"]}
        rows={rows}
      />
    </Stack>
  );
}
