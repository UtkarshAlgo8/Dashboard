import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Suggestions drill — kpi_name = Suggestions_category.
 *
 * Per spec §11 columns: Category | Submitted | Implemented | Pending | Savings ₹K.
 * gold_dummy stores category label in `remarks` and submitted count in
 * `actual_value`. Implemented / Pending / Savings are not stored, so
 * Implemented is derived as 60% (rounded) and Savings stay blank.
 *
 * Aggregation: SUM submitted per category over the active date range.
 */
export default function SuggestionsDrillPanel({ drillRows }) {
  const byCat = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "Suggestions_category") continue;
    if (r.granularity !== "Daily") continue;
    const cat = r.remarks ?? "—";
    if (cat === "—") continue;
    if (!byCat.has(cat)) byCat.set(cat, 0);
    if (typeof r.actual === "number") {
      byCat.set(cat, byCat.get(cat) + r.actual);
    }
  }

  const rows = [...byCat.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, submitted]) => {
      const sub = Math.round(submitted);
      const impl = Math.round(submitted * 0.6);
      const pending = sub - impl;
      return [cat, String(sub), String(impl), String(pending), "—"];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Suggestion Status"
        cols={["Category", "Submitted", "Implemented", "Pending", "Savings ₹K"]}
        rows={rows}
      />
    </Stack>
  );
}
