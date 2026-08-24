import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import JKLoader from "@/components/JKLoader.jsx";
import SectionSidebar from "@/components/production/SectionSidebar.jsx";
import PlantSummaryCard from "@/components/production/PlantSummaryCard.jsx";
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
import { getAnchors, getVocab } from "@/api/dashboard.js";
import { useDashboardFetch } from "@/hooks/useDashboardFetch.js";
import { presetToDateRange } from "@/lib/timeRange.js";
import { canonicalUnit } from "@/lib/kpi-transformer.js";
import { canonicalizeProductType } from "@/lib/dashboardRowScopes.js";
import client from "@/api/client.js";
import { exportElementToPdf } from "@/lib/exportPdf.js";

// Production drill types render ProductionDrillPanel, which owns its own
// paginated per-lens fetch — so drilling them must NOT kick off the generic
// 10k-row drill fetch in useDashboardFetch.
const PROD_DRILL_TYPES = new Set(["mixProd", "tbmProd", "stkProd", "curProd"]);

function stableOptionsKey(value) {
  if (Array.isArray(value)) return `[${value.map(stableOptionsKey).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableOptionsKey(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function latestIsoDate(values) {
  if (!Array.isArray(values)) return null;
  return (
    values
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort()
      .at(-1) ?? null
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
  const { plantId: routePlantId } = useParams();
  const plantId = routePlantId ?? "banmore";
  // Several pickers below carry Banmore's own vocabulary as a frozen list
  // (compound types, Stock sub-sections). They only apply to Banmore — every
  // other plant is driven from its own data, see `vocab` / product-options.
  const isBanmore = plantId === "banmore";
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
        filename: `${plantId}-production.pdf`,
        backgroundColor: theme.palette.background.default,
      });
    } finally {
      setExporting(false);
    }
  };

  const { data: plant, isLoading: plantLoading } = usePolledQuery(
    () => getPlant(plantId),
    { interval: 0, deps: [plantId] },
  );
  const { data: sections } = usePolledQuery(getSections, {
    interval: 0,
    cacheKey: "production:sections",
    staleTime: 30 * 60 * 1000,
  });
  // The plant's OWN vocabulary — the Stock sub-section pills and the
  // product-type pills are built from it. A frozen Banmore list picks a
  // sub-section / product CTP never records, and the section renders empty.
  const { data: vocab } = usePolledQuery(() => getVocab(plantId), {
    interval: 0,
    deps: [plantId],
    keepPreviousData: true,
    cacheKey: `production:${plantId}:vocab`,
    staleTime: 30 * 60 * 1000,
  });
  const { data: tabs } = usePolledQuery(getCategoryTabs, {
    interval: 0,
    cacheKey: "production:category-tabs",
    staleTime: 30 * 60 * 1000,
  });
  // As-of date (BRD §13.5) — anchor for all time-range windows so values
  // render even when the calendar runs ahead of the available data.
  const { data: asOfData, isLoading: asOfLoading } = usePolledQuery(
    () => getAsOf(plantId),
    {
      interval: 0,
      deps: [plantId],
      keepPreviousData: true,
      cacheKey: `production:${plantId}:as-of`,
      staleTime: 15 * 60 * 1000,
    },
  );
  const asOf = asOfData?.asOf ?? null;
  const { data: anchorData, isLoading: anchorsLoading } = usePolledQuery(
    () => getAnchors(plantId),
    {
      interval: 0,
      deps: [plantId],
      keepPreviousData: true,
      cacheKey: `production:${plantId}:anchors`,
      staleTime: 15 * 60 * 1000,
    },
  );
  const fallbackAsOf = latestIsoDate(Object.values(anchorData?.anchors ?? {}));
  const effectiveAsOf = asOf ?? fallbackAsOf;

  // CR-08: v2 dashboard fetch — owns section/category/granularity/date/drill state.
  const {
    state: dashboard,
    kpis,
    drillRows,
    rawRows,
    downtimeRows,
    isLoading: kpiLoading,
    isDrillLoading,
    lastUpdatedAt,
    error: kpiError,
    setFilter,
    drillInto,
    resetDrill,
    resetAll,
  } = useDashboardFetch({ plantId });

  useEffect(() => {
    resetAll();
  }, [plantId, resetAll]);

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
  const oeeGran = dashboard.granularity ?? "MONTH";
  const { data: sectionOeeData, isLoading: sectionOeeLoading } = usePolledQuery(
    () => getSectionOee(plantId, oeeGran, dashboard.from, dashboard.to),
    {
      interval: 0,
      enabled: hasDateRange,
      deps: [plantId, oeeGran, dashboard.from, dashboard.to, hasDateRange],
      keepPreviousData: true,
      cacheKey: `production:${plantId}:section-oee:${oeeGran}:${dashboard.from ?? ""}:${dashboard.to ?? ""}`,
      staleTime: 2 * 60 * 1000,
    },
  );
  // Every ring shows the section's OVERALL OEE (+ A/P/Q breakdown for the
  // hover tooltip) from the section-oee endpoint, scoped to the SELECTED
  // window (from/to) so the rings track the chosen month. It is NOT scoped by
  // the selected sub-section / product / unit, so it stays put while the user
  // navigates between sections.
  const sectionStatsById = {
    mix: sectionOeeData?.Mixing ?? null,
    stk: sectionOeeData?.Stock ?? null,
    tbm: sectionOeeData?.TBM ?? null,
    cur: sectionOeeData?.Curing ?? null,
  };

  // Plant summary card (bottom-left): plant-level OEE_p + FTQ/Scrap, scoped to
  // the SELECTED window so the headline OEE tracks the chosen month.
  const { data: summary, isLoading: summaryLoading } = usePolledQuery(
    () => getPlantSummary(plantId, dashboard.from, dashboard.to),
    {
      interval: 0,
      enabled: hasDateRange,
      deps: [plantId, dashboard.from, dashboard.to, hasDateRange],
      keepPreviousData: true,
      cacheKey: `production:${plantId}:summary:${dashboard.from ?? ""}:${dashboard.to ?? ""}`,
      staleTime: 2 * 60 * 1000,
    },
  );

  // Section metadata (simplified names shown in subheader)
  const SECTION_TITLE = {
    mix: "Mixing",
    tbm: "Tyre Building",
    cur: "Curing",
    stk: "Stock",
  };

  // Product-type / sub-category pills per artifact buildKpis().
  // Product types per section, from the gold data. The first entry is the
  // default (the section-level "overall" where one exists). Selecting one
  // sends product_type to the backend — a real, server-side-filtered API
  // call (no client-side fallback).
  const PROD_SUB_OPTIONS = {
    mix: ["Master Compound", "Final Compound"],
    tbm: ["Green Tyre", "Passenger Radial", "LCV"],
    cur: ["Cured Tyre", "Passenger Radial", "LCV"],
    stk: [], // Stock uses the sub-section selector + its own product types.
  };
  const SECTION_DEFAULT_PRODUCT = {
    mix: "Master Compound",
    tbm: "Green Tyre",
    cur: "Cured Tyre",
    stk: null,
  };
  const prodSubOptions = isBanmore
    ? (PROD_SUB_OPTIONS[dashboard.section] ?? [])
    : [];
  const sectionDefaultProduct = isBanmore ? SECTION_DEFAULT_PRODUCT : {};

  // Tyre lines come from the plant lookup (Banmore: ["PCR"] → the header
  // renders a static badge; CTP: ["All","PCR","TBR"] → a picker). Until it
  // lands, assume a single PCR line so the badge doesn't flash a picker.
  const tyreTypes = plant?.tyreTypes?.length ? plant.tyreTypes : ["PCR"];
  const activeTyreType = tyreTypes.includes(dashboard.tyreType)
    ? dashboard.tyreType
    : tyreTypes[0];

  const BANMORE_STOCK_SUBSECTIONS = [
    "4 Roll",
    "Extruder",
    "3 Roll",
    "Cutter",
    "Slitter",
    "Bead",
  ];
  const vocabStockSubs = vocab?.subSections?.Stock ?? [];
  const STOCK_SUBSECTIONS = isBanmore
    ? BANMORE_STOCK_SUBSECTIONS
    : vocabStockSubs;
  const isStock = dashboard.section === "stk";
  const activeSubSection = dashboard.subSection ?? STOCK_SUBSECTIONS[0];
  const pinnedSubSection = isStock ? activeSubSection : dashboard.subSection;

  const optionsPayload = {
    plantId,
    context: {
      section: sectionName,
      category: "Productivity",
      ...(isStock ? { sub_section: activeSubSection } : {}),
      ...(activeTyreType && activeTyreType !== "All"
        ? { tyre_type: activeTyreType }
        : {}),
    },
    limit: 1000,
  };
  const currentOptionsKey = stableOptionsKey(optionsPayload);
  const { data: productionOptionsData } = usePolledQuery(
    () => {
      const key = stableOptionsKey(optionsPayload);
      return client
        .post("/dashboard/product-options", optionsPayload)
        .then((rows) => ({
          key,
          options: Array.isArray(rows)
            ? rows
                .map((row) => ({
                  productType: row.productType ?? null,
                  unit: canonicalUnit(row.unit),
                }))
                .sort(
                  (a, b) =>
                    (a.productType ?? "").localeCompare(b.productType ?? "") ||
                    (a.unit ?? "").localeCompare(b.unit ?? ""),
                )
            : [],
        }));
    },
    {
      enabled: hasDateRange && dashboard.category === "p",
      interval: 0,
      keepPreviousData: true,
      cacheKey: `production:${currentOptionsKey}:product-options`,
      staleTime: 15 * 60 * 1000,
      deps: [JSON.stringify(optionsPayload)],
    },
  );

  const productionOptions =
    productionOptionsData?.key === currentOptionsKey &&
    Array.isArray(productionOptionsData.options)
      ? productionOptionsData.options
      : [];

  const nonStockProductOptions = [
    ...new Set(
      productionOptions
        .map((o) => o.productType)
        .filter(Boolean)
        .filter((p) => p.trim().toLowerCase() !== "unknown"),
    ),
  ];

  const stockProductOptions = [...nonStockProductOptions];
  const navProductOptions = isStock
    ? stockProductOptions
    : [...new Set([...prodSubOptions, ...nonStockProductOptions])];

  const activeProductType =
    dashboard.productType ??
    (isStock
      ? (stockProductOptions[0] ?? null)
      : (navProductOptions[0] ?? sectionDefaultProduct[dashboard.section]));

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

  const unitsInWindow = new Set(
    (Array.isArray(rawRows) ? rawRows : [])
      .filter(
        (r) =>
          !activeProductType ||
          canonicalizeProductType(r.product_type) ===
            canonicalizeProductType(activeProductType),
      )
      .map((r) => canonicalUnit(r.unit_of_measurement))
      .filter(Boolean),
  );
  const activeUnit =
    dashboard.unitOfMeasurement &&
    unitOptionsForProduct.includes(dashboard.unitOfMeasurement)
      ? dashboard.unitOfMeasurement
      : (unitOptionsForProduct.find((u) => unitsInWindow.has(u)) ??
        unitOptionsForProduct[0] ??
        null);

  useEffect(() => {
    if (activeUnit !== dashboard.unitOfMeasurement) {
      setFilter({ unitOfMeasurement: activeUnit }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit]);

  useEffect(() => {
    if (!isStock) return;
    const first = stockProductOptions[0];
    if (!first) return;
    if (
      dashboard.productType == null ||
      !stockProductOptions.includes(dashboard.productType)
    ) {
      setFilter({ productType: first, unitOfMeasurement: null }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStock, dashboard.productType, stockProductOptions.join("|")]);

  useEffect(() => {
    if (isStock || navProductOptions.length === 0) return;
    if (
      !dashboard.productType ||
      !navProductOptions.includes(dashboard.productType)
    ) {
      setFilter(
        { productType: navProductOptions[0], unitOfMeasurement: null },
        false,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStock, dashboard.productType, navProductOptions.join("|")]);

  const ready =
    !plantLoading &&
    plant &&
    Array.isArray(sections) &&
    Array.isArray(tabs) &&
    summary;

  const contentLoading =
    dashboard.category !== "i" &&
    (kpiLoading || sectionOeeLoading || summaryLoading);

  const bodyLoading =
    dashboard.category !== "i" && (sectionOeeLoading || summaryLoading);
  const contentOnlyLoading = contentLoading && !bodyLoading;

  const [timeRange, setTimeRange] = useState({
    preset: "month",
    from: "",
    to: "",
  });

  const shiftKey = "all";

  const effectiveGranularity = (preset, shift) => {
    const map = { all: null, a: "SHIFT A", b: "SHIFT B", c: "SHIFT C" };
    const shiftGran = map[shift];
    if (shiftGran) return shiftGran;
    return presetToDateRange({ ...timeRange, preset }, effectiveAsOf)
      .granularity;
  };

  const onTimeRangeChange = (updater) => {
    setTimeRange((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
  };

  useEffect(() => {
    if ((asOfLoading || anchorsLoading) && !effectiveAsOf) return;
    if (!effectiveAsOf) return;
    const effShift = timeRange.preset === "today" ? shiftKey : "all";
    const resolved = presetToDateRange(timeRange, effectiveAsOf);
    setFilter(
      {
        date: null,
        from: resolved.from,
        to: resolved.to,
        granularity: effectiveGranularity(timeRange.preset, effShift),
        mode: resolved.mode,
        userWindow: Boolean(timeRange.from && timeRange.to),
      },
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, shiftKey, effectiveAsOf, asOfLoading, anchorsLoading]);

  const { from, to } = presetToDateRange(timeRange, effectiveAsOf);

  const onSectionSelect = (id) => {
    if (id === "stk") {
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
          productType: sectionDefaultProduct[id] ?? null,
          unitOfMeasurement: null,
        },
        true,
      );
    }
  };
  const onCategorySelect = (id) => setFilter({ category: id }, true);

  useEffect(() => {
    if (dashboard.productType == null && !isStock) {
      const def = sectionDefaultProduct[dashboard.section];
      if (def) setFilter({ productType: def }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.section]);

  const [openDrillKpiId, setOpenDrillKpiId] = useState(null);

  const handleDrillKpi = (kpi) => {
    if (!kpi.drillable) return;

    if (openDrillKpiId === kpi.id) {
      setOpenDrillKpiId(null);
      resetDrill();
      return;
    }

    setOpenDrillKpiId(kpi.id);
    const cardDate = kpi.resolvedDate ?? null;
    if (PROD_DRILL_TYPES.has(kpi.drillType)) {
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

  useEffect(() => {
    if (!openDrillKpiId) return;
    if (dashboard.drillSourceKpiId === openDrillKpiId) return;
    const kpi = kpis.find((k) => k.id === openDrillKpiId && k.drillable);
    if (!kpi) return;
    const cardDate = kpi.resolvedDate ?? null;
    if (PROD_DRILL_TYPES.has(kpi.drillType)) {
      drillInto([], kpi.id, {}, cardDate);
    } else if (kpi.drillTargets) {
      drillInto(kpi.drillTargets, kpi.id, {}, cardDate);
    }
  }, [openDrillKpiId, kpis, dashboard.drillSourceKpiId, drillInto]);

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
      {/* Top Header: Row 1 Brand/User Navbar, Row 2 Floating Filter Bar */}
      <Box sx={{ flexShrink: 0, zIndex: theme.zIndex.appBar }}>
        <ProductionHeader
          plant={plant}
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          onExport={onExportPdf}
          asOf={effectiveAsOf}
          lastUpdatedAt={lastUpdatedAt}
          categoryTabs={tabs}
          activeCategory={dashboard.category}
          onCategoryChange={onCategorySelect}
          tyreTypes={["All", "PCR", "TBR"]}
          tyreType={dashboard.tyreType || "All"}
          onTyreTypeChange={(v) =>
            setFilter({ tyreType: v === "All" ? null : v }, false)
          }
        />
      </Box>

      {!ready ? (
        <ProductionBodySkeleton />
      ) : (
        <Box
          sx={{
            position: "relative",
            flex: 1,
            minHeight: exporting ? "auto" : 0,
            overflow: exporting ? "visible" : "hidden",
            display: "grid",
            gridTemplateColumns:
              dashboard.category === "i"
                ? "1fr"
                : { xs: "1fr", md: "320px 1fr" },
            gap: dashboard.category === "i" ? 0 : 2.5,
            px: dashboard.category === "i" ? 0 : { xs: 2, md: 3 },
            py: dashboard.category === "i" ? 0 : 2,
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
                  borderRadius: 2.5,
                  flex: 1,
                  minHeight: 0,
                  overflowY: exporting ? "visible" : "auto",
                  boxShadow: theme.custom.shadow,
                }}
              >
                <SectionSidebar
                  sections={sections}
                  activeSectionId={dashboard.section}
                  onSelect={onSectionSelect}
                  statsBySectionId={sectionStatsById}
                  loading={false}
                />
              </Box>
              <PlantSummaryCard
                plant={plant}
                summary={summary}
                loading={false}
              />
            </Stack>
          )}

          {/* Main Content Column */}
          <Box
            sx={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              height: exporting ? "auto" : "100%",
              minHeight: 0,
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                height: exporting ? "auto" : "100%",
                minHeight: 0,
                overflow: exporting
                  ? "visible"
                  : dashboard.category === "i"
                    ? "hidden"
                    : "auto",
              }}
            >
              {dashboard.category === "i" ? (
                <InventoryPage plantId={plantId} />
              ) : (
                <>
                  {/* Section subheader row — Title (left) + Type & UoM pills (right) */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1.5,
                      flexWrap: "wrap",
                      px: 2,
                      py: 1.25,
                      mx: 0,
                      mt: 0,
                      mb: 0,
                      backgroundColor: "background.paper",
                      borderRadius: 2.5,
                      border: 1,
                      borderColor: "rgba(0,0,0,0.06)",
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 19,
                        fontWeight: 700,
                        color: "text.primary",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {`${SECTION_TITLE[dashboard.section] ?? sectionName} Production`}
                    </Typography>

                    {/* Right: Context-Aware Sub-filter controls based on section */}
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={2}
                      flexWrap="wrap"
                    >
                      {/* 1. Section-specific Sub-selectors / Product types */}
                      {isStock ? (
                        <>
                          <NavTabs
                            prefixLabel="Sub-Section"
                            items={STOCK_SUBSECTIONS.map((s) => ({
                              id: s,
                              label: s,
                            }))}
                            value={activeSubSection}
                            onChange={(s) =>
                              setFilter(
                                {
                                  subSection: s,
                                  productType: null,
                                  unitOfMeasurement: null,
                                },
                                false,
                              )
                            }
                            layoutId="stockSubSectionFill"
                            size="lg"
                          />
                          {stockProductOptions.length > 0 && (
                            <NavTabs
                              prefixLabel="Product"
                              items={[
                                { id: "all", label: "All" },
                                ...stockProductOptions.map((opt) => ({
                                  id: opt,
                                  label: opt,
                                })),
                              ]}
                              value={activeProductType || "all"}
                              onChange={(v) =>
                                setFilter(
                                  { productType: v === "all" ? null : v },
                                  false,
                                )
                              }
                              layoutId="stockProductTypeFill"
                              size="lg"
                            />
                          )}
                        </>
                      ) : dashboard.section === "mix" ? (
                        <NavTabs
                          prefixLabel="Compound"
                          items={[
                            { id: "all", label: "All" },
                            { id: "Master Compound", label: "Master Compound" },
                            { id: "Final Compound", label: "Final Compound" },
                          ]}
                          value={
                            ["Master Compound", "Final Compound"].includes(
                              activeProductType,
                            )
                              ? activeProductType
                              : "all"
                          }
                          onChange={(v) =>
                            setFilter(
                              { productType: v === "all" ? null : v },
                              false,
                            )
                          }
                          layoutId="sectionProdTypeFill"
                          size="lg"
                        />
                      ) : (
                        <NavTabs
                          prefixLabel="Type"
                          items={[
                            { id: "all", label: "All" },
                            {
                              id: "Passenger Radial",
                              label: "Passenger Radial",
                            },
                            { id: "LCV", label: "LCV" },
                          ]}
                          value={
                            ["Passenger Radial", "LCV"].includes(
                              activeProductType,
                            )
                              ? activeProductType
                              : "all"
                          }
                          onChange={(v) =>
                            setFilter(
                              { productType: v === "all" ? null : v },
                              false,
                            )
                          }
                          layoutId="sectionProdTypeFill"
                          size="lg"
                        />
                      )}

                      {/* 2. UoM filter pills */}
                      <NavTabs
                        prefixLabel="UoM"
                        items={[
                          { id: "Count", label: "Count" },
                          { id: "Metric Tonnes", label: "Metric Tonnes" },
                        ]}
                        value={
                          ["Metric Tonnes"].includes(activeUnit)
                            ? activeUnit
                            : "Count"
                        }
                        onChange={(u) =>
                          setFilter({ unitOfMeasurement: u }, false)
                        }
                        layoutId="sectionUomFill"
                        size="lg"
                      />
                    </Stack>
                  </Box>

                  <KpiGrid
                    kpis={kpis}
                    category={dashboard.category}
                    isLoading={false}
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
                      const cardDate = kpi.resolvedDate ?? null;
                      const useMonthRange =
                        dashboard.category === "p" &&
                        dashboard.granularity === "MONTH" &&
                        [
                          "mixOEE",
                          "curOEE",
                          "mixProd",
                          "tbmProd",
                          "stkProd",
                          "curProd",
                        ].includes(kpi.drillType);
                      return (
                        <Box sx={{ px: 0, pb: 2 }}>
                          <DrillPanelRouter
                            kpi={kpi}
                            plantId={plantId}
                            section={dashboard.section}
                            sectionName={sectionName}
                            subSection={pinnedSubSection}
                            cardDate={cardDate}
                            from={useMonthRange ? from : (cardDate ?? from)}
                            to={useMonthRange ? to : (cardDate ?? to)}
                            windowFrom={from}
                            windowTo={to}
                            shift={dashboard.granularity}
                            allDrillRows={drillRows}
                            rawRows={rawRows}
                            downtimeRows={downtimeRows}
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
                    <Box
                      sx={{
                        px: 0,
                        pb: 2,
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                      }}
                    >
                      <ShiftComparisonCard
                        plantId={plantId}
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

            {contentOnlyLoading && (
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "background.default",
                  borderRadius: 1.25,
                }}
              >
                <JKLoader />
              </Box>
            )}
          </Box>

          {bodyLoading && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "background.default",
              }}
            >
              <JKLoader />
            </Box>
          )}
        </Box>
      )}

      <TrendModal
        open={Boolean(trendKpi)}
        onClose={() => setTrendKpi(null)}
        plantId={plantId}
        kpi={trendKpi}
        section={dashboard.section}
        category={dashboard.category}
        subSection={pinnedSubSection}
        productType={dashboard.productType}
        unit={activeUnit}
        asOf={effectiveAsOf}
        dashFrom={dashboard.from}
        dashTo={dashboard.to}
      />
    </Box>
  );
}

function DrillPanelRouter({
  kpi,
  plantId,
  section,
  sectionName,
  subSection,
  cardDate = null,
  from,
  to,
  windowFrom = null,
  windowTo = null,
  shift,
  allDrillRows,
  rawRows,
  downtimeRows,
  prodSub,
  unitPin,
  mode,
  isLoading,
}) {
  if (!kpi) return null;

  const granularity = shift ?? "DAY";
  const productivityDrillGranularity =
    granularity === "MONTH" &&
    ["mixProd", "tbmProd", "stkProd", "curProd"].includes(kpi.drillType)
      ? "DAY"
      : granularity;

  const drillTargets = kpi.drillTargets ?? [];
  const drillRows = (allDrillRows ?? []).filter((r) =>
    drillTargets.includes(r.kpiName),
  );

  switch (kpi.drillType) {
    case "mixOEE":
    case "curOEE":
      return (
        <OeeDrillPanel
          section={section}
          rawRows={rawRows}
          mode={mode}
          granularity={productivityDrillGranularity}
          plantId={plantId}
          from={from}
          to={to}
          cardDate={granularity === "MONTH" ? null : cardDate}
          isLoading={isLoading}
          trench={kpi.drillType === "curOEE"}
        />
      );
    case "mixProd":
    case "tbmProd":
    case "stkProd":
    case "curProd":
      return (
        <ProductionDrillPanel
          plantId={plantId}
          section={section}
          subSection={section === "stk" ? subSection : null}
          prodSub={prodSub}
          unitPin={unitPin}
          rawRows={rawRows}
          granularity={productivityDrillGranularity}
          from={from}
          to={to}
          isLoading={isLoading}
        />
      );
    case "downtime":
      return (
        <DowntimeDrillPanel
          plantId={plantId}
          section={section}
          granularity={productivityDrillGranularity}
          date={cardDate ?? from}
          from={from}
          to={to}
          mode={mode}
          rows={downtimeRows}
          isLoading={isLoading}
        />
      );
    case "compliance":
      return (
        <GenericTableDrillPanel
          kpi={kpi}
          rows={drillRows}
          category="p"
          windowFrom={windowFrom}
          windowTo={windowTo}
          isLoading={isLoading}
        />
      );
    case "budget":
      return (
        <BudgetDrillPanel
          kpi={kpi}
          plantId={plantId}
          from={from}
          to={to}
          isLoading={isLoading}
        />
      );
    case "table":
      return (
        <GenericTableDrillPanel
          kpi={kpi}
          rows={drillRows}
          category="p"
          windowFrom={windowFrom}
          windowTo={windowTo}
          isLoading={isLoading}
        />
      );
    case "scrapRework":
      return (
        <ScrapReworkDrillPanel
          plantId={plantId}
          section={sectionName}
          category="Quality"
          from={from}
          to={to}
          isLoading={isLoading}
        />
      );
    default:
      return null;
  }
}

export default BanmoreProduction;
