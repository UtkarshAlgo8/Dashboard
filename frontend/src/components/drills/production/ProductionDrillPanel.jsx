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
import { useToast } from "@/components/common";
import { ProductionDrillSkeleton } from "@/components/drills/DrillSkeletons.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getProductionDrill } from "@/api/drills.js";

/**
 * Production drill — section-aware. Per docs/artifact.jsx + CR-05:
 *
 *   Mixing  → Master / Final compound toggle →
 *             View by (Machine / SKU / Machine + SKU) +
 *             Unit (MT / Batches)
 *   TBM     → Passenger Radial / LT Radial / SCV Radial toggle →
 *             View by (Machine / SKU / Machine + SKU)
 *   Curing  → Same as TBM
 *   Stock   → Categories depend on stockSelector (4 Roll, Extruder, …) →
 *             View by (Machine / SKU / Machine + SKU) + Unit (Units / Kg)
 *
 * "View by" aggregates the same row data client-side: Machine groups
 * by row.machine, SKU groups by row.sku/row.itemCode, Machine + SKU
 * shows the raw rows. Unit toggle converts displayed numbers in place
 * (Mixing: MT row → batches via batchesPlan/batchesActual; Stock:
 * Units → Kg via STOCK_KG_PER_UNIT).
 */

// Stock "Units → Kg" conversion factor. Mirrors the artifact's
// implicit ~3.87 kg / unit (4820 kg ÷ 1245 units in artifact.jsx).
const STOCK_KG_PER_UNIT = 3.87;

const SECTION_CONFIG = {
  mix: {
    title: "Production Drill-down",
    options: [
      { value: "master", label: "Master Compound" },
      { value: "final", label: "Final Compound" },
    ],
    default: "final",
    units: [
      { value: "mt", label: "MT" },
      { value: "batches", label: "Batches" },
    ],
    defaultUnit: "mt",
    skuKey: "itemCode",
    skuHeader: "Item Code",
    showMachineSearch: true,
    valueLabel: "MT",
  },
  tbm: {
    title: "Production Drill-down",
    options: [
      { value: "passenger-radial", label: "Passenger Radial" },
      { value: "lt-radial", label: "LT Radial" },
      { value: "scv-radial", label: "SCV Radial" },
    ],
    default: "passenger-radial",
    units: null,
    skuKey: "sku",
    skuHeader: "SKU",
    valueLabel: "nos",
  },
  cur: {
    title: "Production Drill-down",
    options: [
      { value: "passenger-radial", label: "Passenger Radial" },
      { value: "lt-radial", label: "LT Radial" },
      { value: "scv-radial", label: "SCV Radial" },
    ],
    default: "passenger-radial",
    units: null,
    skuKey: "sku",
    skuHeader: "SKU",
    valueLabel: "nos",
  },
  // Stock options/default get derived from the response bucket since
  // the category list changes with the stockSelector sub-selector.
  stk: {
    title: "Production Drill-down",
    units: [
      { value: "units", label: "Units" },
      { value: "kg", label: "Kg" },
    ],
    defaultUnit: "units",
    skuKey: "sku",
    skuHeader: "SKU",
    valueLabel: "units",
  },
};

const VIEW_BY_OPTIONS = [
  { value: "machine", label: "Machine" },
  { value: "sku", label: "SKU" },
  { value: "both", label: "Machine + SKU" },
];

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

function ProductionDrillPanel({
  plantId,
  section,
  stockSelector,
  from,
  to,
  shift,
}) {
  const toast = useToast();
  const config = SECTION_CONFIG[section] ?? { title: "Production Drill-down" };

  const [search, setSearch] = useState("");
  const [viewBy, setViewBy] = useState("machine");
  const [unit, setUnit] = useState(config.defaultUnit ?? null);
  // Explicit pick within this session; null means "follow default".
  const [picked, setPicked] = useState(null);

  // Reset state in-render when section/stockSelector changes (React 18+
  // canonical pattern for "reset state when a prop changes" — avoids
  // the cascading-renders lint that useEffect+setState triggers).
  const [prevKey, setPrevKey] = useState(`${section}/${stockSelector}`);
  const currentKey = `${section}/${stockSelector}`;
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setSearch("");
    setViewBy("machine");
    setUnit(config.defaultUnit ?? null);
    setPicked(null);
  }

  const { data, isLoading, error } = usePolledQuery(
    () =>
      getProductionDrill({ plantId, section, stockSelector, from, to, shift }),
    {
      interval: 60_000,
      deps: [plantId, section, stockSelector, from, to, shift],
    },
  );

  if (error) toast.error("Could not load Production drill.");

  const bucket = useMemo(
    () => (data && typeof data === "object" ? data : {}),
    [data],
  );

  // Build the category option list. Static for mix/tbm/cur; derived
  // from the bucket keys for stk (one category per key).
  const options = useMemo(() => {
    if (section === "stk") {
      return Object.keys(bucket).map((key) => ({
        value: key,
        label: STOCK_OPTION_LABELS[key] ?? key,
      }));
    }
    return config.options ?? [];
  }, [section, bucket, config.options]);

  const selected = useMemo(() => {
    if (options.length === 0) return null;
    if (picked && options.some((o) => o.value === picked)) return picked;
    return config.default ?? options[0].value;
  }, [options, picked, config.default]);

  const rows = useMemo(
    () => (selected ? (bucket[selected] ?? []) : []),
    [bucket, selected],
  );

  // Filter by machine search (when applicable). Search hits the
  // machine field directly; for SKU view we keep all rows because
  // search is machine-scoped.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.machine?.toLowerCase().includes(q));
  }, [rows, search]);

  // Build the displayed rows based on the active View-by.
  const displayRows = useMemo(
    () => aggregate(filteredRows, viewBy, config.skuKey),
    [filteredRows, viewBy, config.skuKey],
  );

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
        {rows.length > 0 && (
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <MachineSearch value={search} onChange={setSearch} />
            <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
              {filteredRows.length} of {rows.length} rows
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

      {/* View-by + Unit selectors. Unit hidden when section has no
          unit toggle (TBM, Curing). */}
      {rows.length > 0 && (
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
          <ViewByToggle value={viewBy} onChange={setViewBy} />
          {config.units && (
            <UnitToggle
              value={unit ?? config.defaultUnit}
              onChange={setUnit}
              options={config.units}
            />
          )}
        </Stack>
      )}

      {isLoading && rows.length === 0 ? (
        <ProductionDrillSkeleton
          tableType={section === "mix" ? "compound" : "sku"}
        />
      ) : !selected ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No production categories configured for this view.
          </Typography>
        </Box>
      ) : displayRows.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
          <Typography sx={{ fontSize: 13 }}>
            No production entries for this period.
          </Typography>
        </Box>
      ) : (
        <DrillTable
          rows={displayRows}
          viewBy={viewBy}
          unit={unit ?? config.defaultUnit}
          section={section}
          config={config}
          title={selectedLabel}
        />
      )}
    </Stack>
  );
}

/**
 * Aggregate raw rows by the selected lens. Each aggregated row has
 * a stable shape consumed by DrillTable:
 *
 *   { machine?, sku?, itemCode?, planned, actual,
 *     batchesPlan?, batchesActual?, count, machines?, skus? }
 */
function aggregate(rows, viewBy, skuKey) {
  if (viewBy === "both") {
    return rows.map((r) => ({ ...r, count: 1 }));
  }
  if (viewBy === "machine") {
    const map = new Map();
    rows.forEach((r) => {
      const key = r.machine ?? "—";
      if (!map.has(key)) {
        map.set(key, {
          machine: key,
          planned: 0,
          actual: 0,
          batchesPlan: 0,
          batchesActual: 0,
          count: 0,
          skus: new Set(),
        });
      }
      const acc = map.get(key);
      acc.planned += r.planned ?? 0;
      acc.actual += r.actual ?? 0;
      acc.batchesPlan += r.batchesPlan ?? 0;
      acc.batchesActual += r.batchesActual ?? 0;
      acc.count += 1;
      if (r[skuKey]) acc.skus.add(r[skuKey]);
    });
    return Array.from(map.values()).map((r) => ({
      ...r,
      skuCount: r.skus.size,
    }));
  }
  // viewBy === "sku"
  const map = new Map();
  rows.forEach((r) => {
    const key = r[skuKey] ?? "—";
    if (!map.has(key)) {
      map.set(key, {
        [skuKey]: key,
        planned: 0,
        actual: 0,
        batchesPlan: 0,
        batchesActual: 0,
        count: 0,
        machines: new Set(),
      });
    }
    const acc = map.get(key);
    acc.planned += r.planned ?? 0;
    acc.actual += r.actual ?? 0;
    acc.batchesPlan += r.batchesPlan ?? 0;
    acc.batchesActual += r.batchesActual ?? 0;
    acc.count += 1;
    if (r.machine) acc.machines.add(r.machine);
  });
  return Array.from(map.values()).map((r) => ({
    ...r,
    machineCount: r.machines.size,
  }));
}

function ViewByToggle({ value, onChange }) {
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
        View by
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
        {VIEW_BY_OPTIONS.map((opt) => (
          <ToggleButton key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}

function UnitToggle({ value, onChange, options }) {
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
        Unit
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

/**
 * Single table renderer driven by viewBy + unit. Column layout:
 *
 *   viewBy="machine"  → Machine | SKUs (count) | Planned | Actual | Variance
 *   viewBy="sku"      → SKU | Machines (count) | Planned | Actual | Variance
 *   viewBy="both"     → Machine | SKU | Planned | Actual | Variance
 *                        (+ Batches Plan / Actual for Mixing)
 */
function DrillTable({ rows, viewBy, unit, section, config, title }) {
  const theme = useTheme();
  const showBatches = section === "mix" && viewBy === "both" && unit === "mt";
  const unitLabel = unitLabelOf(section, unit, config);

  return (
    <Stack spacing={1}>
      <Typography
        sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}
      >
        {title} — {viewByLabel(viewBy)} ({unitLabel})
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
              {viewBy === "machine" && (
                <>
                  <Th align="left">Machine</Th>
                  <Th>SKUs</Th>
                </>
              )}
              {viewBy === "sku" && (
                <>
                  <Th align="left">{config.skuHeader}</Th>
                  <Th>Machines</Th>
                </>
              )}
              {viewBy === "both" && (
                <>
                  <Th align="left">Machine</Th>
                  <Th align="left">{config.skuHeader}</Th>
                </>
              )}
              <Th>{`Planned (${unitLabel})`}</Th>
              <Th>{`Actual (${unitLabel})`}</Th>
              {showBatches && <Th>Batches Plan</Th>}
              {showBatches && <Th>Batches Actual</Th>}
              <Th>Variance</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => {
              const planned = convertValue(r, "planned", section, unit);
              const actual = convertValue(r, "actual", section, unit);
              const variance =
                planned > 0 ? ((actual - planned) / planned) * 100 : 0;
              const color = varianceColor(theme, variance);
              return (
                <TableRow key={rowKey(r, viewBy, config.skuKey, i)} hover>
                  {viewBy === "machine" && (
                    <>
                      <TableCell sx={cellSx({ bold: true })}>
                        {r.machine}
                      </TableCell>
                      <TableCell align="right" sx={cellSx()}>
                        {r.skuCount}
                      </TableCell>
                    </>
                  )}
                  {viewBy === "sku" && (
                    <>
                      <TableCell
                        sx={cellSx({ mono: config.skuKey === "itemCode" })}
                      >
                        {r[config.skuKey]}
                      </TableCell>
                      <TableCell align="right" sx={cellSx()}>
                        {r.machineCount}
                      </TableCell>
                    </>
                  )}
                  {viewBy === "both" && (
                    <>
                      <TableCell sx={cellSx({ bold: true })}>
                        {r.machine}
                      </TableCell>
                      <TableCell
                        sx={cellSx({ mono: config.skuKey === "itemCode" })}
                      >
                        {r[config.skuKey]}
                      </TableCell>
                    </>
                  )}
                  <TableCell align="right" sx={cellSx()}>
                    {formatValue(planned, unit)}
                  </TableCell>
                  <TableCell align="right" sx={cellSx()}>
                    {formatValue(actual, unit)}
                  </TableCell>
                  {showBatches && (
                    <TableCell align="right" sx={cellSx()}>
                      {r.batchesPlan}
                    </TableCell>
                  )}
                  {showBatches && (
                    <TableCell align="right" sx={cellSx()}>
                      {r.batchesActual}
                    </TableCell>
                  )}
                  <TableCell
                    align="right"
                    sx={{ ...cellSx(), fontWeight: 600, color }}
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

function convertValue(row, field, section, unit) {
  const base = row[field] ?? 0;
  if (section === "mix" && unit === "batches") {
    return row[field === "planned" ? "batchesPlan" : "batchesActual"] ?? 0;
  }
  if (section === "stk" && unit === "kg") {
    return base * STOCK_KG_PER_UNIT;
  }
  return base;
}

function formatValue(v, unit) {
  if (unit === "batches") return Math.round(v).toLocaleString();
  if (unit === "kg") return v.toFixed(0);
  // MT or nos or Units — keep one decimal for MT, integers elsewhere
  return v < 1000 ? v.toFixed(1) : Math.round(v).toLocaleString();
}

function unitLabelOf(section, unit, config) {
  if (section === "mix") return unit === "batches" ? "Batches" : "MT";
  if (section === "stk") return unit === "kg" ? "Kg" : "Units";
  return config.valueLabel ?? "";
}

function viewByLabel(viewBy) {
  if (viewBy === "machine") return "Machine view";
  if (viewBy === "sku") return "SKU view";
  return "Machine + SKU";
}

function rowKey(r, viewBy, skuKey, i) {
  if (viewBy === "machine") return `${r.machine}-${i}`;
  if (viewBy === "sku") return `${r[skuKey]}-${i}`;
  return `${r.machine}-${r[skuKey]}-${i}`;
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

function cellSx({ bold = false, mono = false } = {}) {
  return {
    fontSize: 13,
    fontWeight: bold ? 600 : 400,
    fontFamily: mono ? "monospace" : undefined,
  };
}

function varianceColor(theme, variance) {
  if (variance >= 0) return theme.custom.brand.green;
  if (variance >= -5) return theme.custom.brand.amber;
  return theme.custom.brand.red;
}

export default ProductionDrillPanel;
