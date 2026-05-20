import { useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import { LoadingSkeleton, useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getPlanComplianceDrill } from "@/api/drills.js";

/**
 * Plan Compliance drill per BRD §6.12 (FR-P61). Two-view toggle
 * (SKU-wise / Machine-wise) above a Planned/Actual/Compliance%
 * table. Compliance threshold: green ≥ 95%, amber ≥ 90%, red < 90%.
 */
function PlanComplianceDrillPanel({ plantId, section }) {
  const toast = useToast();
  const [view, setView] = useState("sku");

  const { data, isLoading, error } = usePolledQuery(
    () => getPlanComplianceDrill({ plantId, section }),
    { interval: 60_000, deps: [plantId, section] },
  );

  if (error) toast.error("Could not load Plan Compliance drill.");

  const rows =
    view === "sku" ? (data?.skuWise ?? []) : (data?.machineWise ?? []);

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          Plan Compliance
        </Typography>
        <ToggleButtonGroup
          size="small"
          value={view}
          exclusive
          onChange={(_, v) => {
            if (v) setView(v);
          }}
          sx={{
            "& .MuiToggleButton-root": {
              px: 1.5,
              py: 0.25,
              fontSize: 12,
              textTransform: "none",
              fontWeight: 600,
            },
          }}
        >
          <ToggleButton value="sku">SKU-wise</ToggleButton>
          <ToggleButton value="machine">Machine-wise</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {isLoading && rows.length === 0 ? (
        <LoadingSkeleton variant="tableRow" count={6} />
      ) : rows.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No plan compliance entries for this period.
          </Typography>
        </Box>
      ) : (
        <ComplianceTable rows={rows} view={view} />
      )}
    </Stack>
  );
}

function ComplianceTable({ rows, view }) {
  const theme = useTheme();
  const labelHeader = view === "sku" ? "Item Code" : "Machine";

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
            <Th align="left">{labelHeader}</Th>
            <Th>Planned</Th>
            <Th>Actual</Th>
            <Th>Compliance %</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => {
            const pct = (r.actual / r.planned) * 100;
            const color = complianceColor(theme, pct);
            const label = view === "sku" ? r.itemCode : r.machine;
            return (
              <TableRow key={i} hover>
                <TableCell
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: view === "sku" ? "monospace" : "inherit",
                  }}
                >
                  {label}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 13 }}>
                  {r.planned.toFixed(1)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 13 }}>
                  {r.actual.toFixed(1)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontSize: 13, fontWeight: 600, color }}
                >
                  {pct.toFixed(1)}%
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
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </TableCell>
  );
}

function complianceColor(theme, pct) {
  if (pct >= 95) return theme.custom.brand.green;
  if (pct >= 90) return theme.custom.brand.amber;
  return theme.custom.brand.red;
}

export default PlanComplianceDrillPanel;
