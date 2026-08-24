import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import JKLoader from "@/components/JKLoader.jsx";
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
import { getAnchors, getVocab } from "@/api/dashboard.js";
import { useDashboardFetch } from "@/hooks/useDashboardFetch.js";
import { presetToDateRange } from "@/lib/timeRange.js";
import { canonicalUnit } from "@/lib/kpi-transformer.js";
import { canonicalizeProductType } from "@/lib/dashboardRowScopes.js";
import { displayUnit } from "@/lib/units.js";
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
    downtimeGranularity,
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
    tbm: ["Green Tyre", "Passenger Radial", "LCV"],
    cur: ["Cured Tyre", "Passenger Radial", "LCV"],
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
  // PROD_SUB_OPTIONS / SECTION_DEFAULT_PRODUCT above are BANMORE's canonical
  // vocabulary (Master vs Final Compound, Passenger Radial / LCV). CTP makes
  // different things under different names — its Mixing productivity is
  // "Chemical" alone, with no Master Compound at all — so seeding another
  // plant with this list pins a product that matches no row and the whole
  // section reads as "no data". Off Banmore, the pills come purely from what
  // the plant records (nonStockProductOptions, below).
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

  // Stock sub-sections (BRD §13.2). The first is the default on entering
  // Stock. new_change.md C8: the PRODUCT list is NOT hardcoded — every
  // sub-section makes different products under different names (4 Roll makes
  // "Belt Mother Roll", Cutter makes "Belt"), so a shared list matches
  // nothing for some of them and the card blanks. The options are derived
  // from the data below (and `Belt Mother Roll` is never aliased to `Belt` —
  // a mother roll is a genuinely different intermediate product).
  // Banmore's canonical order (the artefact's, first entry = default). Used
  // as-is for Banmore; every other plant lists the sub-sections IT records —
  // CTP's Stock has EBR / TDA / Super Assembly / Belt Edge Filler and neither
  // 4 Roll nor Slitter, so this list would default to a sub-section with no
  // rows and blank the section.
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
  // dashboard_doc.md §3/§8: OEE is disambiguated by sub_section. Stock OEE
  // has one OEE_o row PER sub_section (5 rows/date), so a plot/shift card
  // that doesn't pin one stacks all five points on the same date. Stock is
  // always viewed per sub_section, so pin the resolved sub_section (which
  // defaults to the first one before the user picks). Other sections have a
  // single section-level OEE_o row (sub_section empty), so they stay null.
  const pinnedSubSection = isStock ? activeSubSection : dashboard.subSection;
  // new_change.md C8: read the DISTINCT (product_type, unit_of_measurement)
  // pairs the data actually holds for this section / sub-section. Its own small
  // fetch, deliberately WITHOUT a product_type pin (the landing fetch carries
  // one, so it could only ever return the already-selected product).
  //
  // The enumeration is intentionally NOT scoped to the selected date window or
  // granularity. Scoping it made the product-type toggle unstable — a narrow
  // window, a partial "Today", or a shift view holds only a SUBSET of the
  // products (e.g. TBM/Curing showed a different set each time), so pills
  // appeared and disappeared as the selection changed. Omitting date/from/to
  // (all dates) and granularity (defaults to DAY on the backend, where every
  // product has rows) yields the COMPLETE, stable list; the key only changes
  // on a section / sub-section switch, so there is no window-driven flicker.
  const optionsPayload = {
    plantId,
    context: {
      section: sectionName,
      category: "Productivity",
      ...(isStock ? { sub_section: activeSubSection } : {}),
      // Scope the pills to the selected line too — a product only that line
      // makes must not stay selectable once the other line is picked.
      ...(activeTyreType && activeTyreType !== "All"
        ? { tyre_type: activeTyreType }
        : {}),
    },
    limit: 1000,
  };
  const currentOptionsKey = stableOptionsKey(optionsPayload);
  const { data: productionOptionsData } = usePolledQuery(
    () => {
      // Tag the result with the exact scope it was fetched for, so stale
      // options (kept by keepPreviousData across a section/sub-section/window
      // change) can be detected and ignored below.
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
  // Only trust options that were fetched for the CURRENT section / sub-section
  // / window. keepPreviousData keeps the previous section's options in hand
  // until the new fetch lands; using them would seed a product / unit that
  // doesn't exist in the new section, so the landing fetch returns nothing
  // until a reload. Treating stale options as empty defers seeding until the
  // correct options arrive (the seeding effects below no-op on an empty list).
  const productionOptions =
    productionOptionsData?.key === currentOptionsKey &&
    Array.isArray(productionOptionsData.options)
      ? productionOptionsData.options
      : [];
  // "Unknown" is a catch-all bucket for rows whose product_type wasn't tagged;
  // it is never a real product, so drop it from the selectable pills.
  const nonStockProductOptions = [
    ...new Set(
      productionOptions
        .map((o) => o.productType)
        .filter(Boolean)
        .filter((p) => p.trim().toLowerCase() !== "unknown"),
    ),
  ];
  // changes.md §4: Stock has NO synthetic "Overall" product — only the real
  // product rows of the sub-section, in the data's own spelling.
  const stockProductOptions = [...nonStockProductOptions];
  // TBM / Curing / Mixing: always offer the FULL canonical product-type set
  // (PROD_SUB_OPTIONS) unioned with whatever the data actually holds, so every
  // product type stays selectable even when it has no rows in the current
  // window. Selecting an empty one shows a "no data" card (placeholder "—")
  // rather than the pill disappearing — the user asked to see all product
  // types with an explicit no-data state. Canonical entries come first so the
  // section default remains index 0; any extra product the data carries (a
  // name not in the canonical list) is appended.
  const navProductOptions = isStock
    ? stockProductOptions
    : [...new Set([...prodSubOptions, ...nonStockProductOptions])];
  // The active product type (sent to the backend). Falls back to the
  // section default; for Stock that is the sub-section's first real product.
  const activeProductType =
    dashboard.productType ??
    (isStock
      ? (stockProductOptions[0] ?? null)
      : (navProductOptions[0] ?? sectionDefaultProduct[dashboard.section]));

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
  // The options list is deliberately window-independent (see above), so it
  // also carries units that exist somewhere in history but not here and now:
  // CTP's Mixing Chemical was recorded in KG exactly once, in May, and in NUM
  // every other day. Pinning the first option regardless left the shift box —
  // which filters on the pinned unit strictly — with no matching row and every
  // cell reading "—". Prefer a unit the CURRENT window actually holds, and
  // fall back to the first option while the rows are still in flight.
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

  // Keep the pinned unit valid whenever the section / sub-section / product
  // changes under it (a stale unit would silently match no rows).
  useEffect(() => {
    if (activeUnit !== dashboard.unitOfMeasurement) {
      setFilter({ unitOfMeasurement: activeUnit }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit]);

  // The Stock sub-section tab RENDERS the resolved value (activeSubSection,
  // which falls back to the first sub-section), but the fetch context reads
  // dashboard.subSection verbatim — a null state therefore shows "4 Roll" as
  // selected while sending no sub_section filter at all, and every Stock
  // sub-section's rows come back. That widened the OEE drill to all of
  // Stock's sub-sections. Seed the state so the tab, the fetch and the drill
  // always describe the same slice.
  useEffect(() => {
    if (!isStock || dashboard.subSection != null) return;
    if (!STOCK_SUBSECTIONS[0]) return;
    setFilter({ subSection: STOCK_SUBSECTIONS[0] }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStock, dashboard.subSection, STOCK_SUBSECTIONS[0]]);

  // Stock has no product list until its options fetch lands; seed the first
  // REAL product of the sub-section once it does. Also RE-seed when the pinned
  // product isn't among the current sub-section's options (e.g. it lingered
  // from the previous section) — otherwise the landing fetch filters by a
  // product with no rows and the section shows nothing until a reload.
  useEffect(() => {
    if (!isStock) return;
    const first = stockProductOptions[0];
    if (!first) return; // options for this sub-section haven't arrived yet
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

  // A SINGLE page-level loading flag for the whole dashboard body. The KPI
  // grid, sidebar rings, plant summary and open drill panel all (re)fetch
  // together on a section / filter / month change; instead of each showing its
  // own spinner, one branded loader covers the body (see the overlay in the
  // render) and the per-panel loaders below are suppressed. Inventory owns its
  // own loading UI, so it is excluded.
  //
  // `isDrillLoading` is NOT part of this. Opening or switching a drill leaves
  // the cards, rings and summary untouched, so covering them was pure flicker
  // over content that never changed — the drill panel renders its own skeleton
  // instead. A section / filter / month change still lands here, because that
  // reloads the landing query and `kpiLoading` goes true.
  const contentLoading =
    dashboard.category !== "i" &&
    (kpiLoading || sectionOeeLoading || summaryLoading);

  // Which REGION is actually reloading?
  //
  // Read it off the queries themselves rather than guessing from what the user
  // clicked. The sidebar rings (getSectionOee) and the plant summary
  // (getPlantSummary) are both keyed on plant + window — not section, product,
  // sub-section or category. So they refetch for a date / granularity change
  // and for nothing else, and their loading flags ARE the signal that the
  // whole body is changing.
  //
  // Everything else — section, product type, sub-section, unit, category tab —
  // moves only the landing query, i.e. only the content column. Covering the
  // sidebar and summary for those reads as the whole app blinking over content
  // that never changed.
  const bodyLoading =
    dashboard.category !== "i" && (sectionOeeLoading || summaryLoading);
  const contentOnlyLoading = contentLoading && !bodyLoading;

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
    return presetToDateRange({ ...timeRange, preset }, effectiveAsOf)
      .granularity;
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
    // Wait for a real data anchor before resolving the window. Falling back
    // to the system clock can query the current calendar month even when the
    // dataset ends earlier, which makes the main panel blank while sidebar
    // latest-OEE values still render.
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
        // new_change.md C6: only a preset window is "no explicit date" —
        // a picked from/to is the user's own intent and must NOT be
        // re-anchored per KPI.
        userWindow: Boolean(timeRange.from && timeRange.to),
      },
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, shiftKey, effectiveAsOf, asOfLoading, anchorsLoading]);

  const { from, to } = presetToDateRange(timeRange, effectiveAsOf);

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
          productType: sectionDefaultProduct[id] ?? null,
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
      const def = sectionDefaultProduct[dashboard.section];
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

  // Which drill panel is OPEN is page state (`openDrillKpiId`); which drill is
  // FETCHED is hook state (`drillSourceKpiId` / `drillKpis`). A section or
  // category change calls setFilter(..., resetDrill=true), which clears the
  // hook side but cannot clear the page side — so the panel kept rendering
  // with no drill fetch behind it and the machine-wise breakdown showed empty
  // until the user closed and reopened it. Re-arm the same card so the two
  // stay in step.
  useEffect(() => {
    if (!openDrillKpiId) return;
    // Already wired to this card. This is also what stops the effect
    // re-dispatching: drillInto sets drillSourceKpiId to the card id.
    if (dashboard.drillSourceKpiId === openDrillKpiId) return;
    const kpi = kpis.find((k) => k.id === openDrillKpiId && k.drillable);
    // The card may not exist (or not be drillable) in the new section. Leave
    // openDrillKpiId set — the panel renders nothing, and switching back to a
    // section that has it re-arms the drill.
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
          asOf={effectiveAsOf}
          lastUpdatedAt={lastUpdatedAt}
          tyreTypes={tyreTypes}
          tyreType={activeTyreType}
          onTyreTypeChange={(v) => setFilter({ tyreType: v }, false)}
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
            position: "relative",
            flex: 1,
            minHeight: exporting ? "auto" : 0,
            overflow: exporting ? "visible" : "hidden",
            display: "grid",
            gridTemplateColumns:
              dashboard.category === "i"
                ? "1fr"
                : { xs: "1fr", md: "220px 1fr" },
            gap: dashboard.category === "i" ? 0 : 2,
            p: dashboard.category === "i" ? 0 : 2,
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

          {/* Positioning context for the section-switch loader below. It is
              this wrapper — not the scrolling card inside it — that anchors the
              overlay, so a scrolled page still gets a centred loader rather
              than one parked at the top of the scroll height. */}
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
                backgroundColor: "background.paper",
                border: dashboard.category === "i" ? 0 : 1,
                borderColor: "divider",
                borderRadius: dashboard.category === "i" ? 0 : 1.25,
                boxShadow:
                  dashboard.category === "i" ? "none" : theme.custom.shadow,
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
                      sx={{
                        fontSize: 17,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
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
                        navProductOptions.length > 0 && (
                          <NavTabs
                            items={navProductOptions.map((o) => ({
                              id: o,
                              label: o,
                            }))}
                            // Selecting a product type sends it to the backend
                            // (server-side filter / real API call).
                            value={activeProductType}
                            onChange={(v) =>
                              setFilter({ productType: v }, false)
                            }
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
                              // KG is pinned/filtered as-is, but shown as MT —
                              // production is presented in tonnes. lib/units.js.
                              label: displayUnit(u),
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
                    // Per-panel loader suppressed: the single page-level overlay
                    // (contentLoading) covers the whole body while data reloads.
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
                      // new_change.md C3/C6: the drill window IS the card's
                      // resolved day when the card anchored itself (C6);
                      // otherwise it is the card's from/to window verbatim.
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
                        <Box sx={{ px: 2, pb: 2 }}>
                          <DrillPanelRouter
                            kpi={kpi}
                            plantId={plantId}
                            section={dashboard.section}
                            sectionName={sectionName}
                            subSection={pinnedSubSection}
                            cardDate={cardDate}
                            from={useMonthRange ? from : (cardDate ?? from)}
                            to={useMonthRange ? to : (cardDate ?? to)}
                            // The SELECTED window, never collapsed to the card's
                            // anchor day. A panel that fetches dated DAY rows for
                            // a MONTH card needs the whole month: `from`/`to`
                            // above resolve to the card's own date, which for a
                            // MONTH card is the 1st — so a DAY fetch built on
                            // them returns only the 1st.
                            windowFrom={from}
                            windowTo={to}
                            shift={dashboard.granularity}
                            allDrillRows={drillRows}
                            rawRows={rawRows}
                            // CR-11: the 6 reason leaves at DAY granularity,
                            // from their own fetch — never merged into
                            // rawRows (see useDashboardFetch).
                            downtimeRows={downtimeRows}
                            downtimeGranularity={downtimeGranularity}
                            prodSub={activeProductType}
                            unitPin={activeUnit}
                            mode={dashboard.mode}
                            // The panel owns its own in-place skeleton while the
                            // drill fetch runs. The page-level overlay covers the
                            // body only when the LANDING data is reloading, which
                            // a drill never triggers.
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
                        px: 2,
                        pb: 2,
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                      }}
                    >
                      {/* new_change.md C11/C12: the shift box follows the
                        active time filter (Today/day-wise → the three
                        SHIFT rows for that date; Month-wise / custom range
                        → the daily shift rows SUMMED) and the full
                        dashboard scope (section, sub-section, product,
                        unit). */}
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

            {/* Section / product / sub-section / category change — cover the
                content column only. The sidebar stays live so the user can see
                what they picked and keep clicking; the plant summary does not
                move for any of these. Same opaque backdrop as the body loader,
                for the same reason: it must hide the per-panel loaders. */}
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

          {/* The ONE loader for the whole dashboard body — date / granularity
              changes, the only ones that move the sidebar rings and plant
              summary too. Covers the sidebar, summary, KPI grid and any open drill so
              the user never sees several spinners at once. The backdrop is
              fully OPAQUE: internally-fetching panels (Shift Comparison, drill
              panels) render their own JKLoader, and a translucent overlay let
              those peek through as a second "Please wait". An opaque cover
              hides them regardless of which panel is mid-fetch. */}
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
  subSection,
  // new_change.md C3/C6: the card's own resolved date, or null when the
  // card is showing an explicit range.
  cardDate = null,
  from,
  to,
  // The selected window, independent of the card-anchor collapse above.
  windowFrom = null,
  windowTo = null,
  shift,
  allDrillRows,
  rawRows,
  downtimeRows,
  downtimeGranularity,
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
  // The OEE drills (mixOEE / curOEE) now follow the card onto MONTH — they have
  // a pre-aggregated row at every tier, so downgrading them to DAY only made
  // the machine table contradict the card above it. The Production drills stay
  // on DAY: their SKU levels carry 4 months of MONTH rows against 8 for the OEE
  // family, and those panels paginate a fetch of their own.
  const productivityDrillGranularity =
    granularity === "MONTH" &&
    ["mixProd", "tbmProd", "stkProd", "curProd"].includes(kpi.drillType)
      ? "DAY"
      : granularity;

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
          // Stock records OEE per sub_section; without the active tab the
          // panel lists every sub-section's machines.
          subSection={subSection}
          rawRows={rawRows}
          mode={mode}
          granularity={productivityDrillGranularity}
          // Window + plant for the panel's own date-wise leaf fetch, which only
          // runs on MONTH (the shared rows carry no per-date detail there).
          plantId={plantId}
          from={from}
          to={to}
          // new_change.md C3/C6: OEE reads the rows already in hand, which
          // also carry the (newer) Production rows. Without the card's date
          // the panel's "latest date" collapses to Production's 07-20 and
          // drops every OEE row — the dead drill this change removes.
          cardDate={granularity === "MONTH" ? null : cardDate}
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
          plantId={plantId}
          section={section}
          subSection={section === "stk" ? subSection : null}
          prodSub={prodSub}
          unitPin={unitPin}
          // rawRows only seeds the unit toggle; the table rows come from the
          // panel's own paginated per-lens fetch (from/to drive its window).
          rawRows={rawRows}
          granularity={productivityDrillGranularity}
          from={from}
          to={to}
          isLoading={isLoading}
        />
      );
    case "downtime":
      return (
        // CR-11: this panel reads its OWN feed and filters on the SAME
        // granularity that feed was fetched at — DAY normally, SHIFT A/B/C
        // when a shift is selected. Handing it `rawRows` + the card's
        // granularity blanked the breakdown on every preset but Today, since
        // gold stores no reason row at MONTH.
        <DowntimeDrillPanel
          section={section}
          rawRows={downtimeRows}
          mode={mode}
          granularity={downtimeGranularity ?? "DAY"}
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
          // Context + window for panels that fetch their own DAY rows when the
          // card is on MONTH (NCM Hold's dated detail).
          plantId={plantId}
          subSection={subSection}
          productType={prodSub}
          from={windowFrom ?? from}
          to={windowTo ?? to}
        />
      );
    // null drillType — no drill panel
    case null:
    default:
      return null;
  }
}

export default BanmoreProduction;
