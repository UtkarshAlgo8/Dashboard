import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
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
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import useAnomaly from "@/hooks/useAnomaly.js";
import { fmt } from "@/lib/anomaly/model.js";

export function AnomalyPanel({ title, action, children, flush = false, sx }) {
  return (
    <Paper
      variant="outlined"
      sx={{ mb: 2, minWidth: 0, overflow: "hidden", ...sx }}
    >
      {title && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          sx={{
            px: 1.5,
            py: 1,
            bgcolor: (t) => t.custom.anomaly.raised,
            borderBottom: 1,
            borderColor: "divider",
            flexWrap: "wrap",
          }}
        >
          <Typography component="h3" sx={{ fontSize: 12, fontWeight: 600 }}>
            {title}
          </Typography>
          {action}
        </Stack>
      )}
      <Box sx={{ p: flush ? 0 : 1.5 }}>{children}</Box>
    </Paper>
  );
}
export function HealthBadge({ band = "Unknown" }) {
  const p = useTheme().custom.anomaly;
  const Icon =
    band === "Normal"
      ? CircleOutlinedIcon
      : band === "Unknown"
        ? HelpOutlineIcon
        : band === "Critical"
          ? ErrorOutlineIcon
          : WarningAmberOutlinedIcon;
  return (
    <Chip
      icon={
        <Icon
          sx={{ fontSize: "14px !important", color: "inherit !important" }}
        />
      }
      label={band === "Unknown" ? "Unknown · no reading" : band}
      size="small"
      variant="outlined"
      sx={{
        color: p[band],
        bgcolor: p[`${band}Wash`],
        borderColor: p[band],
        borderStyle: band === "Unknown" ? "dashed" : "solid",
        fontWeight: 600,
      }}
    />
  );
}
export function SensorStatus({ status, action }) {
  const p = useTheme().custom.anomaly;
  const color =
    status === "BAD" || action === "EXCLUDE"
      ? p.Critical
      : status === "SUSPECT" || action === "DOWNWEIGHT"
        ? p.Advisory
        : status === "NO DATA"
          ? p.Unknown
          : p.Normal;
  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
    >
      <Chip
        size="small"
        variant="outlined"
        label={status}
        sx={{
          color,
          borderColor: color,
          fontFamily: "'Geist Mono', monospace",
        }}
      />
      {action && (
        <Typography
          variant="caption"
          sx={{ color, fontFamily: "'Geist Mono', monospace" }}
        >
          {action}
        </Typography>
      )}
    </Stack>
  );
}
export function ModeChip({ id, root = false, episode }) {
  const { model, nav } = useAnomaly();
  if (!model.modes[id])
    return (
      <Typography component="span" variant="caption">
        {id || "—"}
      </Typography>
    );
  return (
    <Chip
      component="button"
      type="button"
      clickable
      size="small"
      variant="outlined"
      title={model.modes[id].name}
      label={id}
      onClick={(event) => {
        event.stopPropagation();
        nav.openMode(id, episode);
      }}
      sx={{
        fontFamily: "'Geist Mono', monospace",
        bgcolor: root ? (t) => t.custom.anomaly.accentWash : undefined,
        borderColor: root ? "primary.main" : "divider",
        color: root ? "primary.main" : "text.primary",
      }}
    />
  );
}
export function TagLink({ tag, short = true }) {
  const { nav } = useAnomaly();
  return (
    <Button
      size="small"
      title={tag}
      onClick={(event) => {
        event.stopPropagation();
        nav.openTag(tag);
      }}
      sx={{
        p: 0,
        minWidth: 0,
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        textAlign: "left",
        justifyContent: "flex-start",
        overflowWrap: "anywhere",
      }}
    >
      {short && tag.length > 38 ? `${tag.slice(0, 37)}…` : tag}
    </Button>
  );
}
export function CoverageMeter({ value, label = "Trust-weighted coverage" }) {
  return (
    <Box sx={{ my: 1 }}>
      <Stack direction="row" justifyContent="space-between" gap={1}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" fontFamily="'Geist Mono', monospace">
          {fmt(value == null ? null : value * 100)}%
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={(value ?? 0) * 100}
        sx={{ height: 6, mt: 0.5, bgcolor: (t) => t.custom.anomaly.track }}
      />
    </Box>
  );
}
export function EvidenceCallout({ children, critical = false }) {
  return (
    <Box
      sx={{
        p: 1.25,
        my: 1,
        border: "1px solid",
        borderColor: critical ? "error.main" : "primary.main",
        bgcolor: (t) =>
          critical
            ? t.custom.anomaly.CriticalWash
            : t.custom.anomaly.accentWash,
        borderRadius: 0.5,
        fontSize: 12,
      }}
    >
      {children}
    </Box>
  );
}
export function AnomalyTable({
  columns,
  rows,
  rowKey = (row, index) => row.id ?? row.k ?? index,
  onRowClick,
  maxHeight = 560,
  empty = "No records in the selected range.",
}) {
  return (
    <TableContainer sx={{ maxHeight, overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.id}>{column.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length ? (
            rows.map((row, index) => (
              <TableRow
                key={rowKey(row, index)}
                hover={Boolean(onRowClick)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (
                          event.target === event.currentTarget &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                sx={{
                  cursor: onRowClick ? "pointer" : undefined,
                  "&:focus-visible": {
                    outline: "2px solid",
                    outlineColor: "primary.main",
                    outlineOffset: -2,
                  },
                }}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    sx={{
                      fontFamily: column.mono
                        ? "'Geist Mono', monospace"
                        : undefined,
                      minWidth: column.minWidth,
                    }}
                  >
                    {column.render
                      ? column.render(row)
                      : String(row[column.id] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length}>{empty}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
export function RuleChips({ hits = {} }) {
  return (
    <Stack direction="row" gap={0.5} flexWrap="wrap">
      {Object.entries(hits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([rule, count]) => (
          <Chip
            size="small"
            variant="outlined"
            key={rule}
            label={`${rule} ×${count}`}
          />
        ))}
    </Stack>
  );
}
