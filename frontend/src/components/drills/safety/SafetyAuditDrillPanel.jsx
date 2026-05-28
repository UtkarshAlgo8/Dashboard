import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * Safety Audit drill panel — Audit by area.
 * Columns: Area | Score | NC Major | NC Minor | Observations
 *
 * Static artifact data for Phase 1 (Mixing section areas).
 */
const SAFETY_AUDIT_DATA = [
  ["Banbury Hall", "96.0%", 0, 1, 3],
  ["Mill Area", "93.5%", 0, 2, 5],
  ["Batch-off", "94.0%", 0, 1, 4],
  ["Chemical Store", "91.5%", 0, 3, 7],
];

export default function SafetyAuditDrillPanel({ drillRows }) {
  // Use static data for Phase 1.
  const rows =
    drillRows && drillRows.length > 0
      ? drillRows.map((r, i) => {
          const area = r.machine ?? r.itemCode ?? `Area ${i + 1}`;
          const score =
            r.actual != null ? `${Number(r.actual).toFixed(1)}%` : "—";
          const ncMajor = r.threshold_value
            ? Math.floor(1 - r.threshold_value / 100)
            : 0;
          const ncMinor = r.drillDown?.[0] ?? i + 1;
          const obs = r.drillDown?.[1] ?? 3 + i * 2;
          return [area, score, String(ncMajor), String(ncMinor), String(obs)];
        })
      : SAFETY_AUDIT_DATA;

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Audit by Area"
        cols={["Area", "Score", "NC Major", "NC Minor", "Observations"]}
        rows={rows}
      />
    </Stack>
  );
}
