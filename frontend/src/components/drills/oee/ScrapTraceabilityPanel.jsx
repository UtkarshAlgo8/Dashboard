import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ParamChip from "./ParamChip.jsx";
import { EmptyState, useToast } from "@/components/common";
import { TableSkeleton } from "@/components/drills/DrillSkeletons.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getScrapTraceability } from "@/api/drills.js";
import { toDisplayDate } from "@/lib/dateFormat.js";
import { BANBURY_PARAM_RANGES } from "@/lib/mockData.js";
import { buildCsv, downloadCsv } from "@/lib/csv.js";

const SHIFT_COLOR_KEY = { A: "blue", B: "amber", C: "purple" };

/**
 * Production ID-wise traceability panel per BRD §6.11 (FR-P50–P59).
 *
 * Opens beneath the Quality/Scrap sub-drill table when a traceable
 * scrap row is clicked. Owns its own fetch and the CSV download.
 */
const PAGE_SIZE = 100;

function ScrapTraceabilityPanel({ plantId, section, machine, itemCode }) {
  const theme = useTheme();
  const toast = useToast();

  // Pagination: fetch one PAGE_SIZE page at a time and accumulate. Rows are
  // stored per-page (keyed by page index) so an in-flight "Load more" can't
  // append the previous page's data twice — the fetch tags its own page.
  const [page, setPage] = useState(0);
  const [pageRows, setPageRows] = useState({}); // { [pageIndex]: row[] }
  const [hasMore, setHasMore] = useState(true);

  // Reset the accumulation whenever the traced entity changes. Done during
  // render (React's "adjusting state on prop change" pattern) rather than in
  // an effect, so the stale pages never flash before an effect can clear them.
  const entityKey = `${plantId}/${section}/${machine.id}/${itemCode}`;
  const [prevEntityKey, setPrevEntityKey] = useState(entityKey);
  if (prevEntityKey !== entityKey) {
    setPrevEntityKey(entityKey);
    setPage(0);
    setPageRows({});
    setHasMore(true);
  }

  const { data, isLoading, error } = usePolledQuery(
    async () => {
      const rows = await getScrapTraceability({
        plantId,
        section,
        machineId: machine.id,
        itemCode,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      // Tag the result with the page it belongs to so the accumulator below
      // correlates async responses to the correct page (no stale closure).
      return { page, rows: Array.isArray(rows) ? rows : [] };
    },
    {
      interval: 0, // point-in-time snapshot; no polling
      deps: [plantId, section, machine.id, itemCode, page],
    },
  );

  // Accumulate each resolved page into pageRows. Reacting to the async fetch
  // result IS synchronizing with an external system, so the synchronous
  // setState here is the canonical pattern (same as usePolledQuery itself).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!data) return;
    const { page: p, rows } = data;
    setPageRows((prev) => ({ ...prev, [p]: rows }));
    // A short page (< PAGE_SIZE) is the last one — hide "Load more".
    setHasMore(rows.length === PAGE_SIZE);
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (error) {
    toast.error("Could not load traceability report.");
  }

  // Flatten accumulated pages in order.
  const rows = useMemo(
    () =>
      Object.keys(pageRows)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((p) => pageRows[p]),
    [pageRows],
  );

  // Only the FIRST page shows the full-panel skeleton; later pages keep the
  // existing rows visible and show a spinner on the "Load more" button.
  const isLoadingFirstPage = isLoading && rows.length === 0;
  const isLoadingMore = isLoading && rows.length > 0;

  const handleLoadMore = () => {
    if (isLoading) return;
    setPage((p) => p + 1);
  };

  const handleDownload = () => {
    if (rows.length === 0) {
      toast.warn("No records to export.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const filename = `traceability_${itemCode}_${today}.csv`;
    const headers = [
      "Item Code",
      "Production ID",
      "Produced Quantity (kg)",
      "Scrap Quantity (kg)",
      "Produced By",
      "Production Date & Time",
      "Machine Name",
      "Shift",
      "Batch/Lot Details",
      "Scrap Reason",
      "Drop Temp (°C)",
      "TCU (°C)",
      "Rotor (rpm)",
      "Mix Time (s)",
      "Power (kW)",
      "Alarm Parameter",
    ];
    const csvRows = rows.map((r) => [
      itemCode,
      r.productionId,
      r.produced,
      r.scrap,
      r.operator,
      r.dateTime,
      machine.name,
      r.shift,
      r.batchLot,
      r.scrapReason,
      r.params.dropTemp,
      r.params.tcu,
      r.params.rotor,
      r.params.mixTime,
      r.params.power,
      r.alarmParam
        ? (BANBURY_PARAM_RANGES[r.alarmParam]?.label ?? r.alarmParam)
        : "",
    ]);
    downloadCsv(filename, buildCsv(headers, csvRows));
    toast.success(`Downloaded ${filename}`);
  };

  return (
    <Box
      sx={{
        backgroundColor: theme.custom.surface.soft,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 2,
        mt: 2,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
            OE › {machine.name} › Quality › Scrap › {itemCode} › Production IDs
          </Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
            Traceability — {itemCode}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={rows.length === 0}
        >
          Download Traceability Report
        </Button>
      </Stack>

      {isLoadingFirstPage ? (
        <TableSkeleton rows={4} cols={7} />
      ) : rows.length === 0 ? (
        <Box
          sx={{
            border: 1,
            borderStyle: "dashed",
            borderColor: "divider",
            borderRadius: 1.25,
            p: 3,
          }}
        >
          <EmptyState
            title="No Production IDs"
            description={`No Production IDs recorded for ${itemCode} in this period.`}
          />
        </Box>
      ) : (
        <>
          <TraceabilityTable rows={rows} />
          {hasMore && (
            <Stack alignItems="center" sx={{ mt: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                startIcon={
                  isLoadingMore ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : undefined
                }
              >
                {isLoadingMore
                  ? "Loading…"
                  : `Load more (${rows.length} shown)`}
              </Button>
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}

function TraceabilityTable({ rows }) {
  return (
    <TableContainer
      sx={{
        maxHeight: 360,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        backgroundColor: "background.paper",
      }}
    >
      <Table
        size="small"
        stickyHeader
        sx={(t) => ({
          "& .MuiTableCell-root": {
            border: "1px solid",
            borderColor: t.palette.divider,
          },
          "& thead .MuiTableCell-root": {
            backgroundColor: t.custom.surface.soft,
          },
        })}
      >
        <TableHead>
          <TableRow>
            <Th align="center">Production ID</Th>
            <Th align="center">Shift</Th>
            <Th align="center">Operator</Th>
            <Th>Produced (kg)</Th>
            <Th>Scrap (kg)</Th>
            <Th align="center">Date &amp; Time</Th>
            <Th align="center">Machine Parameters</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.productionId} hover>
              <TableCell sx={{ fontSize: 12, fontFamily: "monospace" }}>
                {r.productionId}
              </TableCell>
              <TableCell>
                <ShiftPill shift={r.shift} />
              </TableCell>
              <TableCell sx={{ fontSize: 13 }}>{r.operator}</TableCell>
              <TableCell align="center" sx={{ fontSize: 13 }}>
                {r.produced}
              </TableCell>
              <TableCell align="center" sx={{ fontSize: 13, fontWeight: 600 }}>
                {r.scrap}
              </TableCell>
              <TableCell sx={{ fontSize: 12, whiteSpace: "nowrap" }}>
                {formatDateTime(r.dateTime)}
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  <ParamChip paramKey="dropTemp" value={r.params.dropTemp} />
                  <ParamChip paramKey="tcu" value={r.params.tcu} />
                  <ParamChip paramKey="rotor" value={r.params.rotor} />
                  <ParamChip paramKey="mixTime" value={r.params.mixTime} />
                  <ParamChip paramKey="power" value={r.params.power} />
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function Th({ children, align = "center" }) {
  return (
    <TableCell
      align={align}
      sx={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: "text.disabled",
        backgroundColor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </TableCell>
  );
}

function ShiftPill({ shift }) {
  const theme = useTheme();
  const color = theme.custom.brand[SHIFT_COLOR_KEY[shift] ?? "blue"];
  return (
    <Box
      sx={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        color,
        border: 1,
        borderColor: color,
        backgroundColor: `${color}14`,
        borderRadius: 999,
        px: 0.75,
        py: 0.125,
        minWidth: 18,
        textAlign: "center",
      }}
    >
      {shift}
    </Box>
  );
}

function formatDateTime(iso) {
  // Display as "15-10-2026 · 07:23"
  try {
    const d = new Date(iso);
    const tt = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${toDisplayDate(d)} · ${tt}`;
  } catch {
    return iso;
  }
}

export default ScrapTraceabilityPanel;
