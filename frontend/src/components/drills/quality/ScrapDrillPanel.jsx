import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Defect + Scrap drill — kpi_name = Defect_Scrap_sku.
 *
 * Per spec §11 columns: SKU | Machine | Reason.
 * gold_dummy `Defect_Scrap_sku` carries SKU (itemcode) + Reason (remarks)
 * but no machine — the parallel `Defect_Scrap_m` row carries Machine but
 * no SKU/Reason, with no key linking the two. We surface the per-SKU
 * breakdown (the more granular dimension) and leave Machine blank.
 *
 * SUM per (SKU, reason) over the active date range, sorted by total desc.
 */
export default function ScrapDrillPanel({ drillRows, granularity = "DAY" }) {
  const groups = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Defect_Scrap_sku") continue;
    if (r.granularity !== granularity) continue;
    const sku = r.itemCode ?? "—";
    const reason = r.remarks ?? "—";
    const key = `${sku}|${reason}`;
    const cur = groups.get(key) ?? { sku, reason, total: 0 };
    if (typeof r.actual === "number") cur.total += r.actual;
    groups.set(key, cur);
  }

  const rows = [...groups.values()]
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((g) => [g.sku, "—", g.reason]);

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Defect / Scrap Detail"
        cols={["SKU", "Machine", "Reason"]}
        rows={rows}
        downloadFilename="drill-defect-scrap"
        downloadSheetName="DefectScrap"
      />
    </Stack>
  );
}
