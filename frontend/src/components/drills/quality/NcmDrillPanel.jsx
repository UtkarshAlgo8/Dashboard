import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * NCM Hold drill — item-code-wise hold details (kpi_name = NCM_Hold_sku).
 *
 * quality-change.md §6: columns are Item Code | Hold Quantity | Final
 * Status | Remark / Reason. NCM Hold automatically reflects the currently
 * selected context (section / sub_section / product_type) — the user does
 * NOT re-pick the product type after clicking. That pinning is already
 * applied server-side on the drill fetch (the context carries the active
 * sub_section + product_type), so this panel just renders the rows it is
 * handed for the snapshot day.
 *
 * NCM_Hold is a SNAP KPI (§9) — show the latest value per (item code,
 * reason) within the active date range.
 */
export default function NcmDrillPanel({ drillRows, granularity = "DAY" }) {
  const latestByItemReason = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "NCM_Hold_sku") continue;
    if (r.granularity !== granularity) continue;
    if (!r.itemCode) continue;
    const itemCode = r.itemCode;
    const reason = r.remarks ?? "—";
    const key = `${itemCode}|${reason}`;
    const existing = latestByItemReason.get(key);
    if (!existing || (r.date && r.date > existing.date)) {
      latestByItemReason.set(key, {
        itemCode,
        reason,
        date: r.date,
        actual: typeof r.actual === "number" ? r.actual : null,
        status: r.status ?? "—",
      });
    }
  }

  const rows = [...latestByItemReason.values()]
    .filter((row) => row.actual != null && row.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .map((row) => [
      row.itemCode,
      Math.round(row.actual).toLocaleString(),
      row.status ?? "—",
      row.reason,
    ]);

  return (
    <Stack spacing={2}>
      <DrillTable
        title="NCM Hold Details"
        cols={["Item Code", "Hold Quantity", "Final Status", "Remark / Reason"]}
        rows={rows}
      />
    </Stack>
  );
}
