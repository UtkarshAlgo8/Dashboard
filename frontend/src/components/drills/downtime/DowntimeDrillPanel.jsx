import { useMemo, useState } from "react";
import {
  Box,
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
import MachineSearch from "@/components/drills/oee/MachineSearch.jsx";
import { useToast } from "@/components/common";
import { TableSkeleton } from "@/components/drills/DrillSkeletons.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getDowntimeDrill } from "@/api/drills.js";

/**
 * Downtime drill panel per BRD §6.12 (FR-P60). Categorised reasons
 * with machine assignment, event count, duration, and production
 * loss in hours.
 */
function DowntimeDrillPanel({ plantId, section, from, to, shift }) {
  const toast = useToast();
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = usePolledQuery(
    () => getDowntimeDrill({ plantId, section, from, to, shift }),
    { interval: 60_000, deps: [plantId, section, from, to, shift] },
  );

  if (error) toast.error("Could not load Downtime drill.");

  const rows = Array.isArray(data) ? data : [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.machine.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          Downtime by reason
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <MachineSearch value={search} onChange={setSearch} />
          <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
            {filtered.length} of {rows.length}
          </Typography>
        </Stack>
      </Stack>

      {isLoading && rows.length === 0 ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No downtime events recorded for this period.
          </Typography>
        </Box>
      ) : (
        <DowntimeTable rows={filtered} />
      )}
    </Stack>
  );
}

function DowntimeTable({ rows }) {
  return (
    <TableContainer
      sx={{
        maxHeight: 340,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <Th align="left">Category</Th>
            <Th align="left">Machine</Th>
            <Th align="left">Reason</Th>
            <Th>Events</Th>
            <Th>Duration (min)</Th>
            <Th>Loss (hrs)</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i} hover>
              <TableCell>
                <CategoryPill category={r.reasonCategory} />
              </TableCell>
              <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                {r.machine}
              </TableCell>
              <TableCell sx={{ fontSize: 13 }}>{r.reason}</TableCell>
              <TableCell align="right" sx={{ fontSize: 13 }}>
                {r.events}
              </TableCell>
              <TableCell align="right" sx={{ fontSize: 13 }}>
                {r.durationMin}
              </TableCell>
              <TableCell align="right" sx={{ fontSize: 13, fontWeight: 600 }}>
                {r.lossHrs.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function Th({ children, align = "right" }) {
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

/**
 * Pill colour per category family:
 *   Breakdown — red
 *   Setup     — amber
 *   PM        — blue
 *   Process   — teal
 *   Utility   — purple
 *   Other     — muted
 */
function CategoryPill({ category }) {
  const theme = useTheme();
  const color = categoryColor(theme, category);
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
        whiteSpace: "nowrap",
      }}
    >
      {category}
    </Box>
  );
}

function categoryColor(theme, category) {
  if (category.startsWith("Breakdown")) return theme.custom.brand.red;
  if (category.startsWith("Setup")) return theme.custom.brand.amber;
  if (category === "PM") return theme.custom.brand.blue;
  if (category === "Process") return theme.custom.brand.teal;
  if (category === "Utility") return theme.custom.brand.purple;
  return theme.custom.text.muted;
}

export default DowntimeDrillPanel;
