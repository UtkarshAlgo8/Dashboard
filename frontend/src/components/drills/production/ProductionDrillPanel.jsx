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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import MachineSearch from "@/components/drills/oee/MachineSearch.jsx";
import { LoadingSkeleton, useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getProductionDrill } from "@/api/drills.js";

/**
 * Production drill — section-aware. Per docs/artifact.jsx:
 *
 *   Mixing  → Master / Final compound toggle → compound-wise table
 *             (Machine, Item Code, Planned MT, Actual MT, Batches, Variance)
 *   TBM     → Passenger Radial / LT Radial / SCV Radial toggle → SKU table
 *             (SKU, Planned, Actual, Variance)
 *   Curing  → Same as TBM
 *   Stock   → Categories depend on stockSelector (4 Roll, Extruder, …) →
 *             SKU table
 */

const SECTION_CONFIG = {
  mix: {
    title: "Production Drill-down",
    options: [
      { value: "master", label: "Master Compound" },
      { value: "final", label: "Final Compound" },
    ],
    default: "final",
    tableType: "compound",
    showMachineSearch: true,
  },
  tbm: {
    title: "Production Drill-down",
    options: [
      { value: "passenger-radial", label: "Passenger Radial" },
      { value: "lt-radial", label: "LT Radial" },
      { value: "scv-radial", label: "SCV Radial" },
    ],
    default: "passenger-radial",
    tableType: "sku",
  },
  cur: {
    title: "Production Drill-down",
    options: [
      { value: "passenger-radial", label: "Passenger Radial" },
      { value: "lt-radial", label: "LT Radial" },
      { value: "scv-radial", label: "SCV Radial" },
    ],
    default: "passenger-radial",
    tableType: "sku",
  },
  // Stock options/default get derived from the response bucket since
  // the category list changes with the stockSelector sub-selector.
  stk: { title: "Production Drill-down", tableType: "sku" },
};

const STOCK_OPTION_LABELS = {
  "4-roll-production": "4 Roll Production",
  "sidewall-production": "Sidewall Production",
  "tread-production": "Tread Production",
  "inner-liner-production": "Inner Liner Production",
  "ply-production": "Ply Production",
  "belt-production": "Belt Production",
  "cap-strip-production": "Cap Strip Production",
  "chaffer-production": "Chaffer Production",
};

function ProductionDrillPanel({ plantId, section, stockSelector }) {
  const toast = useToast();
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = usePolledQuery(
    () => getProductionDrill({ plantId, section, stockSelector }),
    {
      interval: 60_000,
      deps: [plantId, section, stockSelector],
    },
  );

  if (error) toast.error("Could not load Production drill.");

  const config = SECTION_CONFIG[section] ?? { title: "Production Drill-down" };
  const bucket = useMemo(
    () => (data && typeof data === "object" ? data : {}),
    [data],
  );

  // Build the option list. Static for mix/tbm/cur; derived from the
  // bucket keys for stk (one category per key).
  const options = useMemo(() => {
    if (section === "stk") {
      return Object.keys(bucket).map((key) => ({
        value: key,
        label: STOCK_OPTION_LABELS[key] ?? key,
      }));
    }
    return config.options ?? [];
  }, [section, bucket, config.options]);

  // User's explicit pick within this session; null means "follow default".
  const [picked, setPicked] = useState(null);

  // Derive the effective selection: explicit pick if still valid, else
  // configured default, else first available option.
  const selected = useMemo(() => {
    if (options.length === 0) return null;
    if (picked && options.some((o) => o.value === picked)) return picked;
    return config.default ?? options[0].value;
  }, [options, picked, config.default]);

  const rows = useMemo(
    () => (selected ? (bucket[selected] ?? []) : []),
    [bucket, selected],
  );

  const filtered = useMemo(() => {
    if (config.tableType !== "compound") return rows;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.machine?.toLowerCase().includes(q));
  }, [rows, search, config.tableType]);

  const selectedLabel =
    options.find((o) => o.value === selected)?.label ?? config.title;

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
          {config.title}
        </Typography>
        {config.showMachineSearch && rows.length > 0 && (
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <MachineSearch value={search} onChange={setSearch} />
            <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
              {filtered.length} of {rows.length} compounds
            </Typography>
          </Stack>
        )}
      </Stack>

      {options.length > 0 && (
        <ToggleButtonGroup
          size="small"
          value={selected}
          exclusive
          onChange={(_, next) => {
            if (next) setPicked(next);
          }}
          sx={{
            flexWrap: "wrap",
            "& .MuiToggleButton-root": {
              px: 2,
              py: 0.5,
              fontSize: 12,
              textTransform: "none",
              fontWeight: 600,
            },
          }}
        >
          {options.map((opt) => (
            <ToggleButton key={opt.value} value={opt.value}>
              {opt.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {isLoading && rows.length === 0 ? (
        <LoadingSkeleton variant="tableRow" count={6} />
      ) : !selected ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No production categories configured for this view.
          </Typography>
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No production entries for this period.
          </Typography>
        </Box>
      ) : config.tableType === "compound" ? (
        <CompoundTable rows={filtered} title={selectedLabel} />
      ) : (
        <SkuTable rows={rows} title={selectedLabel} />
      )}
    </Stack>
  );
}

function CompoundTable({ rows, title }) {
  const theme = useTheme();
  return (
    <Stack spacing={1}>
      <Typography
        sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}
      >
        {title} — Compound-wise Production
      </Typography>
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
    </Stack>
  );
}

function SkuTable({ rows, title }) {
  const theme = useTheme();
  return (
    <Stack spacing={1}>
      <Typography
        sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}
      >
        {title} — SKU-wise Production
      </Typography>
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
              <Th align="left">SKU</Th>
              <Th>Planned</Th>
              <Th>Actual</Th>
              <Th>Variance</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => {
              const variance = ((r.actual - r.planned) / r.planned) * 100;
              const color = varianceColor(theme, variance);
              return (
                <TableRow key={`${r.sku}-${i}`} hover>
                  <TableCell sx={{ fontSize: 13, fontWeight: 500 }}>
                    {r.sku}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: 13 }}>
                    {r.planned.toLocaleString()}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: 13 }}>
                    {r.actual.toLocaleString()}
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
    </Stack>
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

function varianceColor(theme, variance) {
  if (variance >= 0) return theme.custom.brand.green;
  if (variance >= -5) return theme.custom.brand.amber;
  return theme.custom.brand.red;
}

export default ProductionDrillPanel;
