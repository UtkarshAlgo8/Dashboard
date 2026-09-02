import { useMemo, useRef, useState } from "react";
import {
  Box,
  FormControl,
  IconButton,
  MenuItem,
  Select,
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
import { dateKey } from "@/lib/drillDate.js";

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
  // new_change.md C3/C6: the CARD's resolved (as-of) date. For the Today /
  // Shift presets the reason feed spans a trailing 7-day window so the card
  // sparkline has points, but the card headline means ONE day. Pinning to
  // `cardDate` collapses this panel to that day so the drill reconciles with
  // the tile. MONTH and custom ranges pass null (their window IS the card
  // period), so they keep the full span.
  cardDate = null,
  isLoading = false,
  onClose,
}) {
  const rows = useMemo(() => {
    const base = Array.isArray(rawRows)
      ? rawRows
      : Array.isArray(propsRows)
        ? propsRows
        : [];
    if (cardDate) {
      const want = dateKey(cardDate);
      return base.filter((r) => dateKey(r?.date) === want);
    }
    return base;
  }, [rawRows, propsRows, cardDate]);
  const theme = useTheme();
  const sectionName = SECTION_NAME[section] ?? section;
  const cardRef = useRef(null);
  const [selectedReason, setSelectedReason] = useState(null);
  // null = "All Machines" (fleet-average view). When set, sums become
  // that machine's actual minutes — see reasonRows memo.
  const [selectedMachine, setSelectedMachine] = useState(null);

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

  // The Machine dropdown is derived from the same scope as `machineCount`
  // so users can pick any machine that recorded downtime in this window.
  // Deliberately NOT scoped by `selectedMachine` itself — the filter must
  // always show every available machine so users can switch between them.
  const machineOptions = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    for (const r of rows) {
      if (r.section && r.section !== sectionName) continue;
      if (!DOWNTIME_REASONS.includes(r.kpi_name)) continue;
      if (r.granularity !== granularity) continue;
      if (r.machine && r.machine !== "nan") seen.add(r.machine);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [rows, sectionName, granularity]);

  // Group the 6 reasons: sum per reason for the active window, tracking
  // which machines reported EACH reason separately (GROUP BY kpi_name
  // semantics) — different reasons can be reported by different subsets
  // of the fleet, so they can't share one divisor.
  const reasonRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    const byReason = new Map();
    const byReasonMachines = new Map();
    for (const r of rows) {
      if (r.section && r.section !== sectionName) continue;
      if (!DOWNTIME_REASONS.includes(r.kpi_name)) continue;
      if (r.granularity !== granularity) continue;
      if (selectedMachine && r.machine !== selectedMachine) continue;
      const v = numOrNull(r.actual_value);
      if (v == null) continue;
      const prev = byReason.get(r.kpi_name) ?? 0;
      byReason.set(r.kpi_name, prev + v);
      if (r.machine && r.machine !== "nan") {
        const machines = byReasonMachines.get(r.kpi_name) ?? new Set();
        machines.add(r.machine);
        byReasonMachines.set(r.kpi_name, machines);
      }
    }
    // CR-11: fleet view — machines go down concurrently, so their minutes
    // are machine-minutes, not elapsed time. Each reason divides by the
    // machines that reported THAT specific reason, not one shared
    // fleet-wide count (a reason reported by 3 machines must average over
    // 3, not the whole section's fleet).
    //
    // Single-machine view — divide by 1. `byReason` already reflects just
    // that machine's minutes after the row filter above.
    return DOWNTIME_REASONS.map((reason) => {
      const reasonMachineCount = byReasonMachines.get(reason)?.size ?? 0;
      const div = selectedMachine
        ? 1
        : reasonMachineCount > 0
          ? reasonMachineCount
          : 1;
      const sum = (byReason.get(reason) ?? 0) / div;
      return { reason, sum };
    }).sort((a, b) => b.sum - a.sum);
  }, [rows, sectionName, granularity, selectedMachine]);

  const totalDowntime = reasonRows.reduce((s, r) => s + r.sum, 0);

  // Level 2: per-event rows for the selected reason.
  const eventRows = useMemo(() => {
    if (!selectedReason || !Array.isArray(rows)) return [];
    return rows
      .filter(
        (r) =>
          (!r.section || r.section === sectionName) &&
          r.kpi_name === selectedReason &&
          r.granularity === granularity &&
          (!selectedMachine || r.machine === selectedMachine),
      )
      .map((r) => ({
        date: r.date,
        machine: r.machine && r.machine !== "nan" ? r.machine : "—",
        value: numOrNull(r.actual_value) ?? 0,
        shift: r.granularity && r.granularity !== "DAY" ? r.granularity : "—",
      }))
      .sort((a, b) => b.value - a.value);
  }, [rows, sectionName, granularity, selectedReason, selectedMachine]);

  if (reasonRows.every((r) => r.sum === 0)) {
    if (isLoading) {
      return <DrillSkeleton title rows={6} cols={3} />;
    }
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No Downtime recorded for {sectionName}
          {selectedMachine ? ` on ${selectedMachine}` : ""} in this date range.
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
      label: selectedMachine ? "Downtime (min)" : "Avg / machine (min)",
      align: "right",
      render: (r) => formatIndianNumber(Math.round(r.sum)),
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
                : selectedMachine
                  ? ["Reason", "Downtime (min)"]
                  : ["Reason", "Avg / machine (min)"]
            }
            filename={
              selectedReason
                ? `drill-downtime-${sectionName.toLowerCase().replace(/\s+/g, "-")}`
                : selectedMachine
                  ? `drill-downtime-${sectionName.toLowerCase().replace(/\s+/g, "-")}-${selectedMachine.toLowerCase().replace(/\s+/g, "-")}`
                  : `drill-downtime-${sectionName.toLowerCase().replace(/\s+/g, "-")}`
            }
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
            emptyMessage={`No events recorded for ${selectedReason}${selectedMachine ? ` on ${selectedMachine}` : ""} in this range.`}
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
                  selectedMachine
                    ? `Total downtime recorded by ${selectedMachine} in this window.`
                    : machineCount > 0
                      ? `Machines go down at the same time, so their minutes cannot simply be added. Each reason below is averaged over the machines that reported THAT reason (see the count under each row) — this total is the sum of those per-reason fleet averages, spanning ${machineCount} machines in ${sectionName} overall.`
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
                  {!selectedMachine && machineCount > 0 && (
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "text.secondary",
                        mt: 0.25,
                      }}
                    >
                      sum of per-reason fleet averages
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
              toolbarRight={
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={selectedMachine ?? ""}
                    onChange={(e) => setSelectedMachine(e.target.value || null)}
                    displayEmpty
                    aria-label="Filter by machine"
                    sx={{ fontSize: 14 }}
                  >
                    <MenuItem value="" sx={{ fontSize: 14 }}>
                      All Machines
                    </MenuItem>
                    {machineOptions.map((m) => (
                      <MenuItem key={m} value={m} sx={{ fontSize: 14 }}>
                        {m}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              }
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
