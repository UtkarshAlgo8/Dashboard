import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * NCM Hold drill — NCM Hold detail (kpi_name = NCM_Hold_sku).
 *
 * Per spec §11 columns: SKU | Batch | # Batches | Kgs | Hold Reason.
 * NCM_Hold is a SNAP KPI (§9) — show the latest non-zero value per
 * (SKU, hold reason) within the active date range. The dataset stores
 * Batch as part of `drill_down_attribute` when present; gold_dummy
 * currently leaves it as "nan", so we display the SKU itself.
 */
export default function NcmDrillPanel({ drillRows }) {
  const latestBySkuReason = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "NCM_Hold_sku") continue;
    if (r.granularity !== "Daily") continue;
    if (!r.itemCode) continue;
    const sku = r.itemCode;
    const reason = r.remarks ?? "—";
    const key = `${sku}|${reason}`;
    const existing = latestBySkuReason.get(key);
    if (!existing || (r.date && r.date > existing.date)) {
      latestBySkuReason.set(key, {
        sku,
        reason,
        date: r.date,
        actual: typeof r.actual === "number" ? r.actual : null,
        unit: r.unit,
      });
    }
  }

  const rows = [...latestBySkuReason.values()]
    .filter((row) => row.actual != null && row.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .map((row) => {
      const isKg = (row.unit || "").toLowerCase().includes("kg");
      const kgs = isKg ? Math.round(row.actual) : "—";
      const batches = isKg ? "—" : Math.round(row.actual);
      return [row.sku, row.sku, String(batches), String(kgs), row.reason];
    });

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
