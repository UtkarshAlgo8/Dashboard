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
import { LoadingSkeleton, useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getProductionDrill } from "@/api/drills.js";

/**
 * Compound-wise Production drill per BRD §6.10 (FR-P43–FR-P49).
 *
 * Phase 1 only renders for Banmore + Mixing; the Production KPI
 * only exists for Mixing per the BRD. Other sections would route
 * to a different drill (out of scope here).
 */
function ProductionDrillPanel({ plantId, section, compound }) {
  const toast = useToast();
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = usePolledQuery(
    () => getProductionDrill({ plantId, section, compound }),
    {
      interval: 60_000,
      deps: [plantId, section, compound],
    },
  );

  if (error) {
    toast.error("Could not load Production drill.");
  }

  const rows = Array.isArray(data) ? data : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.machine.toLowerCase().includes(q));
  }, [rows, search]);

  const compoundLabel =
    compound === "master" ? "Master Compound" : "Final Compound";

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          {compoundLabel} — Compound-wise Production
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <MachineSearch value={search} onChange={setSearch} />
          <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
            {filtered.length} of {rows.length} compounds
          </Typography>
        </Stack>
      </Stack>

      {isLoading && rows.length === 0 ? (
        <LoadingSkeleton variant="tableRow" count={6} />
      ) : rows.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No compounds configured for this period.
          </Typography>
        </Box>
      ) : (
        <DrillTable rows={filtered} />
      )}
    </Stack>
  );
}

function DrillTable({ rows }) {
  const theme = useTheme();
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
            <Th align="left">Machine</Th>
            <Th align="left">Item Code</Th>
            <Th>Planned (MT)</Th>
            <Th>Actual (MT)</Th>
            <Th>Batches Plan</Th>
            <Th>Batches Actual</Th>
            <Th>Variance</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => {
            const variance = ((r.actual - r.planned) / r.planned) * 100;
            const color = varianceColor(theme, variance);
            return (
              <TableRow key={`${r.itemCode}-${i}`} hover>
                <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                  {r.machine}
                </TableCell>
                <TableCell sx={{ fontSize: 13, fontFamily: "monospace" }}>
                  {r.itemCode}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 13 }}>
                  {r.planned.toFixed(1)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 13 }}>
                  {r.actual.toFixed(1)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 13 }}>
                  {r.batchesPlan}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 13 }}>
                  {r.batchesActual}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontSize: 13, fontWeight: 600, color }}
                >
                  {variance >= 0 ? "+" : ""}
                  {variance.toFixed(1)}%
                </TableCell>
              </TableRow>
            );
          })}
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
      }}
    >
      {children}
    </TableCell>
  );
}

/**
 * Variance threshold colour per BRD FR-P46:
 *   green ≥ 0%, amber 0% to −5%, red < −5%.
 */
function varianceColor(theme, variance) {
  if (variance >= 0) return theme.custom.brand.green;
  if (variance >= -5) return theme.custom.brand.amber;
  return theme.custom.brand.red;
}

export default ProductionDrillPanel;
