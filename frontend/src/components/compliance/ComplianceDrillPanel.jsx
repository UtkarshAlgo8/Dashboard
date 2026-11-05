import { useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { getCompliance } from "@/api/compliance.js";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import JKLoader from "@/components/JKLoader.jsx";
import {
  COMPLIANCE_COUNT_COLUMNS,
  COMPLIANCE_DEFINITIONS,
  COMPLIANCE_PERIOD_HELP,
} from "@/lib/compliance.js";

const display = (value) =>
  value == null
    ? "—"
    : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 6 });

/** BTP-only published Gold section → machine drill, shared by both dashboards. */
export default function ComplianceDrillPanel({ id, period, onClose }) {
  const [section, setSection] = useState(null);
  const level = section ? "machine" : "section";
  const query = usePolledQuery(
    () => getCompliance({ ids: [id], ...period, level, section }),
    {
      enabled: Boolean(period),
      interval: 0,
      deps: [id, period?.date, period?.granularity, level, section],
    },
  );
  const context = query.data?.context;
  const matches =
    period &&
    context?.date === period.date &&
    context?.granularity === period.granularity &&
    context?.level === level &&
    (context?.section ?? null) === section;
  const rows = matches ? (query.data.kpis[id]?.rows ?? []) : [];
  const counts = id === "daily" ? COMPLIANCE_COUNT_COLUMNS : [];
  const definition = COMPLIANCE_DEFINITIONS[id];
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label={`${definition.name} drill`}
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
          {definition.name}
        </Typography>
        {onClose && (
          <Button size="small" onClick={onClose}>
            Close
          </Button>
        )}
      </Stack>
      <Breadcrumbs sx={{ mb: 1, fontSize: 13 }}>
        <Button size="small" onClick={() => setSection(null)}>
          BTP · Sections
        </Button>
        {section && (
          <Typography sx={{ fontSize: 13 }}>{section} · Machines</Typography>
        )}
      </Breadcrumbs>
      <Typography sx={{ mb: 1, fontSize: 12, color: "text.secondary" }}>
        {definition.description}
      </Typography>
      {!period ? (
        <Alert severity="info">{COMPLIANCE_PERIOD_HELP}</Alert>
      ) : (
        <>
          <Typography sx={{ mb: 1, fontSize: 12, color: "text.secondary" }}>
            {period.granularity} · {period.date} · Published values at this
            level; not calculated from children.
          </Typography>
          {query.error ? (
            <Alert severity="error">
              Compliance unavailable: {query.error.message}
            </Alert>
          ) : query.isLoading || (!matches && !query.error) ? (
            <JKLoader message="Loading compliance" />
          ) : rows.length ? (
            <DTable
              searchable
              cols={[
                section ? "Machine" : "Section",
                id === "critical" ? "Severe violation %" : "Compliance %",
                ...counts.map(([, label]) => label),
              ]}
              rows={rows.map((row) => [
                section ? row.machine : row.section,
                display(row.value),
                ...counts.map(([key]) => display(row.counts[key])),
              ])}
              onRowClick={section ? undefined : (row) => setSection(row[0])}
            />
          ) : (
            <Box sx={{ py: 2, color: "text.secondary" }}>
              No published {section ? "machine" : "section"} rows for this
              period.
            </Box>
          )}
          {!section && rows.length > 0 && (
            <Typography sx={{ mt: 1, fontSize: 12, color: "text.secondary" }}>
              Click a section to view machines. Machine rows are the final drill
              level.
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
}
