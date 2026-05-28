import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Reportable drill panel — Incident log (90 days).
 * Columns: Date | Type | Area | Description | Status
 *
 * Static artifact data for Phase 1.
 */
const REPORTABLE_DATA = [
  ["05-Apr", "First Aid", "Banbury", "Minor burn from hot surface", "Closed"],
  ["18-Mar", "Near Miss", "Banbury", "Material splash near operator", "Closed"],
  [
    "02-Mar",
    "Near Miss",
    "Banbury",
    "Guard found missing on conveyor",
    "Fixed",
  ],
];

export default function ReportableDrillPanel({ drillRows, area = "Banbury" }) {
  const rows =
    drillRows && drillRows.length > 0
      ? drillRows.map((r) => [
          r.date ?? "—",
          r.itemCode ?? r.productType ?? "—",
          r.machine ?? area,
          r.threshold_value ?? r.drillDown?.[0] ?? "—",
          r.status ?? "Open",
        ])
      : REPORTABLE_DATA;

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Incident Log (90 Days)"
        cols={["Date", "Type", "Area", "Description", "Status"]}
        rows={rows}
      />
    </Stack>
  );
}
