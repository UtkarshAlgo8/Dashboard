import { useEffect, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import SectionSidebar from "@/components/production/SectionSidebar.jsx";
import PlantSummaryCard from "@/components/production/PlantSummaryCard.jsx";
import CategoryTabs from "@/components/production/CategoryTabs.jsx";
import KpiGrid from "@/components/production/KpiGrid.jsx";
import ProductionBodySkeleton from "@/components/production/ProductionBodySkeleton.jsx";
import ShiftComparisonCard from "@/components/production/ShiftComparisonCard.jsx";
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

  // Multiple drills can be open simultaneously (one per clicked card).
  const [openDrillKpis, setOpenDrillKpis] = useState(new Set());

  const handleDrillKpi = (kpi) => {
    if (!kpi.drillable) return;

    // Toggle open state locally.
    setOpenDrillKpis((prev) => {
      const next = new Set(prev);
      if (next.has(kpi.id)) {
        next.delete(kpi.id);
      } else {
        next.add(kpi.id);
      }
      return next;
    });

    // Trigger drill data fetch via useDashboardFetch.
    if (kpi.drillTargets) {
      drillInto(kpi.drillTargets, kpi.id);
    }
  };

  const handleCloseDrill = (kpiId) => {
    setOpenDrillKpis((prev) => {
      const next = new Set(prev);
      next.delete(kpiId);
      if (next.size === 0) resetDrill();
      return next;
    });
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
                  openDrillKpis={openDrillKpis}
                  onDrillKpi={handleDrillKpi}
                  onCloseDrill={handleCloseDrill}
                  onTrendOpen={(kpi) => setTrendKpi(kpi)}
                />

                {/* All open drill panels — one per clicked card. Matches artifact. */}
                {openDrillKpis.size > 0 && (
                  <Box
                    sx={{
                      px: 2,
                      pb: 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {kpis
                      .filter((k) => openDrillKpis.has(k.id) && k.drillable)
                      .map((kpi) => (
                        <DrillPanelRouter
                          key={kpi.id}
                          kpi={kpi}
                          plantId="banmore"
                          section={dashboard.section}
                          stockSelector={null}
                          from={from}
                          to={to}
                          shift={dashboard.granularity}
                          allDrillRows={drillRows}
                        />
                      ))}
                  </Box>
                )}

                {/* Shift Comparison — Productivity tab only, below drill panels. */}
                {dashboard.category === "p" && (
                  <Box sx={{ px: 2, pb: 2 }}>
                    <ShiftComparisonCard
                      section={sectionName}
                      rows={rawRows ?? []}
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
  stockSelector,
  from,
  to,
  shift,
  allDrillRows,
}) {
  if (!kpi) return null;

  // Filter drill rows to this KPI's gold_dummy kpi_name.
  const drillRows = (allDrillRows ?? []).filter(
    (r) => r.kpiName === kpi.rawName,
  );

  switch (kpi.drillType) {
    // Productivity
    case "mixOEE":
      return (
        <OeeDrillPanel
          plantId={plantId}
          section={section}
          from={from}
          to={to}
          shift={shift}
        />
      );
    case "mixProd":
    case "tbmProd":
    case "stkProd":
      return (
        <ProductionDrillPanel
          plantId={plantId}
          section={section}
          stockSelector={stockSelector}
          from={from}
          to={to}
          shift={shift}
        />
      );
    case "downtime":
      return (
        <DowntimeDrillPanel
          plantId={plantId}
          section={section}
          from={from}
          to={to}
          shift={shift}
        />
      );
    case "compliance":
      return (
        <PlanComplianceDrillPanel
          plantId={plantId}
          section={section}
          from={from}
          to={to}
          shift={shift}
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
        />
      );
    // null drillType — no drill panel
    case null:
    default:
      return null;
  }
}

export default BanmoreProduction;
