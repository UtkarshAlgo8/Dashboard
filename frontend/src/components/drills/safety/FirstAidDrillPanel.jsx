import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * First Aid drill panel — First Aid details.
 * Columns: Date | Area | Injury | Root Cause
 *
 * Static artifact data for Phase 1.
 */
const FIRSTAID_DATA = [
  ["05-Apr", "Banbury", "Minor burn", "Hot surface contact"],
  ["18-Mar", "Banbury", "Cut finger", "Sharp edge on tool"],
  ["02-Mar", "Banbury", "Eye irritation", "Chemical splash"],
];

export default function FirstAidDrillPanel({ drillRows, area = "Banbury" }) {
  const rows =
    drillRows && drillRows.length > 0
      ? drillRows.map((r) => [
          r.date ?? "—",
          r.machine ?? area,
          r.itemCode ?? r.productType ?? "—",
          r.threshold_value ?? r.drillDown?.[0] ?? "—",
        ])
      : FIRSTAID_DATA;

  return (
    <Stack spacing={2}>
      <DrillTable
        title="First Aid Details"
        cols={["Date", "Area", "Injury", "Root Cause"]}
        rows={rows}
      />
    </Stack>
  );
}
