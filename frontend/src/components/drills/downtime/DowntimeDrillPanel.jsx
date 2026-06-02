import { useMemo } from "react";
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
} from "@mui/material";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";

/**
 * Downtime drill — leaf table per dashboard_kpi_map_reference §11:
 *
 *   Downtime_category | Code · Machine · Reason · Frequency
 *                     · Total Min · Hrs/Day
 *
 * Source: gold_dummy `Downtime_category` rows already in hand via
 * `rawRows`. The remarks column stores both Code and Reason as
 * "BD-ELEC: Motor overload trip" — split on the first ":" to fill
 * the two columns. unit_of_measurement is hrs; Total DT (Min) is
 * Total Hrs × 60.
 */
const SECTION_NAME = {
  mix: "Mixing",
  tbm: "TBM",
  cur: "Curing",
  stk: "Stock",
};

function DowntimeDrillPanel({ section, rawRows, isLoading = false }) {
  const sectionName = SECTION_NAME[section] ?? section;

  const grouped = useMemo(() => {
    if (!Array.isArray(rawRows)) return [];
    const rows = rawRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === "Downtime_category" &&
        r.granularity === "Daily",
    );
    const groups = new Map();
    for (const r of rows) {
      const { code, reason } = parseRemarks(r.remarks);
      const machine =
        r.machine && r.machine !== "nan" ? r.machine : "—";
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
  }, [rawRows, sectionName]);

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

      <TableContainer
        sx={{
          maxHeight: 440,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
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
              <Th align="center">Code Category</Th>
              <Th align="center">Equipment</Th>
              <Th align="center">Delay Reason</Th>
              <Th>Events</Th>
              <Th>Total DT (Min)</Th>
              <Th>Total DT (Hr)</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {grouped.map((r, i) => (
              <TableRow key={i} hover>
                <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                  {r.code}
                </TableCell>
                <TableCell sx={{ fontSize: 13 }}>{r.machine}</TableCell>
                <TableCell sx={{ fontSize: 13 }}>{r.reason}</TableCell>
                <TableCell align="center" sx={{ fontSize: 13 }}>
                  {r.events}
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontSize: 13, fontWeight: 600 }}
                >
                  {Math.round(r.totalMin)}
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontSize: 13, fontWeight: 600 }}
                >
                  {r.totalHrs.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
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

export default DowntimeDrillPanel;
