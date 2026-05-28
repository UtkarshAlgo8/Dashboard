import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Suggestions drill panel — Suggestion status by category.
 * Columns: Category | Submitted | Implemented | Pending | Savings (₹K)
 *
 * Static artifact data for Phase 1.
 */
const SUGGESTIONS_DATA = [
  ["Quality", 18, 12, 6, 85],
  ["Safety", 12, 10, 2, 42],
  ["Productivity", 15, 8, 7, 120],
  ["Cost Reduction", 8, 5, 3, 95],
];

export default function SuggestionsDrillPanel({ drillRows }) {
  const rows =
    drillRows && drillRows.length > 0
      ? drillRows.map((r) => {
          const cat = r.machine ?? r.itemCode ?? "—";
          const submitted = r.actual ?? 0;
          const implemented = r.drillDown?.[0] ?? Math.floor(submitted * 0.6);
          const pending = submitted - implemented;
          const savings = r.threshold_value ?? 0;
          return [
            cat,
            String(submitted),
            String(implemented),
            String(pending),
            `${savings}`,
          ];
        })
      : SUGGESTIONS_DATA;

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
