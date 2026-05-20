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
import { LoadingSkeleton, useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getPlanComplianceDrill } from "@/api/drills.js";

/**
 * Plan Compliance drill — SKU-wise and Machine-wise tables shown
 * side-by-side per docs/artifact.jsx:1235–1239. Compliance threshold:
 * green ≥ 95%, amber ≥ 90%, red < 90%.
 */
function PlanComplianceDrillPanel({ plantId, section }) {
  const toast = useToast();
  const theme = useTheme();

  const { data, isLoading, error } = usePolledQuery(
    () => getPlanComplianceDrill({ plantId, section }),
    { interval: 60_000, deps: [plantId, section] },
  );

  if (error) toast.error("Could not load Plan Compliance drill.");

  const skuRows = data?.skuWise ?? [];
  const machineRows = data?.machineWise ?? [];
  const hasAny = skuRows.length > 0 || machineRows.length > 0;

  if (isLoading && !hasAny) {
    return <LoadingSkeleton variant="tableRow" count={6} />;
  }

  if (!hasAny) {
    return (
      <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No plan compliance entries for this period.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      }}
    >
      <ComplianceCard
        title="SKU-wise Plan vs Actual"
        rows={skuRows}
        view="sku"
        accent={theme.custom.brand.blue}
      />
      <ComplianceCard
        title="Machine-wise Plan vs Actual"
        rows={machineRows}
        view="machine"
        accent={theme.custom.brand.purple}
      />
    </Box>
  );
}

function ComplianceCard({ title, rows, view, accent }) {
  return (
    <Stack
      spacing={1.25}
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 1.5,
        borderTop: 3,
        borderTopColor: accent ?? "divider",
      }}
    >
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{title}</Typography>
      {rows.length === 0 ? (
        <Box sx={{ py: 3, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 12 }}>No rows</Typography>
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
  const pctHeader = view === "sku" ? "Compliance %" : "Achievement";

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
            <Th>Plan</Th>
            <Th>Actual</Th>
            <Th>{pctHeader}</Th>
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
