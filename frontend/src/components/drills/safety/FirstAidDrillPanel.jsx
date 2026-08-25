import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";
import { toDisplayDate } from "@/lib/dateFormat.js";

/**
 * First Aid log drill — kpi_name = First_Aid_log.
 *
 * Per spec §11 columns: Date | Area | Injury | Root Cause.
 * gold_dummy stores one row per case with area + injury combined in
 * `remarks` (e.g. "Banbury Hall: First aid case"). Injury detail / root
 * cause aren't separately stored — Injury falls back to the description
 * and Root Cause stays blank.
 *
 * Aggregation: COUNT (§9) — one row per case.
 */
function splitRemarks(remarks) {
  if (!remarks) return { area: "—", desc: "—" };
  const idx = remarks.indexOf(":");
  if (idx < 0) return { area: "—", desc: remarks.trim() };
  return {
    area: remarks.slice(0, idx).trim(),
    desc: remarks.slice(idx + 1).trim(),
  };
}

export default function FirstAidDrillPanel({
  drillRows,
  granularity = "DAY",
  onClose,
}) {
  const rows = (drillRows ?? [])
    .filter(
      (r) =>
        r.kpiName === "First_Aid_log" &&
        r.granularity === granularity &&
        typeof r.actual === "number" &&
        r.actual > 0,
    )
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .map((r) => {
      const { area, desc } = splitRemarks(r.remarks);
      return [toDisplayDate(r.date) ?? "—", area, desc, "—"];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="First Aid Cases"
        cols={["Date", "Area", "Injury", "Root Cause"]}
        rows={rows}
        downloadFilename="drill-first-aid"
        downloadSheetName="FirstAid"
        onClose={onClose}
      />
    </Stack>
  );
}
