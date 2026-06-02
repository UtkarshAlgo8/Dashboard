import { useEffect, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import SectionSidebar from "@/components/production/SectionSidebar.jsx";
import PlantSummaryCard from "@/components/production/PlantSummaryCard.jsx";
import CategoryTabs from "@/components/production/CategoryTabs.jsx";
import KpiGrid from "@/components/production/KpiGrid.jsx";
import StockSubSelector from "@/components/production/StockSubSelector.jsx";
import ProductionBodySkeleton from "@/components/production/ProductionBodySkeleton.jsx";
import ShiftComparisonCard from "@/components/production/ShiftComparisonCard.jsx";
import InventoryPage from "@/components/inventory/InventoryPage.jsx";
import TrendModal from "@/components/trend/TrendModal.jsx";
import OeeDrillPanel from "@/components/drills/oee/OeeDrillPanel.jsx";
import ProductionDrillPanel from "@/components/drills/production/ProductionDrillPanel.jsx";
import DowntimeDrillPanel from "@/components/drills/downtime/DowntimeDrillPanel.jsx";
import GenericTableDrillPanel from "@/components/drills/shared/GenericTableDrillPanel.jsx";
import BudgetDrillPanel from "@/components/drills/shared/BudgetDrillPanel.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import {
  getPlant,
  getSections,
  getCategoryTabs,
  getPlantSummary,
  getAsOf,
} from "@/api/plants.js";
import { useDashboardFetch } from "@/hooks/useDashboardFetch.js";
import { presetToDateRange } from "@/lib/timeRange.js";

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
  const { data: asOfData } = usePolledQuery(() => getAsOf("banmore"), {
    interval: 0,
  });
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

  const sectionName = { mix: "Mixing", stk: "Stock", tbm: "TBM", cur: "Curing" }[
    dashboard.section
  ] ?? dashboard.section;

  // Section metadata per artifact (full title shown in section header).
  const SECTION_TITLE = {
    mix: "Mixing / Banbury",
    tbm: "Tyre Building Machine",
    cur: "Curing / Vulcanization",
    stk: "Stock / Component Prep",
  };

  // Product-type / sub-category pills per artifact buildKpis().
  // Banmore is PCR-only (FR-X2) so for TBM/Curing the radial-type pills
  // are UI selectors only — the data scope doesn't change.
  const PROD_SUB_OPTIONS = {
    mix: ["Master Compound", "Final Compound"],
    tbm: ["Passenger Radial", "LT Radial", "SCV Radial"],
    cur: ["Passenger Radial", "LT Radial", "SCV Radial"],
    stk: [], // Stock uses sub-section selector (4 Roll / Extruder / ...)
  };
  const prodSubOptions = PROD_SUB_OPTIONS[dashboard.section] ?? [];

  // Stock sub-sections (BRD §13.2) and the product types each one carries
  // (BRD §13.3). The first sub-section is the default on entering Stock.
  const STOCK_SUBSECTIONS = ["4 Roll", "Extruder", "3 Roll", "Cutter", "Slitter"];
  const STOCK_PRODUCT_TYPES = {
    "4 Roll": ["Rubberised Ply", "Rubberised Belt"],
    Extruder: ["Sidewall", "Tread"],
    "3 Roll": ["Inner Liner"],
    Cutter: ["Belt", "Ply"],
    Slitter: ["Cap Strip", "Chafer"],
  };
  const isStock = dashboard.section === "stk";
  const activeSubSection = dashboard.subSection ?? STOCK_SUBSECTIONS[0];
  // "Overall" = the sub-section total row (shown when no specific product
  // type is selected). The pill row prepends it to the real product types.
  const activeProductType = dashboard.productType ?? "Overall";
  const stockProductOptions = ["Overall", ...(STOCK_PRODUCT_TYPES[activeSubSection] ?? [])];

  const onStockSubChange = (next) => {
    // Switching sub-section resets the product type back to the sub-section
    // total — the previous product type may not exist under the new one.
    setFilter({ subSection: next, productType: "Overall" }, false);
  };
  const onStockProductChange = (next) => {
    setFilter({ productType: next }, false);
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
  const effectiveGranularity = (preset, shift) => {
    const map = { all: null, a: "Shift A", b: "Shift B", c: "Shift C" };
    const shiftGran = map[shift];
    if (shiftGran) return shiftGran;
    return presetToDateRange({ preset }, asOf).granularity;
  };

  const onTimeRangeChange = (updater) => {
    setTimeRange((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const resolved = presetToDateRange(next, asOf);
      const gran = effectiveGranularity(next.preset, shiftKey);
      setFilter(
        {
          date: null,
          from: resolved.from,
          to: resolved.to,
          granularity: gran,
          mode: resolved.mode,
        },
        false,
      );
      return next;
    });
  };

  // Push the current range into the hook on mount AND whenever the as-of
  // date resolves (the window is anchored to it). Until as-of loads this
  // falls back to the system clock; once it arrives the window snaps to
  // the latest available data date.
  useEffect(() => {
    const resolved = presetToDateRange(timeRange, asOf);
    setFilter(
      {
        date: null,
        from: resolved.from,
        to: resolved.to,
        granularity: effectiveGranularity(timeRange.preset, shiftKey),
        mode: resolved.mode,
      },
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf]);

  const { from, to } = presetToDateRange(timeRange, asOf);

  const onShiftChange = (next) => {
    setShiftKey(next);
    setFilter(
      { granularity: effectiveGranularity(timeRange.preset, next) },
      false,
    );
  };

  const onSectionSelect = (id) => {
    // Entering Stock seeds the default sub-section + "Overall" product type
    // (BRD §13.2/§13.3); leaving Stock clears both so other sections aren't
    // accidentally scoped to a stale sub-section.
    if (id === "stk") {
      setFilter(
        { section: id, subSection: STOCK_SUBSECTIONS[0], productType: "Overall" },
        true,
      );
    } else {
      setFilter({ section: id, subSection: null, productType: null }, true);
    }
  };
  const onCategorySelect = (id) => setFilter({ category: id }, true);

  // Selected product-type pill, keyed by section so it auto-resets when
  // the user switches sections (no useEffect needed).
  const [prodSubBySection, setProdSubBySection] = useState({});
  const prodSub =
    prodSubBySection[dashboard.section] ?? prodSubOptions[0] ?? "";
  const setProdSub = (val) =>
    setProdSubBySection((prev) => ({ ...prev, [dashboard.section]: val }));

  // Section OEE shown in the header — mirrors the OEE card so the
  // user sees consistent numbers. For snapshot mode (Today/Month/Year)
  // pick the latest row at the active granularity; for aggregate mode
  // (custom range) average Daily rows like the card does.
  const sectionOee = (() => {
    if (!rawRows) return null;
    const gran = dashboard.granularity ?? "Daily";
    const filtered = rawRows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === "OEE_o" &&
        r.granularity === gran &&
        // For Stock, scope the header OEE to the active sub-section so it
        // matches the OEE card (OEE rows carry sub_section, empty product_type).
        (!dashboard.subSection || r.sub_section === dashboard.subSection),
    );
    if (filtered.length === 0) return null;
    if (dashboard.mode === "snapshot") {
      // Latest row's actual_value.
      const sorted = [...filtered].sort((a, b) =>
        (b.date ?? "").localeCompare(a.date ?? ""),
      );
      const v = sorted[0]?.actual_value;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    const vals = filtered
      .map((r) => r.actual_value)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  })();

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
    if (kpi.drillTargets) {
      drillInto(kpi.drillTargets, kpi.id);
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
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ProductionHeader
        plant={plant}
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
        shift={shiftKey}
        onShiftChange={onShiftChange}
      />

      {!ready ? (
        <ProductionBodySkeleton />
      ) : (
        <Box
          sx={{
            flex: 1,
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
            <Stack spacing={2} sx={{ height: "100%" }}>
              <Box
                sx={{
                  backgroundColor: "background.paper",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1.25,
                  p: 1,
                  flex: 1,
                }}
              >
                <SectionSidebar
                  sections={sections}
                  activeSectionId={dashboard.section}
                  onSelect={onSectionSelect}
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
            }}
          >
            <CategoryTabs
              tabs={tabs}
              activeTabId={dashboard.category}
              onSelect={onCategorySelect}
            />
            {dashboard.category === "i" ? (
              <InventoryPage plantId="banmore" />
            ) : (
              <>
                {/* Section header — section full name + OEE + category badge */}
                <Box
                  sx={{
                    px: 2,
                    pt: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                  }}
                >
                  <Typography sx={{ fontSize: 17, fontWeight: 700 }}>
                    {SECTION_TITLE[dashboard.section] ?? sectionName}
                  </Typography>
                  {sectionOee != null && (
                    <>
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor:
                            sectionOee >= 90
                              ? "success.main"
                              : sectionOee >= 80
                                ? "warning.main"
                                : "error.main",
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 600,
                          color:
                            sectionOee >= 90
                              ? "success.main"
                              : sectionOee >= 80
                                ? "warning.main"
                                : "error.main",
                        }}
                      >
                        {sectionOee.toFixed(1)}% OEE
                      </Typography>
                    </>
                  )}
                  {tabs?.find((t) => t.id === dashboard.category) && (
                    <Box
                      sx={{
                        fontSize: 12,
                        fontWeight: 700,
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        backgroundColor: "primary.main",
                        color: "primary.contrastText",
                        opacity: 0.9,
                      }}
                    >
                      {tabs.find((t) => t.id === dashboard.category)?.name ??
                        ""}
                    </Box>
                  )}
                </Box>

                {/* Stock sub-section + product-type selectors (BRD §13.2/§13.3).
                    Shown on EVERY tab for Stock — the sub-section filters all
                    KPIs; the product type scopes the production KPIs (with
                    "Overall" = the sub-section total). */}
                {isStock && (
                  <Stack spacing={1} sx={{ px: 2, pt: 1.5 }}>
                    <StockSubSelector
                      value={activeSubSection}
                      onChange={onStockSubChange}
                    />
                    <Box
                      sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}
                    >
                      {stockProductOptions.map((opt) => {
                        const active = activeProductType === opt;
                        return (
                          <Box
                            key={opt}
                            onClick={() => onStockProductChange(opt)}
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 999,
                              border: 1,
                              borderColor: active ? "primary.main" : "divider",
                              backgroundColor: active
                                ? "primary.50"
                                : "background.paper",
                              color: active ? "primary.main" : "text.primary",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            {opt}
                          </Box>
                        );
                      })}
                    </Box>
                  </Stack>
                )}

                {/* Product-type sub-pills — Productivity & Quality tabs only */}
                {(dashboard.category === "p" ||
                  dashboard.category === "q") &&
                  prodSubOptions.length > 0 && (
                    <Box
                      sx={{
                        px: 2,
                        pt: 1,
                        display: "flex",
                        gap: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      {prodSubOptions.map((opt) => {
                        const active = prodSub === opt;
                        return (
                          <Box
                            key={opt}
                            onClick={() => setProdSub(opt)}
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 999,
                              border: 1,
                              borderColor: active
                                ? "primary.main"
                                : "divider",
                              backgroundColor: active
                                ? "primary.50"
                                : "background.paper",
                              color: active ? "primary.main" : "text.primary",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            {opt}
                          </Box>
                        );
                      })}
                    </Box>
                  )}

                {/* Drill hint — matches artifact "▶ Click any KPI card to expand drill-down" */}
                <Box sx={{ px: 2, pt: 2 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "warning.main",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    Click any KPI card to expand drill-down
                  </Typography>
                </Box>

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
                    return (
                      <Box sx={{ px: 2, pb: 2 }}>
                        <DrillPanelRouter
                          kpi={kpi}
                          plantId="banmore"
                          section={dashboard.section}
                          sectionName={sectionName}
                          from={from}
                          to={to}
                          shift={dashboard.granularity}
                          allDrillRows={drillRows}
                          rawRows={rawRows}
                          prodSub={prodSub}
                          isLoading={isDrillLoading}
                        />
                      </Box>
                    );
                  })()}

                {/* Shift Comparison — Productivity tab only, always pinned
                    at the bottom regardless of which card is drilled. */}
                {dashboard.category === "p" && (
                  <Box sx={{ px: 2, pb: 2 }}>
                    <ShiftComparisonCard
                      section={sectionName}
                      rows={rawRows ?? []}
                      subSection={dashboard.subSection}
                      productType={dashboard.productType}
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
        subSection={dashboard.subSection}
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
  from,
  to,
  shift,
  allDrillRows,
  rawRows,
  prodSub,
  isLoading,
}) {
  if (!kpi) return null;

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
      return (
        <OeeDrillPanel
          section={section}
          rawRows={rawRows}
          isLoading={isLoading}
        />
      );
    case "mixProd":
    case "tbmProd":
    case "stkProd":
      return (
        <ProductionDrillPanel
          section={section}
          prodSub={prodSub}
          rawRows={rawRows}
          isLoading={isLoading}
        />
      );
    case "downtime":
      return (
        <DowntimeDrillPanel
          section={section}
          rawRows={rawRows}
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
    // "table" type — route by kpi.id
    case "table":
      return (
        <GenericTableDrillPanel
          kpi={kpi}
          drillRows={drillRows}
          section={section}
          sectionName={sectionName}
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
