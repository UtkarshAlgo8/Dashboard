import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * TQM Score drill — kpi_name = TQM_pillar.
 *
 * Per spec §11 columns: Pillar | Score | Target | Gap.
 * gold_dummy stores the pillar label inside `remarks` (e.g. "5S",
 * "Kaizen", "QC Circle", "Suggestion Scheme", "PM Pillar"), score in
 * `actual_value`, target in `threshold_value`.
 *
 * Aggregation: AVG (§9) per pillar over the active date range.
 */
function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export default function TqmDrillPanel({
  drillRows,
  granularity = "DAY",
  onClose,
}) {
  const byPillar = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "TQM_pillar") continue;
    if (r.granularity !== granularity) continue;
    const pillar = r.remarks ?? "—";
    if (pillar === "—") continue;
    if (!byPillar.has(pillar)) {
      byPillar.set(pillar, { scores: [], targets: [] });
    }
    const b = byPillar.get(pillar);
    if (typeof r.actual === "number") b.scores.push(r.actual);
    if (typeof r.threshold === "number") b.targets.push(r.threshold);
  }

  const rows = [...byPillar.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pillar, { scores, targets }]) => {
      const score = avg(scores);
      const target = avg(targets);
      const gap = score != null && target != null ? score - target : null;
      return [
        pillar,
        score != null ? score.toFixed(1) : "—",
        target != null ? target.toFixed(1) : "—",
        gap != null ? gap.toFixed(1) : "—",
      ];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="TQM Pillar Scores"
        cols={["Pillar", "Score", "Target", "Gap"]}
        rows={rows}
        downloadFilename="drill-tqm-pillars"
        downloadSheetName="TQMPillars"
        onClose={onClose}
      />
    </Stack>
  );
}
