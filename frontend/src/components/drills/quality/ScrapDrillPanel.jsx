import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Defect + Scrap drill — kpi_names = Defect_Scrap_m, Defect_Scrap_sku.
 *
 * Per spec §11 columns: SKU | Machine | Reason.
 * gold_dummy stores the reason inside `remarks`. SUM per (SKU, machine,
 * reason) over the active date range; sorted by total qty desc.
 */
export default function ScrapDrillPanel({ drillRows }) {
  const groups = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Defect_Scrap_m" && r.kpiName !== "Defect_Scrap_sku") {
      continue;
    }
    if (r.granularity !== "Daily") continue;
    const sku = r.itemCode ?? "—";
    const machine = r.machine ?? "—";
    const reason = r.remarks ?? "—";
    const key = `${sku}|${machine}|${reason}`;
    const cur = groups.get(key) ?? { sku, machine, reason, total: 0 };
    if (typeof r.actual === "number") cur.total += r.actual;
    groups.set(key, cur);
  }

  const rows = [...groups.values()]
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((g) => [g.sku, g.machine, g.reason]);

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Defect / Scrap Detail"
        cols={["SKU", "Machine", "Reason"]}
        rows={rows}
      />
    </Stack>
  );
}
