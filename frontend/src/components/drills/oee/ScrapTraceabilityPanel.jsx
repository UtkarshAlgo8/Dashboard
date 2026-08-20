import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
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
import TablePager from "@/components/tables/TablePager.jsx";
import { TableSkeleton } from "@/components/drills/DrillSkeletons.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getScrapTraceability } from "@/api/drills.js";
import { toDisplayDate } from "@/lib/dateFormat.js";
import { BANBURY_PARAM_RANGES } from "@/lib/mockData.js";
import { buildCsv, downloadCsv } from "@/lib/csv.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";

const SHIFT_COLOR_KEY = { A: "blue", B: "amber", C: "purple" };

/**
 * Production ID-wise traceability panel per BRD §6.11 (FR-P50–P59).
 *
 * Opens beneath the Quality/Scrap sub-drill table when a traceable
 * scrap row is clicked. Owns its own fetch and the CSV download.
 */
const DEFAULT_PAGE_SIZE = 100;

function ScrapTraceabilityPanel({ plantId, section, machine, itemCode }) {
  const theme = useTheme();
  const toast = useToast();

  // Pagination: one page of rows at a time, navigable in both directions.
  // Fetched pages are kept (keyed by page index) so stepping back is instant
  // and so the CSV can still export everything the user has walked through;
  // the table itself renders ONLY the current page.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageRows, setPageRows] = useState({}); // { [pageIndex]: row[] }

  // Reset the cache whenever the traced entity changes. Done during render
  // (React's "adjusting state on prop change" pattern) rather than in an
  // effect, so the stale pages never flash before an effect can clear them.
  const entityKey = `${plantId}/${section}/${machine.id}/${itemCode}`;
  const [prevEntityKey, setPrevEntityKey] = useState(entityKey);
  if (prevEntityKey !== entityKey) {
    setPrevEntityKey(entityKey);
    setPage(0);
    setPageRows({});
  }

  // OFFSET is in rows, so every cached page is indexed against the OLD size —
  // changing it invalidates the whole cache, not just the current page.
  const handlePageSize = (size) => {
    setPageSize(size);
    setPage(0);
    setPageRows({});
  };

  const { data, isLoading, error } = usePolledQuery(
    async () => {
      const rows = await getScrapTraceability({
        plantId,
        section,
        machineId: machine.id,
        itemCode,
        limit: pageSize,
        offset: page * pageSize,
      });
      // Tag the result with the page it belongs to so the accumulator below
      // correlates async responses to the correct page (no stale closure).
      return { page, rows: Array.isArray(rows) ? rows : [] };
    },
    {
      interval: 0, // point-in-time snapshot; no polling
      deps: [plantId, section, machine.id, itemCode, page, pageSize],
    },
  );

  // Store each resolved page. Reacting to the async fetch result IS
  // synchronizing with an external system, so the synchronous setState here
  // is the canonical pattern (same as usePolledQuery itself).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!data) return;
    const { page: p, rows } = data;
    setPageRows((prev) => ({ ...prev, [p]: rows }));
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (error) {
    toast.error("Could not load traceability report.");
  }

  // The rows on screen: the current page only.
  const rows = pageRows[page] ?? [];

  // Every page fetched so far, in page order — what the CSV exports, so the
  // report is never narrower than what the user has already seen.
  const loadedRows = useMemo(
    () =>
      Object.keys(pageRows)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((p) => pageRows[p]),
    [pageRows],
  );

  // A full page means another may follow; a short page is the last one. An
  // un-fetched page can't answer yet, so Next stays disabled until it lands.
  const hasMore = pageRows[page] ? pageRows[page].length === pageSize : false;
  const isLoadingPage = isLoading && !pageRows[page];
  const pageStart = page * pageSize;

  const handleDownload = () => {
    if (loadedRows.length === 0) {
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
    const csvRows = loadedRows.map((r) => [
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
          disabled={loadedRows.length === 0}
        >
          Download Traceability Report
        </Button>
      </Stack>

      {isLoadingPage ? (
        <TableSkeleton rows={4} cols={7} />
      ) : rows.length === 0 && page === 0 ? (
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
          {/* A page past the end (the previous page happened to be exactly
              full) renders empty — with the pager still there to step back,
              never the "no records at all" empty state. */}
          {rows.length > 0 ? (
            <TraceabilityTable rows={rows} />
          ) : (
            <Typography
              sx={{ fontSize: 13, color: "text.disabled", py: 2 }}
              align="center"
            >
              No further Production IDs on this page.
            </Typography>
          )}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            sx={{ mt: 1.5 }}
          >
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              {rows.length === 0
                ? "0 rows"
                : `${pageStart + 1}–${pageStart + rows.length}`}
            </Typography>
            <TablePager
              page={page}
              pageSize={pageSize}
              hasMore={hasMore}
              onPageChange={setPage}
              onPageSizeChange={handlePageSize}
              disabled={isLoading}
            />
          </Stack>
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
                {formatIndianNumber(r.produced)}
              </TableCell>
              <TableCell align="center" sx={{ fontSize: 13, fontWeight: 600 }}>
                {formatIndianNumber(r.scrap)}
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
