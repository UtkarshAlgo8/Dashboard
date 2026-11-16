import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import useSafetyQuery from "@/hooks/useSafetyQuery.js";
import { safetyPeriodLabel } from "@/lib/safety.js";
import { getSafetyExport } from "@/api/safety.js";
import MaintenanceDownloadButton from "@/components/engineering/MaintenanceDownloadButton.jsx";
import {
  MAINTENANCE_HEADERS,
  maintenanceExportFilename,
} from "@/lib/maintenanceDownloads.js";

const display = (value) => (value == null ? "—" : value);

/** Selected type is the only route to report text; every page is scoped in SQL. */
export default function SafetyDrillPanel({ period, onClose }) {
  const panelRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [selection, setSelection] = useState({ type: null, offset: 0 });
  const { type, offset } = selection;
  const level = type === null ? "types" : "reports";
  const query = useSafetyQuery({
    ...period,
    level,
    ...(type !== null ? { type } : {}),
    offset,
    limit: 25,
  });
  const data = query.data;
  const page = data?.page;
  const rows = data?.rows ?? [];
  const back = () => setSelection({ type: null, offset: 0 });
  return (
    <Paper
      ref={panelRef}
      component="section"
      variant="outlined"
      aria-label="Safety Observations drill"
      sx={{ p: 2, borderRadius: 2 }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>
          Safety Observations
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <MaintenanceDownloadButton
            cardRef={panelRef}
            headers={
              type === null
                ? MAINTENANCE_HEADERS.safetyTypes
                : MAINTENANCE_HEADERS.safetyReports
            }
            filename={maintenanceExportFilename(
              "safety",
              period,
              `${level}-${type ?? "all"}`,
            )}
            disabled={Boolean(query.error) || query.isLoading || !page?.total}
            onBusyChange={setExporting}
            downloadExcel={(options) =>
              getSafetyExport(
                {
                  ...period,
                  level,
                  ...(type !== null ? { type } : {}),
                },
                options,
              )
            }
          />
          <Button size="small" onClick={onClose}>
            Close
          </Button>
        </Stack>
      </Stack>
      <Breadcrumbs sx={{ mb: 1, fontSize: 13 }}>
        <Button size="small" onClick={back} disabled={exporting}>
          Banmore · Types
        </Button>
        {type !== null && (
          <Typography sx={{ fontSize: 13, overflowWrap: "anywhere" }}>
            {type} · Reports
          </Typography>
        )}
      </Breadcrumbs>
      <Typography sx={{ mb: 1, fontSize: 12, color: "text.secondary" }}>
        {safetyPeriodLabel(period)} · Published observations · NOS
      </Typography>
      {type !== null && (
        <Button size="small" onClick={back} disabled={exporting} sx={{ mb: 1 }}>
          Back to types
        </Button>
      )}
      {query.error ? (
        <Alert severity="error">
          Safety unavailable: {query.error.message}
        </Alert>
      ) : query.isLoading ? (
        <JKLoader
          message={
            type === null
              ? "Loading observation types"
              : "Loading observation reports"
          }
        />
      ) : rows.length ? (
        <DTable
          sortable={false}
          statusColors={false}
          preserveText
          keyboardRows
          cols={
            type === null
              ? MAINTENANCE_HEADERS.safetyTypes
              : MAINTENANCE_HEADERS.safetyReports
          }
          rows={rows.map((row) =>
            type === null
              ? [row.type, row.value]
              : [
                  row.date,
                  display(row.shift),
                  display(row.section),
                  display(row.machine),
                  display(row.status),
                  display(row.remarks),
                ],
          )}
          onRowClick={
            type === null && !exporting
              ? (row) => setSelection({ type: row[0], offset: 0 })
              : undefined
          }
        />
      ) : (
        <Box sx={{ py: 2, color: "text.secondary" }}>
          {type === null
            ? "No published observation types for this period."
            : "No reports for this type and period."}
        </Box>
      )}
      {!query.error && !query.isLoading && page && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ mt: 1 }}
        >
          <Button
            size="small"
            disabled={exporting || offset === 0}
            onClick={() =>
              setSelection({ type, offset: Math.max(0, offset - 25) })
            }
          >
            Previous
          </Button>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {page.total === 0 ? "0" : `${offset + 1}–${offset + rows.length}`}{" "}
            of {page.total} {type === null ? "types" : "reports"}
          </Typography>
          <Button
            size="small"
            disabled={exporting || !page.hasMore}
            onClick={() => setSelection({ type, offset: offset + 25 })}
          >
            Next
          </Button>
        </Stack>
      )}
      {!query.error && !query.isLoading && page?.total > 0 && (
        <Typography sx={{ mt: 1, fontSize: 12, color: "text.secondary" }}>
          PDF captures the displayed page. Excel includes all matching{" "}
          {type === null ? "types" : "reports"} (up to 10,000 rows).
        </Typography>
      )}
      {type === null && rows.length > 0 && (
        <Typography sx={{ mt: 1, fontSize: 12, color: "text.secondary" }}>
          Select a type to view reports. All Shifts displays — when a report
          shift is unknown.
        </Typography>
      )}
    </Paper>
  );
}
