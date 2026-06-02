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
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";

/**
 * Production drill — derives from raw gold_dummy rows already in hand
 * via `rawRows`. No second API call.
 *
 * Per dashboard_kpi_map_reference §3 and §11:
 *   Production drills into Production_m / Production_sku /
 *   Production_m_sku — same row data, three lenses. The active
 *   product-type pill (Master/Final Compound for Mixing, Passenger/LT
 *   /SCV Radial for TBM+Curing) maps to the `product_type` column on
 *   the _sku and _m_sku rows. The aggregated value per row is SUM of
 *   actual_value; Planned is SUM of threshold_value; achievement is
 *   Actual ÷ Planned.
 *
 * View By toggle (Machine | SKU | Machine + SKU) picks which kpi_name
 * to read and which key to group by.
 */

// Mixing "Batches" conversion — artifact's implicit ~1.85 MT/batch.
const MT_PER_BATCH = 1.85;
// Stock "Units → Kg" — 3.87 kg per unit per artifact.
const STOCK_KG_PER_UNIT = 3.87;

const SECTION_TITLE = {
  mix: "Mixing",
  tbm: "Tyre Building",
  cur: "Curing",
  stk: "Stock",
};

const SECTION_NAME = {
  mix: "Mixing",
  tbm: "TBM",
  cur: "Curing",
  stk: "Stock",
};

// Default unit per section (matches what the parent KPI card shows).
const UNIT_OPTIONS = {
  mix: [
    { value: "MT", label: "MT" },
    { value: "Batches", label: "Batches" },
  ],
  tbm: null, // single unit "nos"
  cur: null,
  stk: [
    { value: "Units", label: "Units" },
    { value: "Kg", label: "Kg" },
  ],
};

const VIEW_BY_OPTIONS = [
  { value: "machine", label: "Machine" },
  { value: "sku", label: "SKU" },
  { value: "both", label: "Machine + SKU" },
];

function ProductionDrillPanel({ section, prodSub, rawRows, isLoading = false }) {
  const [search, setSearch] = useState("");
  const [viewBy, setViewBy] = useState("machine");

  const unitOptions = UNIT_OPTIONS[section];
  const defaultUnit = unitOptions
    ? unitOptions[0].value
    : section === "tbm" || section === "cur"
      ? "nos"
      : "MT";
  const [unit, setUnit] = useState(defaultUnit);

  const sectionName = SECTION_NAME[section] ?? section;
  const sectionTitle = SECTION_TITLE[section] ?? section;

  // Pick which kpi_name backs the table based on viewBy.
  const kpiName =
    viewBy === "machine"
      ? "Production_m"
      : viewBy === "sku"
        ? "Production_sku"
        : "Production_m_sku";

  // Subset rows: this section + this kpi_name + the active product-type
  // pill. Daily granularity only. For the "machine" lens we read
  // Production_m which doesn't carry the sub product_type — fall back
  // to Production_m_sku and re-aggregate so the pill still scopes the
  // numbers.
  const scopedRows = useMemo(() => {
    if (!Array.isArray(rawRows)) return [];

    // Empty-string prodSub (sections without product-type pills, e.g.
    // Stock) means "no product-type filter" — same as null.
    const ptFilter = prodSub ? prodSub : null;

    if (viewBy === "machine" && ptFilter) {
      // Aggregate from Production_m_sku so we can filter by prodSub.
      return rawRows.filter(
        (r) =>
          r.section === sectionName &&
          r.kpi_name === "Production_m_sku" &&
          r.granularity === "Daily" &&
          r.product_type === ptFilter,
      );
    }

    return rawRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === kpiName &&
        r.granularity === "Daily" &&
        (ptFilter == null || r.product_type === ptFilter),
    );
  }, [rawRows, sectionName, kpiName, prodSub, viewBy]);

  // Aggregate per the active lens.
  const aggregated = useMemo(() => {
    const groups = new Map();
    const keyOf = (r) => {
      if (viewBy === "machine") return r.machine ?? "—";
      if (viewBy === "sku") return r.itemcode ?? "—";
      return `${r.machine ?? "—"}||${r.itemcode ?? "—"}`;
    };
    for (const r of scopedRows) {
      const k = keyOf(r);
      if (!groups.has(k)) {
        groups.set(k, {
          machine: r.machine !== "nan" ? r.machine : "—",
          itemcode: r.itemcode !== "nan" ? r.itemcode : "—",
          planned: 0,
          actual: 0,
          itemSet: new Set(),
          machineSet: new Set(),
        });
      }
      const acc = groups.get(k);
      if (typeof r.threshold_value === "number") acc.planned += r.threshold_value;
      if (typeof r.actual_value === "number") acc.actual += r.actual_value;
      if (r.itemcode && r.itemcode !== "nan") acc.itemSet.add(r.itemcode);
      if (r.machine && r.machine !== "nan") acc.machineSet.add(r.machine);
    }
    return [...groups.values()].map((g) => ({
      ...g,
      itemCount: g.itemSet.size,
      machineCount: g.machineSet.size,
    }));
  }, [scopedRows, viewBy]);

  // Filter by machine search where applicable.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aggregated;
    return aggregated.filter((r) =>
      viewBy === "sku"
        ? false // search is machine-scoped; sku view ignores it
        : (r.machine ?? "").toLowerCase().includes(q),
    );
  }, [aggregated, search, viewBy]);

  // Convert value based on selected unit.
  const convert = (val) => {
    if (section === "mix" && unit === "Batches") return val / MT_PER_BATCH;
    if (section === "stk" && unit === "Kg") return val * STOCK_KG_PER_UNIT;
    return val;
  };

  const fmt = (v) => {
    if (v == null) return "—";
    if (unit === "Batches" || unit === "Kg")
      return Math.round(convert(v)).toLocaleString();
    if (v < 1000) return convert(v).toFixed(1);
    return Math.round(convert(v)).toLocaleString();
  };

  const title = prodSub
    ? `${sectionTitle} — ${prodSub} Production`
    : `${sectionTitle} Production`;

  if (filtered.length === 0) {
    if (isLoading) {
      return <DrillSkeleton title rows={5} cols={5} />;
    }
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No Production data for {sectionName}
          {prodSub ? ` · ${prodSub}` : ""} in this date range.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: "primary.main",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Typography>

      <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
        <ToggleGroup
          label="View by"
          value={viewBy}
          onChange={setViewBy}
          options={VIEW_BY_OPTIONS}
        />
        {unitOptions && (
          <ToggleGroup
            label="Unit"
            value={unit}
            onChange={setUnit}
            options={unitOptions}
          />
        )}
      </Stack>

      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
        <MachineSearch value={search} onChange={setSearch} />
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
          {filtered.length} of {aggregated.length} rows
          {prodSub ? ` in ${prodSub}` : ""}
        </Typography>
      </Stack>

      <ResultTable
        rows={filtered}
        viewBy={viewBy}
        unit={unit}
        fmt={fmt}
      />
    </Stack>
  );
}

function ToggleGroup({ label, value, onChange, options }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Typography>
      <ToggleButtonGroup
        size="small"
        value={value}
        exclusive
        onChange={(_, next) => {
          if (next) onChange(next);
        }}
        sx={{
          "& .MuiToggleButton-root": {
            px: 1.5,
            py: 0.25,
            fontSize: 12,
            textTransform: "none",
            fontWeight: 500,
          },
        }}
      >
        {options.map((opt) => (
          <ToggleButton key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}

function ResultTable({ rows, viewBy, unit, fmt }) {
  const theme = useTheme();

  return (
    <TableContainer
      sx={{
        maxHeight: 380,
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
            {viewBy === "machine" && (
              <>
                <Th align="center">Machine</Th>
                <Th>Compounds</Th>
              </>
            )}
            {viewBy === "sku" && (
              <>
                <Th align="center">Item Code</Th>
                <Th>Machines</Th>
              </>
            )}
            {viewBy === "both" && (
              <>
                <Th align="center">Machine</Th>
                <Th align="center">Item Code</Th>
              </>
            )}
            <Th>{`Planned (${unit})`}</Th>
            <Th>{`Actual (${unit})`}</Th>
            <Th>Achievement</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => {
            const planned = r.planned;
            const actual = r.actual;
            const achievement =
              planned > 0 ? (actual / planned) * 100 : null;
            const achColor =
              achievement == null
                ? theme.palette.text.disabled
                : achievement >= 100
                  ? theme.custom.brand.green
                  : achievement >= 95
                    ? theme.custom.brand.amber
                    : theme.custom.brand.red;
            return (
              <TableRow key={i} hover>
                {viewBy === "machine" && (
                  <>
                    <TableCell
                      sx={{ fontSize: 13, fontWeight: 600 }}
                    >
                      {r.machine}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: 13 }}>
                      {r.itemCount}
                    </TableCell>
                  </>
                )}
                {viewBy === "sku" && (
                  <>
                    <TableCell sx={{ fontSize: 13, fontFamily: "monospace" }}>
                      {r.itemcode}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: 13 }}>
                      {r.machineCount}
                    </TableCell>
                  </>
                )}
                {viewBy === "both" && (
                  <>
                    <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                      {r.machine}
                    </TableCell>
                    <TableCell sx={{ fontSize: 13, fontFamily: "monospace" }}>
                      {r.itemcode}
                    </TableCell>
                  </>
                )}
                <TableCell align="center" sx={{ fontSize: 13 }}>
                  {fmt(planned)}
                </TableCell>
                <TableCell align="center" sx={{ fontSize: 13, fontWeight: 600 }}>
                  {fmt(actual)}
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontSize: 13, fontWeight: 700, color: achColor }}
                >
                  {achievement == null ? "—" : `${achievement.toFixed(1)}%`}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
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

export default ProductionDrillPanel;
