import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import JKLoader from "@/components/JKLoader.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import {
  CALIBRATION_STATUSES,
  CALIBRATION_SCOPE_HELP,
  calibrationDate,
  calibrationRows,
} from "@/lib/calibration.js";

const statusColors = Object.fromEntries(
  Object.values(CALIBRATION_STATUSES).map(({ label, color }) => [label, color]),
);
const renderCell = (cell, column) =>
  column === 5 ? (
    <Chip label={cell} color={statusColors[cell]} size="small" />
  ) : (
    cell
  );

/** BTP's current machine list, ordered by due date with overdue machines first. */
export default function CalibrationDrillPanel({ query, onClose }) {
  const [status, setStatus] = useState("all");
  const rows = calibrationRows(query.error ? null : query.data, status);
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label="Calibration Due machines"
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
          Calibration Due
        </Typography>
        <Button size="small" onClick={onClose}>
          Close
        </Button>
      </Stack>
      <Typography sx={{ mb: 1, fontSize: 12, color: "text.secondary" }}>
        BTP ·{" "}
        {query.data
          ? `As of ${calibrationDate(query.data.context.asOfDate)}`
          : "Today"}{" "}
        · IST
      </Typography>
      <Typography sx={{ mb: 2, fontSize: 12, color: "text.secondary" }}>
        {CALIBRATION_SCOPE_HELP}
      </Typography>
      {query.error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={query.refetch}>
              Retry
            </Button>
          }
        >
          Calibration Due unavailable: {query.error.message}
        </Alert>
      ) : query.isLoading && !query.data ? (
        <JKLoader message="Loading calibration machines" />
      ) : !query.data?.machines.length ? (
        <Alert severity="info">
          No calibration machines published for BTP.
        </Alert>
      ) : (
        <Stack spacing={2}>
          <TextField
            select
            size="small"
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            sx={{ width: 200 }}
          >
            <MenuItem value="all">All statuses</MenuItem>
            {Object.entries(CALIBRATION_STATUSES).map(([value, { label }]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          {rows.length ? (
            <DTable
              cols={[
                "Machine No",
                "Machine Name",
                "Instruments",
                "Due Date",
                "Days Left",
                "Status",
              ]}
              rows={rows}
              sortable={false}
              statusColors={false}
              preserveText
              renderCell={renderCell}
              rowKey={(row) => row[0]}
            />
          ) : (
            <Alert severity="info">No machines match this status.</Alert>
          )}
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {rows.length} of {query.data.machines.length} machines · Earliest
            due date first. Due this week includes today through 7 days from
            today.
          </Typography>
        </Stack>
      )}
    </Paper>
  );
}
