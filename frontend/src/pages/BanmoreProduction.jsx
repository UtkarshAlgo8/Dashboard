import { useEffect, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import SectionSidebar from "@/components/production/SectionSidebar.jsx";
import PlantSummaryCard from "@/components/production/PlantSummaryCard.jsx";
import CategoryTabs from "@/components/production/CategoryTabs.jsx";
import KpiGrid from "@/components/production/KpiGrid.jsx";
import ProductionBodySkeleton from "@/components/production/ProductionBodySkeleton.jsx";
import InventoryPage from "@/components/inventory/InventoryPage.jsx";
import TrendModal from "@/components/trend/TrendModal.jsx";
import OeeDrillPanel from "@/components/drills/oee/OeeDrillPanel.jsx";
import ProductionDrillPanel from "@/components/drills/production/ProductionDrillPanel.jsx";
import DowntimeDrillPanel from "@/components/drills/downtime/DowntimeDrillPanel.jsx";
import PlanComplianceDrillPanel from "@/components/drills/plan-compliance/PlanComplianceDrillPanel.jsx";
import GenericTableDrillPanel from "@/components/drills/shared/GenericTableDrillPanel.jsx";
import BudgetDrillPanel from "@/components/drills/shared/BudgetDrillPanel.jsx";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import {
  getPlant,
  getSections,
  getCategoryTabs,
  getPlantSummary,
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

  // CR-08: v2 dashboard fetch — owns section/category/granularity/date/drill state.
  const {
    state: dashboard,
    kpis,
    drillRows,
    rawRows,
    isLoading: kpiLoading,
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

  const onTimeRangeChange = (updater) => {
    setTimeRange((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const resolved = presetToDateRange(next);
      if (next.preset === "today") {
        setFilter(
          { date: resolved.from, from: null, to: null },
          false,
        );
      } else {
        setFilter(
          { date: null, from: resolved.from, to: resolved.to },
          false,
        );
      }
      return next;
    });
  };

  // Initial fetch: push the default "month" range into the hook on mount.
  useEffect(() => {
    const resolved = presetToDateRange(timeRange);
    setFilter({ date: null, from: resolved.from, to: resolved.to }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { from, to } = presetToDateRange(timeRange);

  const onShiftChange = (shift) => {
    const map = { all: null, a: "Shift A", b: "Shift B", c: "Shift C" };
    setFilter({ granularity: map[shift] ?? null }, false);
  };

  const onSectionSelect = (id) => setFilter({ section: id }, true);
  const onCategorySelect = (id) => setFilter({ category: id }, true);

  // Selected product-type pill, keyed by section so it auto-resets when
  // the user switches sections (no useEffect needed).
  const [prodSubBySection, setProdSubBySection] = useState({});
  const prodSub =
    prodSubBySection[dashboard.section] ?? prodSubOptions[0] ?? "";
  const setProdSub = (val) =>
    setProdSubBySection((prev) => ({ ...prev, [dashboard.section]: val }));

  // Section OEE shown in the header. Mirrors the transformer's logic
  // (Daily granularity only, mean of actual_value) so it stays in step
  // with the OEE card value on the Productivity tab.
  const sectionOee = (() => {
    if (!rawRows) return null;
    const oee = rawRows
      .filter(
        (r) =>
          r.section === sectionName &&
          r.kpi_name === "OEE_o" &&
          r.granularity === "Daily",
      )
      .map((r) => r.actual_value)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (oee.length === 0) return null;
    return oee.reduce((s, v) => s + v, 0) / oee.length;
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
        shift={
          dashboard.granularity?.startsWith("Shift")
            ? dashboard.granularity.slice(-1).toLowerCase()
            : "all"
        }
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
                          from={from}
                          to={to}
                          shift={dashboard.granularity}
                          allDrillRows={drillRows}
                          rawRows={rawRows}
                          prodSub={prodSub}
                        />
                      </Box>
                    );
                  })()}

                {/* Shift Comparison moved into the Plan Compliance drill panel
                    per the artifact — see PlanComplianceDrillPanel. */}
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
  from,
  to,
  shift,
  allDrillRows,
  rawRows,
  prodSub,
}) {
  if (!kpi) return null;

  // Filter drill rows to this KPI's gold_dummy kpi_name.
  const drillRows = (allDrillRows ?? []).filter(
    (r) => r.kpiName === kpi.rawName,
  );

  switch (kpi.drillType) {
    // Productivity
    case "mixOEE":
      return <OeeDrillPanel section={section} rawRows={rawRows} />;
    case "mixProd":
    case "tbmProd":
    case "stkProd":
      return (
        <ProductionDrillPanel
          section={section}
          prodSub={prodSub}
          rawRows={rawRows}
        />
      );
    case "downtime":
      return <DowntimeDrillPanel section={section} rawRows={rawRows} />;
    case "compliance":
      return (
        <PlanComplianceDrillPanel section={section} rawRows={rawRows} />
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
        />
      );
    // null drillType — no drill panel
    case null:
    default:
      return null;
  }
}

export default BanmoreProduction;
