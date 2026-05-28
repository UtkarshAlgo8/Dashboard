import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Near Miss drill panel — Near Miss by category.
 * Columns: Category | Count | Share | Status
 *
 * Static artifact data for Phase 1.
 */
const NEARMISS_DATA = [
  ["Unsafe Act", 5, "38%", "4 Closed, 1 Open"],
  ["Unsafe Condition", 4, "31%", "3 Closed, 1 Open"],
  ["Housekeeping", 2, "15%", "Closed"],
  ["Electrical", 1, "8%", "Open"],
];

export default function NearMissDrillPanel({ drillRows }) {
  const rows =
    drillRows && drillRows.length > 0
      ? drillRows.map((r) => {
          const cat = r.machine ?? r.itemCode ?? "—";
          const count = r.actual ?? 0;
          const total = drillRows.reduce((s, x) => s + (x.actual ?? 0), 0);
          const share =
            total > 0 ? ((count / total) * 100).toFixed(0) + "%" : "—";
          const status = r.status ?? "Open";
          return [cat, String(count), share, status];
        })
      : NEARMISS_DATA;

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
