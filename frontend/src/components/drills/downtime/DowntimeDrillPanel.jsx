import { useMemo, useRef } from "react";
import { Box, Stack, Typography } from "@mui/material";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";
import DataTable from "@/components/tables/DataTable.jsx";
import { snapshotLatest } from "@/lib/drillDate.js";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";

const DOWNTIME_COLUMNS = [
  { key: "code", label: "Code Category", align: "left" },
  { key: "machine", label: "Equipment", align: "left" },
  { key: "reason", label: "Delay Reason", align: "left" },
  { key: "events", label: "Events" },
  {
    key: "totalMin",
    label: "Total DT (Min)",
    filterable: false,
    value: (r) => r.totalHrs * 60,
    render: (r) => Math.round(r.totalMin),
  },
  {
    key: "totalHrs",
    label: "Total DT (Hr)",
    filterable: false,
    value: (r) => r.totalHrs,
    render: (r) => r.totalHrs.toFixed(2),
  },
];

/**
 * Downtime drill — leaf table per dashboard_kpi_map_reference §11:
 *
 *   Downtime_category | Code · Machine · Reason · Frequency
 *                     · Total Min · Hrs/Day
 *
 * Source: gold `Downtime_category` rows already in hand via `rawRows`.
 * The remarks column stores both Code and Reason as
 * "BD-ELEC: Motor overload trip" — split on the first ":" to fill the
 * two columns. unit_of_measurement is hrs; Total DT (Min) = Hrs × 60.
 *
 * Scope (journey.md §15.5): Downtime is a MACHINE event — NOT
 * product-scoped — so we ignore the active product pill and pin section
 * only. Time (§3): in snapshot mode collapse to the latest available
 * date so the per-category minutes reconcile with the card; we sum
 * events WITHIN that day (multiple stoppages per reason) but never
 * across the trailing window.
 */
const SECTION_NAME = {
  mix: "Mixing",
  tbm: "TBM",
  cur: "Curing",
  stk: "Stock",
};

function DowntimeDrillPanel({
  section,
  rawRows,
  mode = "snapshot",
  granularity = "DAY",
  isLoading = false,
}) {
  const sectionName = SECTION_NAME[section] ?? section;

  const cardRef = useRef(null);

  const grouped = useMemo(() => {
    if (!Array.isArray(rawRows)) return [];
    const rows = snapshotLatest(
      rawRows.filter(
        (r) =>
          r.section === sectionName &&
          r.kpi_name === "Downtime_category" &&
          r.granularity === granularity,
      ),
      mode,
    );
    const groups = new Map();
    for (const r of rows) {
      const { code, reason } = parseRemarks(r.remarks);
      const machine = r.machine && r.machine !== "nan" ? r.machine : "—";
      const key = `${code}||${machine}||${reason}`;
      if (!groups.has(key)) {
        groups.set(key, {
          code,
          machine,
          reason,
          events: 0,
          totalHrs: 0,
        });
      }
      const acc = groups.get(key);
      acc.events += 1;
      if (typeof r.actual_value === "number") acc.totalHrs += r.actual_value;
    }
    return [...groups.values()]
      .map((g) => ({
        code: g.code,
        machine: g.machine,
        reason: g.reason,
        events: g.events,
        totalMin: g.totalHrs * 60,
        totalHrs: g.totalHrs,
      }))
      .sort((a, b) => b.totalHrs - a.totalHrs);
  }, [mode, rawRows, sectionName, granularity]);

  if (grouped.length === 0) {
    if (isLoading) {
      return <DrillSkeleton title rows={6} cols={6} />;
    }
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No Downtime breakdown for {sectionName} in this date range.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 700,
            color: "primary.main",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Detailed Downtime Log
        </Typography>
        {/* Top-right download — menu offers PDF (visual) + Excel (rows). */}
        <CardDownloadButton
          cardRef={cardRef}
          rows={grouped}
          headers={[
            "Code Category",
            "Equipment",
            "Delay Reason",
            "Events",
            "Total DT (Min)",
            "Total DT (Hr)",
          ]}
          filename={`drill-downtime-${sectionName.toLowerCase().replace(/\s+/g, "-")}`}
          sheetName="Downtime"
        />
      </Stack>

      <Box ref={cardRef}>
        <DataTable
          columns={DOWNTIME_COLUMNS}
          rows={grouped}
          maxHeight={440}
          searchPlaceholder="Search downtime…"
          emptyMessage="No Downtime breakdown for this range."
        />
      </Box>
    </Stack>
  );
}

function parseRemarks(raw) {
  if (!raw || raw === "nan") return { code: "—", reason: "—" };
  const colonIdx = raw.indexOf(":");
  if (colonIdx < 0) return { code: raw, reason: "—" };
  return {
    code: raw.slice(0, colonIdx).trim(),
    reason: raw.slice(colonIdx + 1).trim(),
  };
}

export default DowntimeDrillPanel;
