import { useEffect, useRef, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import SectionSidebar from "@/components/production/SectionSidebar.jsx";
import PlantSummaryCard from "@/components/production/PlantSummaryCard.jsx";
import CategoryTabs from "@/components/production/CategoryTabs.jsx";
import KpiGrid from "@/components/production/KpiGrid.jsx";
import NavTabs from "@/components/production/NavTabs.jsx";
import ProductionBodySkeleton from "@/components/production/ProductionBodySkeleton.jsx";
import ShiftComparisonCard from "@/components/production/ShiftComparisonCard.jsx";
import InventoryPage from "@/components/inventory/InventoryPage.jsx";
import TrendModal from "@/components/trend/TrendModal.jsx";
import OeeDrillPanel from "@/components/drills/oee/OeeDrillPanel.jsx";
import ProductionDrillPanel from "@/components/drills/production/ProductionDrillPanel.jsx";
import DowntimeDrillPanel from "@/components/drills/downtime/DowntimeDrillPanel.jsx";
import GenericTableDrillPanel from "@/components/drills/shared/GenericTableDrillPanel.jsx";
import ScrapReworkDrillPanel from "@/components/drills/quality/ScrapReworkDrillPanel.jsx";
import BudgetDrillPanel from "@/components/drills/shared/BudgetDrillPanel.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import {
  getPlant,
  getSections,
  getCategoryTabs,
  getPlantSummary,
  getAsOf,
  getSectionOee,
} from "@/api/plants.js";
import { useDashboardFetch } from "@/hooks/useDashboardFetch.js";
import { presetToDateRange, buildDatePayload } from "@/lib/timeRange.js";
import { canonicalUnit } from "@/lib/kpi-transformer.js";
import client from "@/api/client.js";
import { exportElementToPdf } from "@/lib/exportPdf.js";

// Production drill types render ProductionDrillPanel, which owns its own
// paginated per-lens fetch — so drilling them must NOT kick off the generic
// 10k-row drill fetch in useDashboardFetch.
const PROD_DRILL_TYPES = new Set(["mixProd", "tbmProd", "stkProd", "curProd"]);

/**
 * new_change.md C8: the distinct (product_type, unit_of_measurement) pairs
 * the Production rows actually carry for the fetched scope. Drives the Stock
 * product pills and the unit pin — never a hardcoded list, and `Belt Mother
 * Roll` is kept as-is (never aliased to `Belt`).
 */
function deriveProductionOptions(rows, sectionName) {
  if (!Array.isArray(rows)) return [];
  const seen = new Map();
  for (const r of rows) {
    if (r.section !== sectionName) continue;
    if (r.kpi_name !== "Production") continue;
    const pt =
      r.product_type == null ||
      ["", "nan", "null"].includes(String(r.product_type).trim().toLowerCase())
        ? null
        : String(r.product_type).trim();
    const unit = canonicalUnit(r.unit_of_measurement);
    const key = `${pt ?? ""}||${unit ?? ""}`;
    if (!seen.has(key)) seen.set(key, { productType: pt, unit });
  }
  return [...seen.values()].sort(
    (a, b) =>
      (a.productType ?? "").localeCompare(b.productType ?? "") ||
      (a.unit ?? "").localeCompare(b.unit ?? ""),
  );
}

/**
 * Banmore Production dashboard — Phase 1 ships Banmore plant + Production.
 *
 * CR-08 change: uses useDashboardFetch (v2 universal hook) for KPI + drill data.
 * Drill panels:
 *   - OEE / Production / Downtime / Plan Compliance → dedicated panels (own API)
 *   - All others → GenericDrillPanel driven by v2 drillRows
 */
function BanmoreProduction() {
  const theme = useTheme();
  const [trendKpi, setTrendKpi] = useState(null);
  // Whole-page PDF export. `exporting` temporarily releases the static
  // 100vh layout (height auto / overflow visible) so the FULL page +
  // full render box are captured on one un-split page, then restores it.
  const rootRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const onExportPdf = async () => {
    setExporting(true);
    // Wait two frames for the expanded layout to commit before capturing.
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    try {
      await exportElementToPdf(rootRef.current, {
        filename: "banmore-production.pdf",
        backgroundColor: theme.palette.background.default,
      });
    } finally {
      setExporting(false);
    }
  };

  const { data: plant, isLoading: plantLoading } = usePolledQuery(
    () => getPlant("banmore"),
    { interval: 0 },
  );
  const { data: sections } = usePolledQuery(getSections, { interval: 0 });
  const { data: tabs } = usePolledQuery(getCategoryTabs, { interval: 0 });
  const { data: summary } = usePolledQuery(() => getPlantSummary("banmore"), {
    interval: 0,
  });
  // As-of date (BRD §13.5) — anchor for all time-range windows so values
  // render even when the calendar runs ahead of the available data.
  const { data: asOfData, isLoading: asOfLoading } = usePolledQuery(
    () => getAsOf("banmore"),
    { interval: 0 },
  );
  const asOf = asOfData?.asOf ?? null;

  // CR-08: v2 dashboard fetch — owns section/category/granularity/date/drill state.
  const {
    state: dashboard,
    kpis,
    drillRows,
    rawRows,
    isLoading: kpiLoading,
    isDrillLoading,
    error: kpiError,
    setFilter,
    drillInto,
    resetDrill,
  } = useDashboardFetch();

  const sectionName =
    { mix: "Mixing", stk: "Stock", tbm: "TBM", cur: "Curing" }[
      dashboard.section
    ] ?? dashboard.section;

  // Per-section OEE for the sidebar donut rings, tracking the active
  // granularity (Today / Month / Year). Keyed by artifact section id.
  // Gate on the resolved window (same rule as the landing fetch) so the
  // sidebar OEE call fires once — after the granularity settles — instead of
  // once on mount and again when the preset resolves.
  const hasDateRange = Boolean(
    (dashboard.from && dashboard.to) || dashboard.date,
  );
  const { data: sectionOeeData } = usePolledQuery(
    () => getSectionOee("banmore", dashboard.granularity ?? "MONTH"),
    {
      interval: 0,
      enabled: hasDateRange,
      deps: [dashboard.granularity, hasDateRange],
    },
  );
  const sectionOeeById = {
    mix: sectionOeeData?.Mixing ?? null,
    stk: sectionOeeData?.Stock ?? null,
    tbm: sectionOeeData?.TBM ?? null,
    cur: sectionOeeData?.Curing ?? null,
  };
  // The ACTIVE section's ring should mirror the OEE actually shown in the
  // render box right now (it already reflects the selected sub-section /
  // product type / granularity, so it updates up AND down). When no OEE
  // card is shown (e.g. non-Productivity tab), we keep the endpoint's
  // first-item value as the fallback.
  const shownOee = kpis.find(
    (k) => k.id === "oee" && typeof k.value === "number",
  )?.value;
  if (typeof shownOee === "number") {
    sectionOeeById[dashboard.section] = shownOee;
  }

  // Section metadata per artifact (full title shown in section header).
  const SECTION_TITLE = {
    mix: "Mixing / Banbury",
    tbm: "Tyre Building Machine",
    cur: "Curing / Vulcanization",
    stk: "Stock / Component Prep",
  };

  // Product-type / sub-category pills per artifact buildKpis().
  // Product types per section, from the gold data. The first entry is the
  // default (the section-level "overall" where one exists). Selecting one
  // sends product_type to the backend — a real, server-side-filtered API
  // call (no client-side fallback).
  // new_change.md C7: the real per-product children of the TBM/Curing
  // aggregate are Passenger Radial / LCV / Unknown (there is no LT or SUV
  // Radial in the data). The first entry is the section AGGREGATE, i.e.
  // "Overall" — the Production card reads Production_product pinned to it.
  const PROD_SUB_OPTIONS = {
    mix: ["Master Compound", "Final Compound"],
    tbm: ["Green Tyre", "Passenger Radial", "LCV", "Unknown"],
    cur: ["Cured Tyre", "Passenger Radial", "LCV", "Unknown"],
    stk: [], // Stock uses the sub-section selector + its own product types.
  };
  const SECTION_DEFAULT_PRODUCT = {
    mix: "Master Compound",
    tbm: "Green Tyre",
    cur: "Cured Tyre",
    // changes.md §4: Stock's default product is resolved from the active
    // sub-section's first REAL product, never a synthetic "Overall".
    stk: null,
  };
  const prodSubOptions = PROD_SUB_OPTIONS[dashboard.section] ?? [];

  // Stock sub-sections (BRD §13.2). The first is the default on entering
  // Stock. new_change.md C8: the PRODUCT list is NOT hardcoded — every
  // sub-section makes different products under different names (4 Roll makes
  // "Belt Mother Roll", Cutter makes "Belt"), so a shared list matches
  // nothing for some of them and the card blanks. The options are derived
  // from the data below (and `Belt Mother Roll` is never aliased to `Belt` —
  // a mother roll is a genuinely different intermediate product).
  const STOCK_SUBSECTIONS = [
    "4 Roll",
    "Extruder",
    "3 Roll",
    "Cutter",
    "Slitter",
    "Bead",
  ];
  const isStock = dashboard.section === "stk";
  const activeSubSection = dashboard.subSection ?? STOCK_SUBSECTIONS[0];
  // dashboard_doc.md §3/§8: OEE is disambiguated by sub_section. Stock OEE
  // has one OEE_o row PER sub_section (5 rows/date), so a plot/shift card
  // that doesn't pin one stacks all five points on the same date. Stock is
  // always viewed per sub_section, so pin the resolved sub_section (which
  // defaults to the first one before the user picks). Other sections have a
  // single section-level OEE_o row (sub_section empty), so they stay null.
  const pinnedSubSection = isStock ? activeSubSection : dashboard.subSection;
  // new_change.md C8: read the DISTINCT (product_type, unit_of_measurement)
  // pairs the data actually holds for this sub-section. Its own small fetch,
  // deliberately WITHOUT a product_type pin (the landing fetch carries one,
  // so it can only ever return the already-selected product).
  const optionsPayload = {
    context: {
      section: sectionName,
      category: "Productivity",
      ...(isStock ? { sub_section: activeSubSection } : {}),
    },
    ...buildDatePayload({ from: dashboard.from, to: dashboard.to }),
    drillKpis: null,
    parentFilters: {},
    limit: 5000,
  };
  const { data: optionRows } = usePolledQuery(
    () =>
      client
        .post("/dashboard/kpi-data", optionsPayload)
        .then((r) => r.data ?? r),
    {
      enabled: hasDateRange && dashboard.category === "p",
      interval: 0,
      deps: [JSON.stringify(optionsPayload)],
    },
  );
  const productionOptions = deriveProductionOptions(optionRows, sectionName);
  // changes.md §4: Stock has NO synthetic "Overall" product — only the real
  // product rows of the sub-section, in the data's own spelling.
  const stockProductOptions = [
    ...new Set(productionOptions.map((o) => o.productType).filter(Boolean)),
  ];
  // The active product type (sent to the backend). Falls back to the
  // section default; for Stock that is the sub-section's first real product.
  const activeProductType =
    dashboard.productType ??
    (isStock
      ? (stockProductOptions[0] ?? null)
      : SECTION_DEFAULT_PRODUCT[dashboard.section]);

  // new_change.md C8/C9: multi-unit series (Stock Extruder / 3 Roll / Bead,
  // Mixing KG vs Batch) must pin a unit as well as the product — the two
  // units measure the same production and may never be combined.
  const unitOptionsForProduct = [
    ...new Set(
      productionOptions
        .filter(
          (o) => !activeProductType || o.productType === activeProductType,
        )
        .map((o) => o.unit)
        .filter(Boolean),
    ),
  ];
  const activeUnit =
    dashboard.unitOfMeasurement &&
    unitOptionsForProduct.includes(dashboard.unitOfMeasurement)
      ? dashboard.unitOfMeasurement
      : (unitOptionsForProduct[0] ?? null);

  // Keep the pinned unit valid whenever the section / sub-section / product
  // changes under it (a stale unit would silently match no rows).
  useEffect(() => {
    if (activeUnit !== dashboard.unitOfMeasurement) {
      setFilter({ unitOfMeasurement: activeUnit }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit]);

  // Stock has no product list until its options fetch lands; seed the first
  // REAL product of the sub-section once it does.
  useEffect(() => {
    if (isStock && dashboard.productType == null && stockProductOptions[0]) {
      setFilter({ productType: stockProductOptions[0] }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStock, dashboard.productType, stockProductOptions[0]]);

  const onStockSubChange = (next) => {
    // Switching sub-section clears the product + unit: the previous product
    // very likely does not exist under the new sub-section (C8), and the
    // options fetch reseeds both from the data.
    setFilter(
      { subSection: next, productType: null, unitOfMeasurement: null },
      false,
    );
  };
  const onStockProductChange = (next) => {
    setFilter({ productType: next, unitOfMeasurement: null }, false);
  };

  const ready =
    !plantLoading &&
    plant &&
    Array.isArray(sections) &&
    Array.isArray(tabs) &&
    summary;

  // Time-range UI state. Default preset is "month".
  // Today → single-date equality (state.date). Month/Year/custom →
  // BETWEEN range (state.from + state.to).
  const [timeRange, setTimeRange] = useState({
    preset: "month",
    from: "",
    to: "",
  });

  // Shift selector state — independent of the preset granularity.
  // When the user picks a specific shift (A/B/C) that wins over the
  // preset; "all" lets the preset decide (Daily/MTD/YTD).
  const [shiftKey, setShiftKey] = useState("all");

  // Resolve the effective granularity from preset + shift selector.
  // realdata.md §3: real shift granularities are uppercase SHIFT A/B/C.
  const effectiveGranularity = (preset, shift) => {
    const map = { all: null, a: "SHIFT A", b: "SHIFT B", c: "SHIFT C" };
    const shiftGran = map[shift];
    if (shiftGran) return shiftGran;
    // changes.md §8: a custom calendar range must resolve to DAY (aggregate
    // DAY rows), NOT null. Pass the FULL timeRange (incl. from/to) so
    // presetToDateRange returns granularity="DAY" for a custom range; a
    // bare {preset} would drop the range and yield null → the "Daily"
    // fallback that never matches the real "DAY" rows.
    return presetToDateRange({ ...timeRange, preset }, asOf).granularity;
  };

  // Handlers ONLY update the UI state (pure functional updater so the
  // custom date dialog's sequential onFromChange→onToChange calls chain
  // correctly). The single effect below derives the fetch filter from
  // that state — this avoids dispatching setFilter inside a setState
  // updater (which StrictMode runs twice and dropped the update).
  const onTimeRangeChange = (updater) => {
    setTimeRange((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
  };

  const onShiftChange = (next) => {
    setShiftKey(next);
  };

  // Resolve the active range → fetch filter whenever the time range, the
  // shift, or the as-of date changes (also fires on mount, and again once
  // as-of loads so the window snaps to the latest available data date).
  // The shift only applies to Today, so it's ignored for Month/Year even
  // if a stale value lingers.
  useEffect(() => {
    // Wait for the as-of query to SETTLE before resolving the window. The
    // window depends on the as-of anchor, so firing before it loads sets a
    // system-clock range, then a corrected range once as-of arrives — two
    // landing fetches. Gating on !asOfLoading collapses that to one. (On
    // as-of error, asOf is null and presetToDateRange falls back to the
    // system clock, so this never stalls.)
    if (asOfLoading) return;
    const effShift = timeRange.preset === "today" ? shiftKey : "all";
    const resolved = presetToDateRange(timeRange, asOf);
    setFilter(
      {
        date: null,
        from: resolved.from,
        to: resolved.to,
        granularity: effectiveGranularity(timeRange.preset, effShift),
        mode: resolved.mode,
        // new_change.md C6: only a preset window is "no explicit date" —
        // a picked from/to is the user's own intent and must NOT be
        // re-anchored per KPI.
        userWindow: Boolean(timeRange.from && timeRange.to),
      },
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, shiftKey, asOf, asOfLoading]);

  const { from, to } = presetToDateRange(timeRange, asOf);

  const onSectionSelect = (id) => {
    // Entering Stock seeds the default sub-section + its first REAL product
    // (changes.md §4: no synthetic "Overall"); leaving Stock clears both so
    // other sections aren't accidentally scoped to a stale sub-section.
    if (id === "stk") {
      // new_change.md C8: the product is left unset — the sub-section's
      // options fetch seeds it with a REAL product from the data.
      setFilter(
        {
          section: id,
          subSection: STOCK_SUBSECTIONS[0],
          productType: null,
          unitOfMeasurement: null,
        },
        true,
      );
    } else {
      setFilter(
        {
          section: id,
          subSection: null,
          productType: SECTION_DEFAULT_PRODUCT[id] ?? null,
          unitOfMeasurement: null,
        },
        true,
      );
    }
  };
  const onCategorySelect = (id) => setFilter({ category: id }, true);

  // Ensure the active section always has a product type set (covers the
  // initial mount, where the default section has no product type yet).
  useEffect(() => {
    // Stock is seeded from its data-driven options (C8) in the effect above.
    if (dashboard.productType == null && !isStock) {
      const def = SECTION_DEFAULT_PRODUCT[dashboard.section];
      if (def) setFilter({ productType: def }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.section]);

  // Only one drill open at a time. Clicking a different card closes the
  // previous one; clicking the same card again closes it.
  const [openDrillKpiId, setOpenDrillKpiId] = useState(null);

  const handleDrillKpi = (kpi) => {
    if (!kpi.drillable) return;

    if (openDrillKpiId === kpi.id) {
      // Clicked the same card — close it.
      setOpenDrillKpiId(null);
      resetDrill();
      return;
    }

    // Different card (or first open) — switch.
    setOpenDrillKpiId(kpi.id);
    // new_change.md C3/C6: hand the CARD's resolved date to the drill so it
    // never re-resolves its own. Curing OEE anchors to 2026-07-16 while
    // Production runs to 07-20 — a drill that re-resolved would land on an
    // empty day and render dead.
    const cardDate = kpi.resolvedDate ?? null;
    if (PROD_DRILL_TYPES.has(kpi.drillType)) {
      // Production drills self-fetch (paginated, 100 rows per lens), so DON'T
      // trigger the generic 10k drill fetch. Pass an empty target list: the
      // reducer leaves drillKpis null (no fetch) but records drillSourceKpiId,
      // which drives the card's Batch→KG unit switch while drilled.
      drillInto([], kpi.id, {}, cardDate);
    } else if (kpi.drillTargets) {
      drillInto(kpi.drillTargets, kpi.id, {}, cardDate);
    } else {
      resetDrill();
    }
  };

  const handleCloseDrill = () => {
    setOpenDrillKpiId(null);
    resetDrill();
  };

  return (
    <Box
      ref={rootRef}
      sx={{
        height: exporting ? "auto" : "100vh",
        overflow: exporting ? "visible" : "hidden",
        backgroundColor: "background.default",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top region: header (logo + plant) with the category nav links
          directly below it. The page itself never scrolls — only the
          content card scrolls — so this stays fixed at the top. */}
      <Box sx={{ flexShrink: 0, zIndex: theme.zIndex.appBar }}>
        <ProductionHeader
          plant={plant}
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          shift={shiftKey}
          onShiftChange={onShiftChange}
          onExport={onExportPdf}
        />
        {Array.isArray(tabs) && (
          <CategoryTabs
            tabs={tabs}
            activeTabId={dashboard.category}
            onSelect={onCategorySelect}
          />
        )}
      </Box>

      {!ready ? (
        <ProductionBodySkeleton />
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: exporting ? "auto" : 0,
            overflow: exporting ? "visible" : "hidden",
            display: "grid",
            gridTemplateColumns:
              dashboard.category === "i"
                ? "1fr"
                : { xs: "1fr", md: "220px 1fr" },
            gap: 2,
            p: 2,
          }}
        >
          {dashboard.category !== "i" && (
            <Stack
              spacing={2}
              sx={{ height: exporting ? "auto" : "100%", minHeight: 0 }}
            >
              <Box
                sx={{
                  backgroundColor: "background.paper",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1.25,
                  p: 1,
                  flex: 1,
                  minHeight: 0,
                  overflowY: exporting ? "visible" : "auto",
                }}
              >
                <SectionSidebar
                  sections={sections}
                  activeSectionId={dashboard.section}
                  onSelect={onSectionSelect}
                  oeeBySectionId={sectionOeeById}
                />
              </Box>
              <PlantSummaryCard plant={plant} summary={summary} />
            </Stack>
          )}

          <Box
            sx={{
              backgroundColor: "background.paper",
              border: 1,
              borderColor: "divider",
              borderRadius: 1.25,
              boxShadow: theme.custom.shadow,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflowY: exporting ? "visible" : "auto",
            }}
          >
            {dashboard.category === "i" ? (
              <InventoryPage plantId="banmore" />
            ) : (
              <>
                {/* Section header row — title (left) + nav controls (right)
                    on ONE line, styled like the top nav bar with a
                    full-width border-bottom. The card has no padding, so
                    this row's own px insets the content while the border
                    still spans edge-to-edge. */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1.5,
                    flexWrap: "wrap",
                    px: 2,
                    py: 1.25,
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    sx={{ fontSize: 17, fontWeight: 700, whiteSpace: "nowrap" }}
                  >
                    {SECTION_TITLE[dashboard.section] ?? sectionName}
                  </Typography>

                  {/* Right: nav controls. Stock → sub-section selector;
                      Mixing/TBM/Curing (Productivity & Quality) → product
                      type pills. */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {isStock ? (
                      <NavTabs
                        items={STOCK_SUBSECTIONS.map((s) => ({
                          id: s,
                          label: s,
                        }))}
                        value={activeSubSection}
                        onChange={onStockSubChange}
                        layoutId="stockSubFill"
                      />
                    ) : (
                      (dashboard.category === "p" ||
                        dashboard.category === "q") &&
                      prodSubOptions.length > 0 && (
                        <NavTabs
                          items={prodSubOptions.map((o) => ({
                            id: o,
                            label: o,
                          }))}
                          // Selecting a product type sends it to the backend
                          // (server-side filter / real API call).
                          value={activeProductType}
                          onChange={(v) => setFilter({ productType: v }, false)}
                          layoutId="prodTypeFill"
                        />
                      )
                    )}
                  </Box>
                </Box>

                {/* Stock product-type pills — second row (BRD §13.3 two-step:
                    sub-section first, then product type). changes.md §4: only
                    the real products of the sub-section, no synthetic Overall. */}
                {(isStock || unitOptionsForProduct.length > 1) &&
                  dashboard.category === "p" && (
                    <Box
                      sx={{
                        px: 2,
                        py: 1.25,
                        borderBottom: 1,
                        borderColor: "divider",
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        flexWrap: "wrap",
                      }}
                    >
                      {isStock && (
                        <NavTabs
                          items={stockProductOptions.map((o) => ({
                            id: o,
                            label: o,
                          }))}
                          value={activeProductType}
                          onChange={onStockProductChange}
                          layoutId="stockProdFill"
                        />
                      )}
                      {/* new_change.md C8/C9: multi-unit series must pin a
                          unit — KG and Batch (Mixing), M and NOS (Stock
                          Extruder / 3 Roll / Bead) are different measures of
                          the same production and are never combined. */}
                      {unitOptionsForProduct.length > 1 && (
                        <NavTabs
                          items={unitOptionsForProduct.map((u) => ({
                            id: u,
                            label: u,
                          }))}
                          value={activeUnit}
                          onChange={(u) =>
                            setFilter({ unitOfMeasurement: u }, false)
                          }
                          layoutId="prodUnitFill"
                        />
                      )}
                    </Box>
                  )}

                <KpiGrid
                  kpis={kpis}
                  isLoading={kpiLoading}
                  error={kpiError}
                  openDrillKpiId={openDrillKpiId}
                  onDrillKpi={handleDrillKpi}
                  onCloseDrill={handleCloseDrill}
                  onTrendOpen={(kpi) => setTrendKpi(kpi)}
                />

                {/* Single drill panel for the currently selected card. */}
                {openDrillKpiId &&
                  (() => {
                    const kpi = kpis.find(
                      (k) => k.id === openDrillKpiId && k.drillable,
                    );
                    if (!kpi) return null;
                    // new_change.md C3/C6: the drill window IS the card's
                    // resolved day when the card anchored itself (C6);
                    // otherwise it is the card's from/to window verbatim.
                    const cardDate = kpi.resolvedDate ?? null;
                    return (
                      <Box sx={{ px: 2, pb: 2 }}>
                        <DrillPanelRouter
                          kpi={kpi}
                          plantId="banmore"
                          section={dashboard.section}
                          sectionName={sectionName}
                          cardDate={cardDate}
                          from={cardDate ?? from}
                          to={cardDate ?? to}
                          shift={dashboard.granularity}
                          allDrillRows={drillRows}
                          rawRows={rawRows}
                          prodSub={activeProductType}
                          unitPin={activeUnit}
                          mode={dashboard.mode}
                          isLoading={isDrillLoading}
                        />
                      </Box>
                    );
                  })()}

                {/* Shift Comparison — Productivity tab only, always pinned
                    at the bottom regardless of which card is drilled. */}
                {dashboard.category === "p" && (
                  <Box sx={{ px: 2, pb: 2 }}>
                    {/* new_change.md C11/C12: the shift box follows the
                        active time filter (Today/day-wise → the three
                        SHIFT rows for that date; Month-wise / custom range
                        → the daily shift rows SUMMED) and the full
                        dashboard scope (section, sub-section, product,
                        unit). */}
                    <ShiftComparisonCard
                      section={sectionName}
                      subSection={pinnedSubSection}
                      productType={activeProductType}
                      unit={activeUnit}
                      mode={timeRange.preset === "today" ? "day" : "range"}
                      date={timeRange.preset === "today" ? to : null}
                      from={timeRange.preset === "today" ? null : from}
                      to={timeRange.preset === "today" ? null : to}
                    />
                  </Box>
                )}
              </>
            )}
          </Box>
        </Box>
      )}

      <TrendModal
        open={Boolean(trendKpi)}
        onClose={() => setTrendKpi(null)}
        plantId="banmore"
        kpi={trendKpi}
        section={dashboard.section}
        category={dashboard.category}
        subSection={pinnedSubSection}
        productType={dashboard.productType}
        asOf={asOf}
      />
    </Box>
  );
}

/**
 * Routes to the appropriate drill panel based on `kpi.drillType`.
 * Matches artifact DrillPanel routing exactly.
 *
 * Dedicated panels (mixOEE, mixProd, tbmProd, stkProd, downtime, compliance, budget)
 * own their API calls. "table" type uses the specific table panel per kpi.id.
 */
function DrillPanelRouter({
  kpi,
  plantId,
  section,
  sectionName,
  // new_change.md C3/C6: the card's own resolved date, or null when the
  // card is showing an explicit range.
  cardDate = null,
  from,
  to,
  shift,
  allDrillRows,
  rawRows,
  prodSub,
  unitPin,
  mode,
  isLoading,
}) {
  if (!kpi) return null;

  // Drilldown inherits the card's granularity (journey.md §5): the panels
  // filter their rows to this exact granularity so the children always
  // match the card. `shift` carries the card's effective granularity
  // (DAY / SHIFT A-C / MONTH); fall back to DAY when none is set
  // (All-Shifts Today / custom range) — realdata.md §3.
  const granularity = shift ?? "DAY";

  // Filter drill rows to this KPI's drill TARGET kpi_names (children),
  // not the landing kpi_name itself. drillTargets is the list of child
  // kpi_names the panel needs to render (e.g. FTQ → ["FTQ_m"]).
  const drillTargets = kpi.drillTargets ?? [];
  const drillRows = (allDrillRows ?? []).filter((r) =>
    drillTargets.includes(r.kpiName),
  );

  switch (kpi.drillType) {
    // Productivity
    case "mixOEE":
    case "curOEE":
      return (
        <OeeDrillPanel
          section={section}
          rawRows={rawRows}
          mode={mode}
          granularity={granularity}
          // new_change.md C3/C6: OEE reads the rows already in hand, which
          // also carry the (newer) Production rows. Without the card's date
          // the panel's "latest date" collapses to Production's 07-20 and
          // drops every OEE row — the dead drill this change removes.
          cardDate={cardDate}
          isLoading={isLoading}
          // dashboard_doc.md §6: Curing inserts a trench (OEE_s) tier above
          // the press table. curOEE turns it on; mixOEE keeps the flat flow.
          trench={kpi.drillType === "curOEE"}
        />
      );
    case "mixProd":
    case "tbmProd":
    case "stkProd":
    case "curProd":
      return (
        <ProductionDrillPanel
          section={section}
          prodSub={prodSub}
          unitPin={unitPin}
          // rawRows only seeds the unit toggle; the table rows come from the
          // panel's own paginated per-lens fetch (from/to drive its window).
          rawRows={rawRows}
          granularity={granularity}
          from={from}
          to={to}
          isLoading={isLoading}
        />
      );
    case "downtime":
      return (
        <DowntimeDrillPanel
          section={section}
          rawRows={rawRows}
          mode={mode}
          granularity={granularity}
          isLoading={isLoading}
        />
      );
    case "budget":
      return (
        <BudgetDrillPanel
          plantId={plantId}
          section={section}
          from={from}
          to={to}
          shift={shift}
        />
      );
    // Scrap / Rework (Quality §4/§5): subsection → reason/machine/sku drill.
    case "qScrapRework":
      return (
        <ScrapReworkDrillPanel
          kind={kpi.rawName === "Rework" ? "Rework" : "Scrap"}
          drillRows={drillRows}
          mode={mode}
          granularity={granularity}
          isLoading={isLoading}
        />
      );
    // "table" type — route by kpi.id
    case "table":
      return (
        <GenericTableDrillPanel
          kpi={kpi}
          drillRows={drillRows}
          section={section}
          sectionName={sectionName}
          mode={mode}
          granularity={granularity}
          isLoading={isLoading}
        />
      );
    // null drillType — no drill panel
    case null:
    default:
      return null;
  }
}

export default BanmoreProduction;
