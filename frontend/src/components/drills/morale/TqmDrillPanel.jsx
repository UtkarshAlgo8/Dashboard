import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * TQM Score drill panel — TQM by Pillar.
 * Columns: Pillar | Score | Target | Gap
 *
 * Static artifact data for now since gold_dummy doesn't have
 * pillar-level TQM rows. Rows come with machine=pillar name.
 */
const TQM_PILLARS = [
  ["5S / Housekeeping", 4.2, 5],
  ["Kaizen / CI", 3.5, 5],
  ["QC Circle", 3.8, 5],
  ["Suggestion Scheme", 3.6, 5],
  ["PM Pillar", 4.0, 5],
];

export default function TqmDrillPanel({ drillRows }) {
  // If live rows exist, use them; otherwise fall back to static pillars.
  const rows =
    drillRows && drillRows.length > 0
      ? drillRows.map((r) => {
          const pillar = r.machine ?? r.itemCode ?? "—";
          const score = r.actual ?? 0;
          const target = r.threshold_value ?? 5;
          const gap = (score - target).toFixed(1);
          return [pillar, score.toFixed(1), target.toFixed(0), gap];
        })
      : TQM_PILLARS.map(([pillar, score, target]) => [
          pillar,
          score.toFixed(1),
          target.toString(),
          (score - target).toFixed(1),
        ]);

  return (
    <Stack spacing={2}>
      <DrillTable
        title="TQM by Pillar"
        cols={["Pillar", "Score", "Target", "Gap"]}
        rows={rows}
      />
    </Stack>
  );
}
