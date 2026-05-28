import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Rework drill panel — Rework detail.
 * Columns: SKU | Machine | Defect | Qty | Status
 *
 * Static artifact data for Phase 1.
 */
const REWORK_DATA = [
  ["MS149", "Banbury 1", "Viscosity NC", 5, "In progress"],
  ["ML405", "Banbury 2", "Off-Spec", 3, "Pending"],
  ["MT273", "Banbury 3", "Cure Rate NC", 4, "In progress"],
  ["MB614", "Banbury 4", "Contaminated", 2, "Pending"],
  ["MS66", "Banbury 5", "Viscosity NC", 3, "In progress"],
];

export default function ReworkDrillPanel({ drillRows }) {
  const rows =
    drillRows && drillRows.length > 0
      ? drillRows.map((r) => [
          r.itemCode ?? "—",
          r.machine ?? "—",
          r.productType ?? r.drillDown?.[0] ?? "—",
          r.actual ?? "—",
          r.status ?? "Pending",
        ])
      : REWORK_DATA;

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Rework Detail"
        cols={["SKU", "Machine", "Defect", "Qty", "Status"]}
        rows={rows}
      />
    </Stack>
  );
}
