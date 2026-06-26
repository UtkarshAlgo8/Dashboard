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
import { snapshotLatest } from "@/lib/drillDate.js";

/**
 * Production drill — derives from the raw gold rows already in hand via
 * `rawRows`. No second API call.
 *
 * Per the journey doc (§5, §6, §15.4) and dashboard_kpi_map_reference
 * §3/§11:
 *   Production drills into Production_m / Production_sku /
 *   Production_m_sku — three lenses, one stored leaf kpi_name each. The
 *   active product-type pill (Master/Final Compound for Mixing,
 *   Passenger/LT/SUV Radial for TBM+Curing, the sub-section's types for
 *   Stock) filters the `product_type` column.
 *
 * Values are read VERBATIM from the matching stored row — actual_value
 * and threshold_value as-is, in the row's own unit. We never sum across
 * the time window (snapshot mode collapses to the latest day to match
 * the card) and never convert between units (each unit is its own stored
 * row). Achievement = Actual ÷ Planned.
 *
 * View By toggle (Machine | SKU | Machine + SKU) picks which kpi_name to
 * read; the Unit toggle picks which stored unit row to read.
 */

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

// realdata.md §7: units are READ FROM THE DATA, not hardcoded. The real
// units are %, KG, M, NOS (the dummy's MT/Batches/units don't exist), and
// they vary by section/product, so a frozen per-section list never matches.
// We derive the unit toggle from the distinct unit_of_measurement values
// actually present on the Production rows in hand (see deriveUnitOptions),
// and a multi-unit KPI shows the toggle while a single-unit one just pins it.
function deriveUnitOptions(rows, sectionName, ptFilter) {
  if (!Array.isArray(rows)) return [];
  const units = new Set();
  for (const r of rows) {
    if (r.section !== sectionName) continue;
    if (!String(r.kpi_name ?? "").startsWith("Production")) continue;
    if (!matchesProduct(r.product_type, ptFilter)) continue;
    const u = r.unit_of_measurement;
    if (u && u !== "nan" && u !== "(unset)") units.add(u);
  }
  return [...units]
    .sort((a, b) => a.localeCompare(b))
    .map((u) => ({ value: u, label: u }));
}

const VIEW_BY_OPTIONS = [
  { value: "machine", label: "Machine" },
  { value: "sku", label: "SKU" },
  { value: "both", label: "Machine + SKU" },
];

// Aggregate ("sum") product types whose SKU-level drill children are stored
// under the finer tyre-category names. When the user has the aggregate
// selected, the SKU lenses must accept the child categories instead of
// filtering to the aggregate name (which no child row carries). Mirrors the
// backend AGGREGATE_PRODUCT_CHILDREN expansion.
// realdata.md §6a: the real per-product children of the overall tyre.
const AGGREGATE_PRODUCT_CHILDREN = {
  "Green Tyre": ["Passenger Radial", "LCV", "Unknown"],
  "Cured Tyre": ["Passenger Radial", "LCV", "Unknown"],
};

/** Does a row's product_type satisfy the selected product pill? */
function matchesProduct(rowPt, selected) {
  if (selected == null) return true;
  if (rowPt === selected) return true;
  const kids = AGGREGATE_PRODUCT_CHILDREN[selected];
  return Boolean(kids && kids.includes(rowPt));
}

function ProductionDrillPanel({
  section,
  prodSub,
  rawRows,
  mode = "snapshot",
  granularity = "DAY",
  isLoading = false,
}) {
  const [search, setSearch] = useState("");
  const [viewBy, setViewBy] = useState("machine");
  // dashboard_doc.md §7: Curing only — a trench (Tredge) level sits ABOVE
  // the press/SKU table. Selecting a Tredge filters the press/SKU lenses to
  // that sub_section (Production_m / _m_sku / _sku_m all carry sub_section =
  // Tredge N). Other sections have no trench tier (selectedTredge stays
  // null and the table shows all rows, unchanged).
  const isCuring = section === "cur";
  const [selectedTredge, setSelectedTredge] = useState(null);

  const sectionName = SECTION_NAME[section] ?? section;
  const ptFilterForUnits = prodSub ? prodSub : null;
  // realdata.md §7: derive the unit toggle from the data, not a frozen list.
  const unitOptions = useMemo(
    () => deriveUnitOptions(rawRows, sectionName, ptFilterForUnits),
    [rawRows, sectionName, ptFilterForUnits],
  );
  const [unit, setUnit] = useState(null);
  // Pin a unit once the data arrives (first available); keep the user's pick
  // if it's still present. Single-unit KPIs just show that unit, multi-unit
  // KPIs get a real toggle — but we never combine units.
  const activeUnit =
    unit && unitOptions.some((o) => o.value === unit)
      ? unit
      : unitOptions[0]?.value ?? null;
  const unitLabel = activeUnit ?? "";
  const sectionTitle = SECTION_TITLE[section] ?? section;

  // Pick which kpi_name backs the table based on viewBy.
  const kpiName =
    viewBy === "machine"
      ? "Production_m"
      : viewBy === "sku"
        ? "Production_sku"
        : "Production_m_sku";

  // Subset rows: this section + this kpi_name + the active product-type
  // pill. Each lens reads its own leaf kpi_name directly (Production_m /
  // _sku / _m_sku) — all three carry the product_type column in the gold
  // layer, so the active pill filters every lens the same way. We must
  // NOT re-derive Production_m by summing Production_m_sku: the stored
  // Production_m value differs from that sum, so doing so makes the
  // machine lens show a different number when a pill is active vs not.
  //
  // Granularity / time: the drill inherits the card's granularity
  // (journey.md §5) — Shift B card → Shift B rows, Month → MTD, Year →
  // YTD, Today → Daily. The drill fetch pulls rows at that same
  // granularity over the selected window (a trailing 7-day window for the
  // "today" preset, so the sparkline has points). The headline card reads
  // only the LATEST row's value (snapshot mode). The table must match it:
  // in snapshot mode keep only the rows on the latest available date —
  // otherwise we SUM every row in the window and the table overshoots the
  // card. In aggregate mode (an explicit custom range) summing the window
  // is the intended behaviour, so we keep all rows.
  const scopedRows = useMemo(() => {
    if (!Array.isArray(rawRows)) return [];

    // Empty-string prodSub (sections without product-type pills, e.g.
    // Stock) means "no product-type filter" — same as null.
    const ptFilter = prodSub ? prodSub : null;

    const matched = rawRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === kpiName &&
        r.granularity === granularity &&
        r.unit_of_measurement === activeUnit &&
        matchesProduct(r.product_type, ptFilter) &&
        // Curing trench drill (§7): once a Tredge is picked, the press/SKU
        // table is scoped to that trench's sub_section.
        (!isCuring || selectedTredge == null || r.sub_section === selectedTredge),
    );

    // Snapshot mode collapses to the latest available date so the table
    // reconciles with the card; aggregate mode keeps the full window.
    return snapshotLatest(matched, mode);
  }, [
    rawRows,
    sectionName,
    kpiName,
    prodSub,
    activeUnit,
    mode,
    granularity,
    isCuring,
    selectedTredge,
  ]);

  // Curing trench rows (§7): Production_s, one row per Tredge. Backs the
  // trench selector shown above the press/SKU table for Curing only.
  const tredgeRows = useMemo(() => {
    if (!isCuring || !Array.isArray(rawRows)) return [];
    const ptFilter = prodSub ? prodSub : null;
    const matched = rawRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === "Production_s" &&
        r.granularity === granularity &&
        r.unit_of_measurement === activeUnit &&
        matchesProduct(r.product_type, ptFilter) &&
        r.sub_section &&
        r.sub_section !== "nan",
    );
    const latest = snapshotLatest(matched, mode);
    const byTredge = new Map();
    for (const r of latest) {
      const t = r.sub_section;
      const cur = byTredge.get(t) ?? { tredge: t, planned: null, actual: null };
      if (typeof r.threshold_value === "number") cur.planned = r.threshold_value;
      if (typeof r.actual_value === "number") cur.actual = r.actual_value;
      byTredge.set(t, cur);
    }
    return [...byTredge.values()].sort((a, b) =>
      a.tredge.localeCompare(b.tredge, undefined, { numeric: true }),
    );
  }, [isCuring, rawRows, sectionName, prodSub, activeUnit, mode, granularity]);

  // Group per the active lens. We show the ACTUAL stored value per row,
  // never a sum: each leaf kpi already carries the pre-aggregated value
  // for its (machine / sku / machine+sku) key on the snapshot date, so
  // summing would double-count. When more than one row maps to the same
  // key (e.g. machine view with no product pill, where the same machine
  // appears once per product_type), we keep the latest row's value
  // rather than adding them together.
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
          planned: null,
          actual: null,
          itemSet: new Set(),
          machineSet: new Set(),
        });
      }
      const acc = groups.get(k);
      // Actual stored values — take this row's value as-is (last write
      // wins on a duplicate key), do NOT accumulate.
      if (typeof r.threshold_value === "number")
        acc.planned = r.threshold_value;
      if (typeof r.actual_value === "number") acc.actual = r.actual_value;
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

  // Values are read verbatim from the row's own unit (scopedRows is
  // already filtered to the selected unit_of_measurement) — never
  // converted between units. Whole-count units render as integers;
  // MT renders to one decimal under 1000 to keep small lots legible.
  const fmt = (v) => {
    if (v == null) return "—";
    // KG can be fractional for small lots; keep one decimal under 1000.
    if (activeUnit === "KG" && v < 1000) return v.toFixed(1);
    return Math.round(v).toLocaleString();
  };

  const title = prodSub
    ? `${sectionTitle} — ${prodSub} Production`
    : `${sectionTitle} Production`;

  // Curing trench tier (§7): until a Tredge is selected, show the
  // trench-wise list (Production_s). Selecting one reveals its press/SKU
  // table below. Other sections skip this and go straight to the table.
  const showTrenchPicker = isCuring && tredgeRows.length > 0;

  if (filtered.length === 0 && !showTrenchPicker) {
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

      {/* Curing trench tier (§7): Tredge-wise list (Production_s). Click a
          Tredge to drill into its presses / SKUs. */}
      {showTrenchPicker && (
        <TrenchPicker
          rows={tredgeRows}
          selected={selectedTredge}
          onSelect={(t) =>
            setSelectedTredge((cur) => (cur === t ? null : t))
          }
          unit={unitLabel}
          fmt={fmt}
        />
      )}

      {/* Press/SKU breakdown — for Curing, only after a Tredge is picked. */}
      {(!showTrenchPicker || selectedTredge) && (
        <>
          <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
            <ToggleGroup
              label="View by"
              value={viewBy}
              onChange={setViewBy}
              options={VIEW_BY_OPTIONS}
            />
            {/* realdata.md §7: a multi-unit KPI shows the toggle; a
                single-unit one just displays its unit (no toggle). */}
            {unitOptions.length > 1 && (
              <ToggleGroup
                label="Unit"
                value={activeUnit}
                onChange={setUnit}
                options={unitOptions}
              />
            )}
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            flexWrap="wrap"
          >
            <MachineSearch value={search} onChange={setSearch} />
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
              {filtered.length} of {aggregated.length} rows
              {selectedTredge ? ` in ${selectedTredge}` : ""}
              {prodSub ? ` · ${prodSub}` : ""}
            </Typography>
          </Stack>

          {filtered.length > 0 ? (
            <ResultTable
              rows={filtered}
              viewBy={viewBy}
              unit={unitLabel}
              fmt={fmt}
            />
          ) : (
            <Box sx={{ p: 2, textAlign: "center", color: "text.disabled" }}>
              <Typography sx={{ fontSize: 13 }}>
                No press / SKU rows for {selectedTredge ?? sectionName} in this
                fetch.
              </Typography>
            </Box>
          )}
        </>
      )}
    </Stack>
  );
}

/**
 * Curing trench tier (§7): one clickable row per Tredge (Production_s).
 * Selecting a Tredge drills into its presses / SKUs below.
 */
function TrenchPicker({ rows, selected, onSelect, unit, fmt }) {
  const theme = useTheme();
  return (
    <Stack spacing={1}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        Trench-wise — click to drill into presses
      </Typography>
      <TableContainer
        sx={{ border: 1, borderColor: "divider", borderRadius: 1.25 }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <Th align="left">Tredge</Th>
              <Th>{`Planned (${unit})`}</Th>
              <Th>{`Actual (${unit})`}</Th>
              <Th>Achievement</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const ach =
                r.planned > 0 ? (r.actual / r.planned) * 100 : null;
              const achColor =
                ach == null
                  ? theme.palette.text.disabled
                  : ach >= 100
                    ? theme.custom.brand.green
                    : ach >= 95
                      ? theme.custom.brand.amber
                      : theme.custom.brand.red;
              const isSel = selected === r.tredge;
              return (
                <TableRow
                  key={r.tredge}
                  hover
                  onClick={() => onSelect(r.tredge)}
                  sx={{
                    cursor: "pointer",
                    backgroundColor: isSel
                      ? `${theme.custom.brand.orange}1f`
                      : undefined,
                  }}
                >
                  <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                    {r.tredge}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: 13 }}>
                    {fmt(r.planned)}
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontSize: 13, fontWeight: 600 }}
                  >
                    {fmt(r.actual)}
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontSize: 13, fontWeight: 700, color: achColor }}
                  >
                    {ach == null ? "—" : `${ach.toFixed(1)}%`}
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
            const achievement = planned > 0 ? (actual / planned) * 100 : null;
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
                    <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
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
                <TableCell
                  align="center"
                  sx={{ fontSize: 13, fontWeight: 600 }}
                >
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
