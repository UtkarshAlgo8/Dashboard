import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";

/**
 * FTQ drill — Machine-wise FTQ (kpi_name = FTQ_m).
 *
 * Per spec §11 columns: Machine | FTQ % | Defects | Top Defect.
 * gold_dummy `FTQ_m` rows carry the FTQ % in `actual_value` and the
 * top-defect label inside `remarks` (e.g. "Top defect: Contaminated").
 * Defect counts are not stored separately, so the Defects column is
 * derived from the `Defect_Scrap_m` panel only — here we leave it blank.
 *
 * Aggregation: AVG of Daily rows per machine over the active date range.
 */
function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function topDefect(remarksList) {
  if (!remarksList.length) return "—";
  const counts = new Map();
  for (const r of remarksList) {
    const clean = r.replace(/^Top defect:\s*/i, "").trim();
    if (!clean) continue;
    counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }
  if (counts.size === 0) return "—";
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export default function FtdDrillPanel({ drillRows, granularity = "DAY" }) {
  const byMachine = new Map();
  for (const r of drillRows ?? []) {
    if (r.kpiName !== "FTQ_m") continue;
    if (r.granularity !== granularity) continue;
    if (!r.machine) continue;
    if (!byMachine.has(r.machine)) {
      byMachine.set(r.machine, { actuals: [], remarks: [] });
    }
    const b = byMachine.get(r.machine);
    if (typeof r.actual === "number") b.actuals.push(r.actual);
    if (r.remarks) b.remarks.push(r.remarks);
  }

  const rows = [...byMachine.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([machine, { actuals, remarks }]) => {
      const ftq = avg(actuals);
      return [
        machine,
        ftq != null ? `${ftq.toFixed(1)}%` : "—",
        "—",
        topDefect(remarks),
      ];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Machine-wise FTQ"
        cols={["Machine", "FTQ %", "Defects", "Top Defect"]}
        rows={rows}
        downloadFilename="drill-ftq-machine"
        downloadSheetName="FTQ"
      />
    </Stack>
  );
}
