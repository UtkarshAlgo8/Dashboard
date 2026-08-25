import { useMemo, useState, useRef } from "react";
import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import DataTable from "@/components/tables/DataTable.jsx";
import TablePager from "@/components/tables/TablePager.jsx";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { canonicalUnit } from "@/lib/kpi-transformer.js";
import { displayUnit, isKg, kgToTonnes } from "@/lib/units.js";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import { getProductionDrillAggregate } from "@/api/drills.js";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";

// Athena serializes measures as strings; coerce to number|null for display.
function num(v) {
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Production drill — reads a server-grouped page for each selected lens.
 *
 * Per the journey doc (§5, §6, §15.4) and dashboard_kpi_map_reference
 * §3/§11:
 *   Production drills into Production_m / Production_sku /
 *   Production_m_sku — three lenses, one stored leaf kpi_name each. The
 *   active product-type pill (Master/Final Compound for Mixing,
 *   Passenger/LT/SUV Radial for TBM+Curing, the sub-section's types for
 *   Stock) filters the `product_type` column.
 *
 * Curing also has a trench tier (Production_s, grouped by sub_section);
 * the Curing drill exposes that as a fourth "Trench" lens alongside
 * Machine / SKU / Machine + SKU. Other sections get only the base three.
 *
 * Values are read VERBATIM from the matching stored row — actual_value
 * and threshold_value as-is, in the row's own unit. We never sum across
 * the time window (snapshot mode collapses to the latest day to match
 * the card) and never convert between units (each unit is its own stored
 * row). Achievement = Actual ÷ Planned.
 *
 * View By toggle (Machine | SKU | Machine + SKU | Trench) picks which
 * kpi_name to read; the Unit toggle picks which stored unit row to read.
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

// Base View By options for every section. Curing appends a "Trench" lens
// at runtime (TRENCH_VIEW_BY_OPTION below).
const BASE_VIEW_BY_OPTIONS = [
  { value: "machine", label: "Machine" },
  { value: "sku", label: "SKU" },
  { value: "both", label: "Machine + SKU" },
];
const TRENCH_VIEW_BY_OPTION = { value: "trench", label: "Trench" };

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
  // Keep the raw unit as the option value (the API is filtered by it), but
  // display KG as MT — production is shown in tonnes. See lib/units.js.
  return [...units]
    .sort((a, b) => a.localeCompare(b))
    .map((u) => ({ value: u, label: displayUnit(u) }));
}

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
  plantId = "banmore",
  section,
  subSection = null,
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
  const isCuring = section === "cur";
  // Curing drill offers a "Trench" lens alongside Machine / SKU /
  // Machine + SKU; other sections get the base three. Default view is
  // Machine so a fresh open matches the non-Curing behaviour.
  const viewByOptions = isCuring
    ? [...BASE_VIEW_BY_OPTIONS, TRENCH_VIEW_BY_OPTION]
    : BASE_VIEW_BY_OPTIONS;
  const [viewBy, setViewBy] = useState("machine");

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
  // activeUnit stays raw (KG) for the API/row filtering; the label shows MT.
  const unitLabel = displayUnit(activeUnit) ?? "";
  const sectionTitle = SECTION_TITLE[section] ?? section;

  // Pick which kpi_name backs the table based on viewBy.
  // Trench (Curing only) reads the trench-level Production_s roll-up via
  // tredgeRows — see trenchPayload below — and skips this paginated path.
  const isTrenchView = viewBy === "trench";
  const kpiName = isTrenchView
    ? "Production_s"
    : viewBy === "machine"
      ? "Production_m"
      : viewBy === "sku"
        ? "Production_sku"
        : "Production_m_sku";

  // The dimensions this lens groups by — one result row per distinct value.
  const groupBy = isTrenchView
    ? ["sub_section"]
    : viewBy === "machine"
      ? ["machine"]
      : viewBy === "sku"
        ? ["itemcode"]
        : ["machine", "itemcode"];

  // ---- Server-side pagination -------------------------------------------
  // Each lens (Machine / SKU / Machine+SKU) is its OWN paginated API call,
  // advancing OFFSET for Prev/Next. The server applies the section / product /
  // granularity / unit filters AND the group-by roll-up, so one returned row
  // is exactly one displayed row.
  //
  // The roll-up has to happen server-side. Gold stores one row per
  // (machine, itemcode, DAY), so paging the RAW rows slices days: a page of 25
  // could render as 6 machines, and a machine whose days straddle the page
  // boundary would appear on both pages carrying a partial total. Grouping in
  // SQL makes the page window and the totals mean the same thing.
  // Page size is user-controlled; the endpoint accepts up to 10000, so this
  // lens can offer a longer page than the shared default.
  const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0); // 0-indexed

  // OFFSET is in rows, so the current page index means something different
  // under a new size — always land back on page 1.
  const handlePageSize = (size) => {
    setPageSize(size);
    setPage(0);
  };

  // Reset to page 1 whenever the lens or any scope filter changes — done
  // during render (React's "adjust state on prop change" pattern) so a stale
  // deep page never shows for a different list.
  const pageKey = `${kpiName}|${activeUnit}|${prodSub}|${granularity}|${sectionName}|${subSection}|${from}|${to}`;
  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (prevPageKey !== pageKey) {
    setPrevPageKey(pageKey);
    setPage(0);
  }

  const pagePayload = {
    plantId,
    context: {
      section: sectionName,
      category: "Productivity",
      ...(granularity ? { granularity } : {}),
      ...(activeUnit ? { unit_of_measurement: activeUnit } : {}),
      ...(prodSub ? { product_type: prodSub } : {}),
      ...(!isCuring && subSection ? { sub_section: subSection } : {}),
    },
    from,
    to,
    kpiName,
    groupBy,
    limit: pageSize,
    offset: page * pageSize,
  };
  // Gate: no unit yet ⇒ the landing rows (which seed the unit toggle) haven't
  // arrived; and never fetch without a date window.
  const canFetch = Boolean(activeUnit) && Boolean(from || to);
  const {
    data: pageData,
    error: pageError,
    isLoading: pageLoading,
  } = usePolledQuery(() => getProductionDrillAggregate(pagePayload), {
    enabled: canFetch,
    interval: 0,
    deps: [JSON.stringify(pagePayload)],
  });

  // Rows arrive already grouped and summed over the window (new_change.md
  // C5/C3 — the additive Production levels SUM day-wise, exactly as the card
  // above does), so this only shapes them for the table. A dimension the lens
  // doesn't group by isn't in the response at all.
  const rows = useMemo(() => {
    if (!Array.isArray(pageData)) return [];
    return pageData.map((r) => ({
      machine: r.machine ?? "—",
      itemcode: r.itemcode ?? "—",
      planned: num(r.threshold_value),
      actual: num(r.actual_value),
    }));
  }, [pageData]);

  // Curing trench list (§7): one row per Tredge (Production_s). Grouped
  // server-side for the same reason the table above is — the raw rows are
  // one per (Tredge, DAY), so a wide range used to overflow the 100-row
  // fetch and silently drop trenches off the end of the list. The Curing
  // drill's "Trench" lens reads this same list — no separate fetch.
  const trenchPayload = isCuring
    ? {
        plantId,
        context: {
          section: sectionName,
          category: "Productivity",
          ...(granularity ? { granularity } : {}),
          ...(activeUnit ? { unit_of_measurement: activeUnit } : {}),
          ...(prodSub ? { product_type: prodSub } : {}),
        },
        from,
        to,
        kpiName: "Production_s",
        groupBy: ["sub_section"],
        limit: 100,
        offset: 0,
      }
    : null;
  const { data: trenchData, error: trenchError } = usePolledQuery(
    () =>
      trenchPayload
        ? getProductionDrillAggregate(trenchPayload)
        : Promise.resolve([]),
    {
      enabled: Boolean(trenchPayload) && canFetch,
      interval: 0,
      deps: [JSON.stringify(trenchPayload)],
    },
  );
  const tredgeRows = useMemo(() => {
    if (!Array.isArray(trenchData)) return [];
    return trenchData
      .filter((r) => r.sub_section)
      .map((r) => ({
        tredge: r.sub_section,
        planned: num(r.threshold_value),
        actual: num(r.actual_value),
      }))
      .sort((x, y) =>
        x.tredge.localeCompare(y.tredge, undefined, { numeric: true }),
      );
  }, [trenchData]);

  const fmt = (v) => {
    if (v == null) return "—";
    // KG values are shown in MT (÷1000). Tonne magnitudes are ~1000× smaller,
    // so keep 2 decimals until they reach whole-tonne scale; other units
    // (M, NOS) keep the original rounded-with-separators format.
    if (isKg(activeUnit)) {
      const t = kgToTonnes(v);
      return Math.abs(t) < 1000
        ? formatIndianNumber(t, { decimals: 2 })
        : formatIndianNumber(Math.round(t));
    }
    return formatIndianNumber(Math.round(v));
  };

  const title = prodSub
    ? `${sectionTitle} — ${prodSub} Production`
    : `${sectionTitle} Production`;

  // A full page means there may be more; a short page is the last.
  const hasMore = Array.isArray(pageData) && pageData.length === pageSize;
  const pageStart = page * pageSize;
  const loading = isLoading || pageLoading;

  const cardRef = useRef(null);

  // Active table source: trench view shows the flat trench list (no pager),
  // other views show the paginated press/SKU rows.
  const activeRows = isTrenchView ? tredgeRows : rows;

  // Excel rows: shape by the active view-by so columns match the table.
  const excelHeaders = isTrenchView
    ? [
        "Trench",
        `Planned (${unitLabel})`,
        `Actual (${unitLabel})`,
        "Achievement %",
      ]
    : viewBy === "machine"
      ? [
          "Machine",
          `Planned (${unitLabel})`,
          `Actual (${unitLabel})`,
          "Achievement %",
        ]
      : viewBy === "sku"
        ? [
            "Item Code",
            `Planned (${unitLabel})`,
            `Actual (${unitLabel})`,
            "Achievement %",
          ]
        : [
            "Machine",
            "Item Code",
            `Planned (${unitLabel})`,
            `Actual (${unitLabel})`,
            "Achievement %",
          ];
  const excelRows = activeRows.map((r) => {
    const ach =
      r.planned > 0 ? Number(((r.actual / r.planned) * 100).toFixed(2)) : "";
    if (isTrenchView) {
      return {
        Trench: r.tredge,
        [`Planned (${unitLabel})`]: r.planned,
        [`Actual (${unitLabel})`]: r.actual,
        "Achievement %": ach,
      };
    }
    if (viewBy === "machine") {
      return {
        Machine: r.machine,
        [`Planned (${unitLabel})`]: r.planned,
        [`Actual (${unitLabel})`]: r.actual,
        "Achievement %": ach,
      };
    }
    if (viewBy === "sku") {
      return {
        "Item Code": r.itemcode,
        [`Planned (${unitLabel})`]: r.planned,
        [`Actual (${unitLabel})`]: r.actual,
        "Achievement %": ach,
      };
    }
    return {
      Machine: r.machine,
      "Item Code": r.itemcode,
      [`Planned (${unitLabel})`]: r.planned,
      [`Actual (${unitLabel})`]: r.actual,
      "Achievement %": ach,
    };
  });

  // Empty guard: nothing to render when both the press/SKU page and the
  // trench list are empty. The skeleton handles the loading case.
  const hasAnyRows = rows.length > 0 || tredgeRows.length > 0;
  if (!hasAnyRows) {
    if (loading) {
      return <DrillSkeleton title rows={5} cols={5} />;
    }
    const requestError = pageError || trenchError;
    if (requestError) {
      return (
        <Box sx={{ p: 3, textAlign: "center", color: "error.main" }}>
          <Typography sx={{ fontSize: 13 }}>
            Failed to load Production drill data: {requestError.message}
          </Typography>
        </Box>
      );
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
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
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
        {/* Top-right download — menu offers PDF (visual) + Excel (page rows). */}
        <CardDownloadButton
          cardRef={cardRef}
          rows={excelRows}
          headers={excelHeaders}
          filename={`drill-production-${sectionName.toLowerCase().replace(/\s+/g, "-")}${
            prodSub ? `-${prodSub.toLowerCase().replace(/\s+/g, "-")}` : ""
          }`}
          sheetName="Production"
        />
      </Stack>

      <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
        <ToggleGroup
          label="View by"
          value={viewBy}
          onChange={setViewBy}
          options={viewByOptions}
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

      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
        <Box sx={{ flex: 1 }} />
        <Typography
          sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}
        >
          {activeRows.length === 0
            ? "0 rows"
            : isTrenchView
              ? `${activeRows.length} trenches`
              : `${pageStart + 1}–${pageStart + activeRows.length} · page ${page + 1}`}
          {prodSub ? ` · ${prodSub}` : ""}
        </Typography>
      </Stack>

      {loading && activeRows.length === 0 ? (
        <DrillSkeleton rows={6} cols={5} />
      ) : activeRows.length > 0 ? (
        <Box ref={cardRef}>
          <ResultTable
            rows={activeRows}
            viewBy={viewBy}
            unit={unitLabel}
            fmt={fmt}
          />
          {/* Pager only matters for paginated lenses — the trench list is
              a single flat fetch that already fits on one page. */}
          {!isTrenchView && (
            <TablePager
              page={page}
              pageSize={pageSize}
              hasMore={hasMore}
              onPageChange={setPage}
              onPageSizeChange={handlePageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              disabled={loading}
            />
          )}
        </Box>
      ) : (
        <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
          <Typography sx={{ fontSize: 13 }}>
            No rows for {sectionName} in this fetch.
          </Typography>
        </Box>
      )}
    </Stack>
  );
}

function ToggleGroup({ label, value, onChange, options }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography
        sx={{
          fontSize: 11.5,
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: 0.5,
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

function achievementOf(r) {
  return r.planned > 0 ? (r.actual / r.planned) * 100 : null;
}

function AchievementCell({ row }) {
  const theme = useTheme();
  const ach = achievementOf(row);
  const color =
    ach == null
      ? theme.palette.text.disabled
      : ach >= 100
        ? theme.custom.brand.green
        : ach >= 95
          ? theme.custom.brand.amber
          : theme.custom.brand.red;
  return (
    <Box component="span" sx={{ fontWeight: 700, color }}>
      {ach == null ? "—" : `${ach.toFixed(1)}%`}
    </Box>
  );
}

function ResultTable({ rows, viewBy, unit, fmt }) {
  const idCols = [];
  if (viewBy === "machine" || viewBy === "both") {
    idCols.push({ key: "machine", label: "Machine", align: "left" });
  }
  if (viewBy === "sku" || viewBy === "both") {
    idCols.push({
      key: "itemcode",
      label: "Item Code",
      align: "left",
      render: (r) => (
        <Box component="span" sx={{ fontFamily: "monospace" }}>
          {r.itemcode}
        </Box>
      ),
    });
  }
  if (viewBy === "trench") {
    idCols.push({ key: "tredge", label: "Trench", align: "left" });
  }
  const columns = [
    ...idCols,
    {
      key: "planned",
      label: `Planned (${unit})`,
      filterable: false,
      value: (r) => r.planned,
      render: (r) => fmt(r.planned),
    },
    {
      key: "actual",
      label: `Actual (${unit})`,
      filterable: false,
      value: (r) => r.actual,
      render: (r) => fmt(r.actual),
    },
    {
      key: "achievement",
      label: "Achievement",
      filterable: false,
      value: (r) => achievementOf(r) ?? -1,
      render: (r) => <AchievementCell row={r} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      // Trench rows carry `tredge` instead of machine/itemcode — key off
      // the identifier the row actually has so React doesn't fall over.
      getRowKey={(r) =>
        viewBy === "trench"
          ? (r.tredge ?? "")
          : `${r.machine ?? ""}||${r.itemcode ?? ""}`
      }
      maxHeight={380}
      searchPlaceholder={
        viewBy === "trench" ? "Search trench…" : "Search this page…"
      }
      emptyMessage="No rows on this page."
    />
  );
}

export default ProductionDrillPanel;
