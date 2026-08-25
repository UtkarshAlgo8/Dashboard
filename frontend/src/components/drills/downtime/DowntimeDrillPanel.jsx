import { useMemo, useRef, useState } from "react";
import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";
import DataTable from "@/components/tables/DataTable.jsx";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import DrillCloseButton from "@/components/drills/shared/DrillCloseButton.jsx";
import { DOWNTIME_REASONS } from "@/lib/downtime.js";

const SECTION_NAME = {
  mix: "Mixing",
  tbm: "TBM",
  cur: "Curing",
  stk: "Stock",
};

/**
 * Downtime drill panel — CR-11.
 *
 * Two-level drill for the Total Downtime tile:
 *
 *   Level 1 — Reason breakdown (default view):
 *     6-row table: each OEE-availability-loss reason + its sum (min) +
 *     % of total. Click a row to drill in.
 *
 *   Level 2 — Per-event rows for the selected reason:
 *     (date, machine, value) for every row in the active window where
 *     that reason fired. Sorted by value desc. Q-DT-02 logs that the
 *     6 reasons are gold-level leaves — there's no further hierarchy
 *     beyond the per-event table.
 *
 * Source: `rawRows` here is the DEDICATED reason feed (useDashboardFetch's
 * `downtimeRows`) — a DAY-granularity fetch of the 6 leaves, deliberately
 * kept out of the shared dashboard row array (Q-DT-01). The panel groups
 * them here for Level 1 and filters for Level 2. `granularity` is always
 * DAY: gold stores no reason row above DAY, so following the card onto
 * MONTH would blank the breakdown.
 */
function DowntimeDrillPanel({
  section,
  rawRows,
  rows: propsRows,
  granularity = "DAY",
  isLoading = false,
  onClose,
}) {
  const rows = useMemo(
    () =>
      Array.isArray(rawRows)
        ? rawRows
        : Array.isArray(propsRows)
          ? propsRows
          : [],
    [rawRows, propsRows],
  );
  const theme = useTheme();
  const sectionName = SECTION_NAME[section] ?? section;
  const cardRef = useRef(null);
  const [selectedReason, setSelectedReason] = useState(null);

  // How many machines these sums span. Every figure in this panel is a FLEET
  // total — 169 Curing presses add up to ~12,000 hours in a 720-hour month —
  // so the header states the span rather than leaving the reader to compare
  // it against one machine's month.
  const machineCount = useMemo(() => {
    if (!Array.isArray(rows)) return 0;
    const seen = new Set();
    for (const r of rows) {
      if (r.section && r.section !== sectionName) continue;
      if (!DOWNTIME_REASONS.includes(r.kpi_name)) continue;
      if (r.granularity !== granularity) continue;
      if (r.machine && r.machine !== "nan") seen.add(r.machine);
    }
    return seen.size;
  }, [rows, sectionName, granularity]);

  // Group the 6 reasons: sum per reason for the active window.
  const reasonRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    const byReason = new Map();
    for (const r of rows) {
      if (r.section && r.section !== sectionName) continue;
      if (!DOWNTIME_REASONS.includes(r.kpi_name)) continue;
      if (r.granularity !== granularity) continue;
      const v = numOrNull(r.actual_value);
      if (v == null) continue;
      const prev = byReason.get(r.kpi_name) ?? 0;
      byReason.set(r.kpi_name, prev + v);
    }
    const total = [...byReason.values()].reduce((s, v) => s + v, 0);
    // CR-11: divide by the contributing fleet for the same reason the tile
    // does — machines go down concurrently, so their minutes are
    // machine-minutes, not elapsed time. `pct` is unaffected: a common
    // divisor cancels out of every share.
    const div = machineCount > 0 ? machineCount : 1;
    return DOWNTIME_REASONS.map((reason) => {
      const sum = (byReason.get(reason) ?? 0) / div;
      return {
        reason,
        sum,
        pct:
          total > 0
            ? Math.round(((byReason.get(reason) ?? 0) / total) * 1000) / 10
            : 0,
      };
    }).sort((a, b) => b.sum - a.sum);
  }, [rows, sectionName, granularity, machineCount]);

  const totalDowntime = reasonRows.reduce((s, r) => s + r.sum, 0);

  // Level 2: per-event rows for the selected reason.
  const eventRows = useMemo(() => {
    if (!selectedReason || !Array.isArray(rows)) return [];
    return rows
      .filter(
        (r) =>
          (!r.section || r.section === sectionName) &&
          r.kpi_name === selectedReason &&
          r.granularity === granularity,
      )
      .map((r) => ({
        date: r.date,
        machine: r.machine && r.machine !== "nan" ? r.machine : "—",
        value: numOrNull(r.actual_value) ?? 0,
        shift: r.granularity && r.granularity !== "DAY" ? r.granularity : "—",
      }))
      .sort((a, b) => b.value - a.value);
  }, [rows, sectionName, granularity, selectedReason]);

  if (reasonRows.every((r) => r.sum === 0)) {
    if (isLoading) {
      return <DrillSkeleton title rows={6} cols={3} />;
    }
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No Downtime recorded for {sectionName} in this date range.
        </Typography>
      </Box>
    );
  }

  const reasonColumns = [
    {
      key: "reason",
      label: "Reason",
      render: (r) => (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            {r.reason}
          </Typography>
          <ChevronRightIcon sx={{ fontSize: 18, color: "text.disabled" }} />
        </Stack>
      ),
    },
    {
      key: "sum",
      label: "Avg / machine (min)",
      align: "right",
      render: (r) => formatIndianNumber(Math.round(r.sum)),
    },
    {
      key: "pct",
      label: "% of Total",
      align: "right",
      render: (r) => `${r.pct.toFixed(1)}%`,
    },
  ];

  const eventColumns = [
    {
      key: "date",
      label: "Date",
      render: (r) => formatIsoDate(r.date),
    },
    {
      key: "machine",
      label: "Machine",
    },
    {
      key: "value",
      label: "Downtime (min)",
      align: "right",
      render: (r) => formatIndianNumber(Math.round(r.value)),
    },
    {
      key: "shift",
      label: "Shift",
    },
  ];

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {selectedReason && (
            <Tooltip title="Back to reasons" arrow>
              <IconButton
                size="small"
                onClick={() => setSelectedReason(null)}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                }}
                aria-label="Back to reasons"
              >
                <ArrowBackIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: "primary.main",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {selectedReason
              ? `Events · ${selectedReason}`
              : "Downtime · Reason Breakdown"}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CardDownloadButton
            cardRef={cardRef}
            rows={selectedReason ? eventRows : reasonRows}
            headers={
              selectedReason
                ? ["Date", "Machine", "Downtime (min)", "Shift"]
                : ["Reason", "Total (min)", "% of Total"]
            }
            filename={`drill-downtime-${sectionName.toLowerCase().replace(/\s+/g, "-")}`}
            sheetName="Downtime"
          />
          <DrillCloseButton onClose={onClose} />
        </Stack>
      </Stack>

      <Box
        ref={cardRef}
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
          p: 2,
          backgroundColor: "background.paper",
        }}
      >
        {selectedReason ? (
          <DataTable
            columns={eventColumns}
            rows={eventRows}
            getRowKey={(r, i) => `${r.date}-${r.machine}-${i}`}
            maxHeight={440}
            searchPlaceholder={`Search ${selectedReason} events…`}
            emptyMessage={`No events recorded for ${selectedReason} in this range.`}
          />
        ) : (
          <>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                mb: 1.5,
                p: 1.5,
                backgroundColor: theme.custom.surface.soft,
                borderRadius: 1.25,
              }}
            >
              <Typography
                sx={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "text.primary",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  flex: 1,
                }}
              >
                Total Downtime (selected window)
              </Typography>
              <Tooltip
                title={
                  machineCount > 0
                    ? `Machines go down at the same time, so their minutes cannot simply be added. This is the average across the ${machineCount} machines in ${sectionName} that recorded downtime in this window.`
                    : "Average downtime per machine for this window."
                }
                arrow
              >
                <Stack alignItems="flex-end">
                  <Typography
                    sx={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "primary.main",
                    }}
                  >
                    {formatIndianNumber(Math.round(totalDowntime))} min
                  </Typography>
                  {machineCount > 0 && (
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "text.secondary",
                        mt: 0.25,
                      }}
                    >
                      averaged over {machineCount} machines
                    </Typography>
                  )}
                </Stack>
              </Tooltip>
            </Stack>
            <DataTable
              columns={reasonColumns}
              rows={reasonRows}
              getRowKey={(r) => r.reason}
              onRowClick={(r) => setSelectedReason(r.reason)}
              maxHeight={440}
              searchPlaceholder="Search reasons…"
              emptyMessage="No reasons in this range."
            />
          </>
        )}
      </Box>
    </Stack>
  );
}

function numOrNull(v) {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function formatIsoDate(d) {
  if (!d || typeof d !== "string") return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}

export default DowntimeDrillPanel;
