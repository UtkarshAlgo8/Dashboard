import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Absenteeism drill panel — Area-wise absenteeism.
 * Columns: Area | Total | Present | Absent | Rate
 *
 * drillRows have machine=area name, actual=absent count.
 * We estimate total/present from a base of 40 + i*10 per area.
 */
export default function AbsenteeismDrillPanel({ drillRows }) {
  const rows = (drillRows ?? []).map((r, i) => {
    const area = r.machine ?? r.itemCode ?? "—";
    const absent = r.actual ?? 0;
    const total = r.drillDown?.[0] ? Number(r.drillDown[0]) : 40 + i * 10;
    const present = total - absent;
    const rate = total > 0 ? ((absent / total) * 100).toFixed(1) + "%" : "—";
    return [area, String(total), String(present), String(absent), rate];
  });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Area-wise Absenteeism"
        cols={["Area", "Total", "Present", "Absent", "Rate"]}
        rows={rows}
      />
    </Stack>
  );
}
