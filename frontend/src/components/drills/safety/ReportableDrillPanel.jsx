import { Stack } from "@mui/material";
import { DrillTable } from "@/components/drills/shared/DrillTable.jsx";
import { toDisplayDate } from "@/lib/dateFormat.js";

/**
 * Reportable Incident log drill — kpi_name = Reportable_log.
 *
 * Per spec §11 columns: Date | Type | Area | Description | Status.
 * gold_dummy stores one row per incident with the area + description
 * combined in `remarks` (e.g. "Banbury Hall: Minor injury - investigation closed"),
 * date in `date`. Type is fixed = "Reportable" for this log.
 *
 * Aggregation: COUNT (§9) — one row per incident, no roll-up.
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

export default function ReportableDrillPanel({
  drillRows,
  granularity = "DAY",
  onClose,
}) {
  const rows = (drillRows ?? [])
    .filter(
      (r) =>
        r.kpiName === "Reportable_log" &&
        r.granularity === granularity &&
        typeof r.actual === "number" &&
        r.actual > 0,
    )
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .map((r) => {
      const { area, desc } = splitRemarks(r.remarks);
      return [
        toDisplayDate(r.date) ?? "—",
        "Reportable",
        area,
        desc,
        r.status ?? "—",
      ];
    });

  return (
    <Stack spacing={2}>
      <DrillTable
        title="Reportable Incidents"
        cols={["Date", "Type", "Area", "Description", "Status"]}
        rows={rows}
        downloadFilename="drill-reportable-incidents"
        downloadSheetName="Reportable"
        onClose={onClose}
      />
    </Stack>
  );
}
