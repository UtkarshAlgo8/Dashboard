import { useMemo, useState } from "react";
import {
  Box,
  Button,
  MenuItem,
  Select,
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
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { aggregateForRange, canonicalUnit } from "@/lib/kpi-transformer.js";
import client from "@/api/client.js";

// Athena serializes measures as strings; coerce to number|null for display.
function num(v) {
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

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
    // new_change.md C9: "null"/"nan"/""/"(unset)" are all the missing-unit
    // sentinel (4 Roll's Ply Mother Roll rows carry the literal "null") —
    // they must never become a selectable unit.
    const u = r.unit_of_measurement;
    if (canonicalUnit(u) != null) units.add(u);
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
  granularity = "DAY",
  from = null,
  to = null,
  // new_change.md C3: the drill inherits the CARD's unit pin — a drill must
  // never quietly read a different unit than the card above it.
  unitPin = null,
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
  // new_change.md C3/C9: the card's pin arrives CANONICALIZED ("KG", "M",
  // "NOS", "BATCH") while the options carry the row's own spelling
  // ("Batch", "Meters"). Compare canonically, or the inheritance silently
  // misses and the drill reads a different unit than the card above it.
  const pinnedOption = unitPin
    ? unitOptions.find((o) => canonicalUnit(o.value) === canonicalUnit(unitPin))
    : null;
  const activeUnit =
    unit && unitOptions.some((o) => o.value === unit)
      ? unit
      : (pinnedOption?.value ?? unitOptions[0]?.value ?? null);
  const unitLabel = activeUnit ?? "";
  const sectionTitle = SECTION_TITLE[section] ?? section;

  // Pick which kpi_name backs the table based on viewBy.
  const kpiName =
    viewBy === "machine"
      ? "Production_m"
      : viewBy === "sku"
        ? "Production_sku"
        : "Production_m_sku";

  // ---- Server-side pagination -------------------------------------------
  // Each lens (Machine / SKU / Machine+SKU) is its OWN paginated API call:
  // 100 rows of that leaf kpi_name at a time, advancing OFFSET for Prev/Next.
  // The server applies the section / product / granularity / unit / trench
  // filters, so the panel just displays the page it gets back — raw rows,
  // one machine/SKU each once the lake is deduped. No client aggregation,
  // no fetching the whole 10k band.
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0); // 0-indexed

  // Reset to page 1 whenever the lens or any scope filter changes — done
  // during render (React's "adjust state on prop change" pattern) so a stale
  // deep page never shows for a different list.
  const pageKey = `${kpiName}|${activeUnit}|${prodSub}|${granularity}|${selectedTredge}|${sectionName}|${from}|${to}`;
  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (prevPageKey !== pageKey) {
    setPrevPageKey(pageKey);
    setPage(0);
  }

  const pagePayload = {
    context: {
      section: sectionName,
      category: "Productivity",
      ...(granularity ? { granularity } : {}),
      ...(activeUnit ? { unit_of_measurement: activeUnit } : {}),
      ...(prodSub ? { product_type: prodSub } : {}),
      // Curing trench drill (§7): scope the page to the picked Tredge.
      ...(isCuring && selectedTredge ? { sub_section: selectedTredge } : {}),
    },
    from,
    to,
    drillKpis: [kpiName],
    drillOnly: true,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  // Gate: no unit yet ⇒ the landing rows (which seed the unit toggle) haven't
  // arrived; and never fetch without a date window.
  const canFetch = Boolean(activeUnit) && Boolean(from || to);
  const { data: pageData, isLoading: pageLoading } = usePolledQuery(
    () =>
      client.post("/dashboard/kpi-data", pagePayload).then((r) => r.data ?? r),
    { enabled: canFetch, interval: 0, deps: [JSON.stringify(pagePayload)] },
  );

  // Map the raw page rows to the table shape. No dedup/aggregation — one row
  // per stored (machine, itemcode) as returned (the raw LIMIT/OFFSET model:
  // fully correct once the lake is deduped). itemCount/machineCount were
  // artifacts of the old client grouping; raw rows don't carry them.
  const rows = useMemo(() => {
    if (!Array.isArray(pageData)) return [];
    // new_change.md C5/C3: over a RANGE the page carries one row per
    // (machine, sku, DAY), so the drill must aggregate day-wise exactly as
    // the card does — SUM for the additive Production levels — otherwise a
    // range card sits above a table of single-day rows. A single day
    // (from == to) collapses to one row per key, so this is a no-op there.
    const byKey = new Map();
    for (const r of pageData) {
      const machine = r.machine && r.machine !== "nan" ? r.machine : "—";
      const itemcode = r.itemcode && r.itemcode !== "nan" ? r.itemcode : "—";
      const key = `${machine}||${itemcode}`;
      const cur = byKey.get(key) ?? {
        machine,
        itemcode,
        planned: [],
        actual: [],
        itemCount: 0,
        machineCount: 0,
      };
      const p = num(r.threshold_value);
      const a = num(r.actual_value);
      if (p != null) cur.planned.push(p);
      if (a != null) cur.actual.push(a);
      byKey.set(key, cur);
    }
    return [...byKey.values()].map((g) => ({
      ...g,
      // Missing days are simply absent from the list — never counted as 0.
      planned: aggregateForRange(g.planned, kpiName),
      actual: aggregateForRange(g.actual, kpiName),
    }));
  }, [pageData, kpiName]);

  // Search narrows the CURRENT page only (machine lens). Cross-page search
  // would need a server-side machine filter — out of scope for now.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      viewBy === "sku" ? false : (r.machine ?? "").toLowerCase().includes(q),
    );
  }, [rows, search, viewBy]);

  // Curing trench list (§7): one row per Tredge (Production_s). Its own small
  // drillOnly fetch — trenches are few, so no pagination.
  const trenchPayload = isCuring
    ? {
        context: {
          section: sectionName,
          category: "Productivity",
          ...(granularity ? { granularity } : {}),
          ...(activeUnit ? { unit_of_measurement: activeUnit } : {}),
          ...(prodSub ? { product_type: prodSub } : {}),
        },
        from,
        to,
        drillKpis: ["Production_s"],
        drillOnly: true,
        limit: 100,
        offset: 0,
      }
    : null;
  const { data: trenchData } = usePolledQuery(
    () =>
      trenchPayload
        ? client
            .post("/dashboard/kpi-data", trenchPayload)
            .then((r) => r.data ?? r)
        : Promise.resolve([]),
    {
      enabled: Boolean(trenchPayload) && canFetch,
      interval: 0,
      deps: [JSON.stringify(trenchPayload)],
    },
  );
  const tredgeRows = useMemo(() => {
    if (!Array.isArray(trenchData)) return [];
    const byTredge = new Map();
    for (const r of trenchData) {
      const t = r.sub_section;
      if (!t || t === "nan" || t === "null") continue;
      const cur = byTredge.get(t) ?? { tredge: t, planned: [], actual: [] };
      const p = num(r.threshold_value);
      const a = num(r.actual_value);
      if (p != null) cur.planned.push(p);
      if (a != null) cur.actual.push(a);
      byTredge.set(t, cur);
    }
    // new_change.md C5: aggregate the trench rows over the range the same
    // way the card does (Production_s is additive → summed day-wise), so
    // the trench list reconciles with the Production card above it.
    return [...byTredge.values()]
      .map((g) => ({
        tredge: g.tredge,
        planned: aggregateForRange(g.planned, "Production_s"),
        actual: aggregateForRange(g.actual, "Production_s"),
      }))
      .sort((x, y) =>
        x.tredge.localeCompare(y.tredge, undefined, { numeric: true }),
      );
  }, [trenchData]);

  const fmt = (v) => {
    if (v == null) return "—";
    if (activeUnit === "KG" && v < 1000) return v.toFixed(1);
    return Math.round(v).toLocaleString();
  };

  const title = prodSub
    ? `${sectionTitle} — ${prodSub} Production`
    : `${sectionTitle} Production`;

  // A full page (100 rows) means there may be more; a short page is the last.
  const hasMore = Array.isArray(pageData) && pageData.length === PAGE_SIZE;
  const pageStart = page * PAGE_SIZE;
  const loading = isLoading || pageLoading;

  // Curing trench tier (§7): until a Tredge is selected, show the
  // trench-wise list (Production_s). Selecting one reveals its press/SKU
  // table below. Other sections skip this and go straight to the table.
  const showTrenchPicker = isCuring && tredgeRows.length > 0;

  if (filtered.length === 0 && !showTrenchPicker) {
    if (loading) {
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
          onSelect={(t) => setSelectedTredge((cur) => (cur === t ? null : t))}
          unit={unitLabel}
          fmt={fmt}
        />
      )}

      {/* Press/SKU breakdown — for Curing, only after a Tredge is picked. */}
      {(!showTrenchPicker || selectedTredge) && (
        <>
          <Stack
            direction="row"
            spacing={3}
            alignItems="center"
            flexWrap="wrap"
          >
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
              {filtered.length === 0
                ? "0 rows"
                : `${pageStart + 1}–${pageStart + filtered.length} · page ${page + 1}`}
              {selectedTredge ? ` in ${selectedTredge}` : ""}
              {prodSub ? ` · ${prodSub}` : ""}
            </Typography>
          </Stack>

          {loading && filtered.length === 0 ? (
            <DrillSkeleton rows={6} cols={5} />
          ) : filtered.length > 0 ? (
            <>
              <ResultTable
                rows={filtered}
                viewBy={viewBy}
                unit={unitLabel}
                fmt={fmt}
              />
              {(page > 0 || hasMore) && (
                <Pager
                  page={page}
                  hasMore={hasMore}
                  onPage={setPage}
                  onPrev={() => setPage((p) => Math.max(0, p - 1))}
                  onNext={() => setPage((p) => p + 1)}
                />
              )}
            </>
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
 * Page toggle for the SKU / machine table — 100 rows per page, fetched
 * server-side. Prev/Next; Next is disabled when the last page returned fewer
 * than a full 100 rows (no total count in the raw LIMIT/OFFSET model).
 */
function Pager({ page, hasMore, onPage, onPrev, onNext }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="flex-end"
      spacing={1.5}
      sx={{ pt: 0.5 }}
    >
      <Button
        size="small"
        variant="outlined"
        onClick={onPrev}
        disabled={page <= 0}
      >
        Prev
      </Button>
      <Typography
        component="span"
        sx={{ fontSize: 12, color: "text.secondary" }}
      >
        Page
      </Typography>
      <Select
        size="small"
        value={page}
        onChange={(e) => onPage(Number(e.target.value))}
        sx={{
          minWidth: 96,
          "& .MuiSelect-select": { py: 0.55, fontSize: 12 },
        }}
      >
        {Array.from({ length: page + (hasMore ? 2 : 1) }, (_, i) => (
          <MenuItem key={i} value={i}>
            {i + 1}
          </MenuItem>
        ))}
      </Select>
      <Button
        size="small"
        variant="outlined"
        onClick={onNext}
        disabled={!hasMore}
      >
        Next
      </Button>
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
              const ach = r.planned > 0 ? (r.actual / r.planned) * 100 : null;
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
