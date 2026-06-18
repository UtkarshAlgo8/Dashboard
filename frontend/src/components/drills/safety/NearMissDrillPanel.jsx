import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Near Miss drill — kpi_name = Near_Miss_category.
 *
 * Per spec §11 columns: Category | Count | Share | Status.
 * gold_dummy stores the category label in `remarks` and a count per row
 * in `actual_value`. SUM per category over the active date range,
 * share = pct of total.
 */
export default function NearMissDrillPanel({ drillRows, granularity = "Daily" }) {
  const byCat = new Map();
  let total = 0;
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Near_Miss_category") continue;
    if (r.granularity !== granularity) continue;
    const cat = r.remarks ?? "—";
    if (cat === "—") continue;
    if (!byCat.has(cat)) byCat.set(cat, 0);
    if (typeof r.actual === "number") {
      byCat.set(cat, byCat.get(cat) + r.actual);
      total += r.actual;
    }
  }

  const rows = [...byCat.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([cat, count]) => {
      const c = Math.round(count);
      const share = total > 0 ? `${Math.round((count / total) * 100)}%` : "—";
      return [cat, String(c), share, "—"];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Near Miss Categories"
        cols={["Category", "Count", "Share", "Status"]}
        rows={rows}
      />
    </Stack>
  );
}
