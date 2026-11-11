import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from "@mui/material";
import FactoryOutlinedIcon from "@mui/icons-material/FactoryOutlined";
import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";
import TroubleshootOutlinedIcon from "@mui/icons-material/TroubleshootOutlined";
import HandymanOutlinedIcon from "@mui/icons-material/HandymanOutlined";
import NewReleasesOutlinedIcon from "@mui/icons-material/NewReleasesOutlined";
import QueryStatsOutlinedIcon from "@mui/icons-material/QueryStatsOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import WarehouseOutlinedIcon from "@mui/icons-material/WarehouseOutlined";
import DonutLargeOutlinedIcon from "@mui/icons-material/DonutLargeOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import KpiCard from "@/components/production/KpiCard.jsx";
import { getAsOf, getPlant } from "@/api/plants.js";
import { getLiveRunningSkus } from "@/api/technical.js";
import LiveRunningSkusDrill from "@/components/technical/LiveRunningSkusDrill.jsx";
import { useDashboardFetch } from "@/hooks/useDashboardFetch.js";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import client from "@/api/client.js";
import {
  buildDatePayload,
  normalizeDateInput,
  presetToDateRange,
  todayIso,
} from "@/lib/timeRange.js";
import { technicalTrendFilter } from "@/lib/uniformityTrend.js";
import { withNumericValues } from "@/lib/technicalDrills.js";
import { TEMP_DISABLE_SKU_PLAN } from "@/lib/tempFlags.js";
import {
  BUILDING_ATTRIBUTED_CARD_KPIS,
  BUILDING_ATTRIBUTED_DRILL_KPIS,
  BUILDING_ATTRIBUTED_KPIS,
  BUILDING_TREND_SCOPE,
  TECHNICAL_KPI_SOURCES,
  buildingAttributedRows,
  resolveTechnicalKpi,
  toBuildingAttributedKpis,
  toDowntimeReasonKpis,
  toBuildingTrendKpi,
  toTrendKpi,
} from "@/lib/technicalKpiSources.js";
import TechnicalDrillPanel from "@/components/technical/TechnicalDrillPanel.jsx";
import TrendModal from "@/components/trend/TrendModal.jsx";
import PaintWeightDrill from "@/components/technical/PaintWeightDrill.jsx";
import { getProductSummary } from "@/api/quality.js";
import {
  PAINT_WEIGHT_HEADLINE_KPI,
  toGtWeightCard,
} from "@/lib/paintWeight.js";
import TechnicalUniformityBalancingSection from "@/components/technical/TechnicalUniformityBalancingSection.jsx";
import { technicalUniformityPeriod } from "@/lib/uniformityDrill.js";
import InventoryPage from "@/components/inventory/InventoryPage.jsx";
import { getLiveOverageSummary } from "@/api/inventory.js";
import OverageDrill from "@/components/technical/OverageDrill.jsx";
import { liveOverageSection, toLiveOverageCard } from "@/lib/overage.js";

const TECHNICAL_TABS = [
  { id: "overall", label: "Overall", icon: DonutLargeOutlinedIcon },
  { id: "stock", label: "Stock", icon: Inventory2OutlinedIcon },
  {
    id: "building",
    label: "Building",
    icon: PrecisionManufacturingOutlinedIcon,
  },
  { id: "curing", label: "Curing", icon: FactoryOutlinedIcon },
  {
    id: "uniformity",
    label: "Uniformity & Balancing",
    icon: BalanceOutlinedIcon,
  },
  { id: "ttc", label: "TTC", icon: ScienceOutlinedIcon, pending: true },
  {
    id: "srt",
    label: "SRT / Claims",
    icon: TroubleshootOutlinedIcon,
    pending: true,
  },
  {
    id: "mould",
    label: "Mould Shop",
    icon: HandymanOutlinedIcon,
    pending: true,
  },
  {
    id: "npi",
    label: "NPI / NPD",
    icon: NewReleasesOutlinedIcon,
    pending: true,
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: QueryStatsOutlinedIcon,
    pending: true,
  },
  { id: "inventory", label: "Inventory", icon: WarehouseOutlinedIcon },
];

const STOCK_AREAS = [
  { id: "mixing", label: "Mixing", section: "mix", subSection: null },
  {
    id: "4roll",
    label: "4 Roll / Calendar",
    section: "stk",
    subSection: "4 Roll",
  },
  { id: "extruder", label: "Extruder", section: "stk", subSection: "Extruder" },
  { id: "3roll", label: "3 Roll", section: "stk", subSection: "3 Roll" },
  { id: "cutter", label: "Cutter", section: "stk", subSection: "Cutter" },
  { id: "slitter", label: "Slitter", section: "stk", subSection: "Slitter" },
  { id: "bead", label: "Bead", section: "stk", subSection: "Bead" },
];

const STOCK_KPIS = [
  { id: "prod", name: "Production" },
  { id: "rsku", name: "Current Running SKUs" },
  { id: "scrap", name: "Scrap" },
  { id: "rej", name: "Rejection" },
  { id: "ovg", name: "Overage Material" },
  { id: "ncr", name: "Held / NCR Material" },
  { id: "pcap", name: "Process Capability" },
  { id: "pparam", name: "Process Parameters" },
  { id: "dsku", name: "Development SKUs" },
  { id: "bdown", name: "Breakdown" },
  { id: "xmt", name: "Extra / Missing Time" },
  { id: "rps", name: "Repass" },
  { id: "bcs", name: "Batch Change & Setup Loss" },
];

const OVERALL_GROUPS = [
  {
    label: "Quality & Consistency",
    kpis: [
      { id: "ov_pcs", name: "Product Consistency Score (PLT)" },
      { id: "ov_ef", name: "Early Failure" },
      { id: "ov_cts", name: "Cure Tyre Scrap — Design & Process" },
    ],
  },
  {
    label: "Cost & Value Engineering",
    kpis: [{ id: "ov_cs", name: "Cost Saving" }],
  },
  {
    label: "New Product & Equipment",
    kpis: [{ id: "ov_vs", name: "Vertical Startup — Timeline Adherence" }],
  },
  {
    label: "Safety & TQM",
    kpis: [
      { id: "ov_saf", name: "Non-Reportable Incidents" },
      { id: "ov_tqm", name: "TQM Maturity Score — Technology" },
    ],
  },
];

const TECHNICAL_KPI_CATALOG = {
  stock: STOCK_KPIS,
  building: [
    { id: "prod", name: "Production" },
    { id: "rsku", name: "Current Running SKUs" },
    { id: "scrap", name: "Scrap" },
    { id: "bctscrap", name: "Cured Tyre Scrap" },
    { id: "rwk", name: "Rework" },
    { id: "rej", name: "Rejection" },
    { id: "ovg", name: "Overage Material" },
    { id: "ncr", name: "Held / NCR Material" },
    { id: "pcap", name: "Process Capability" },
    { id: "pparam", name: "Process Parameters" },
    { id: "dsku", name: "Development SKUs" },
    { id: "gtw", name: "GT Weight Variation" },
    { id: "bshear", name: "Shearography" },
    { id: "bdown", name: "Breakdown" },
  ],
  curing: [
    { id: "prod", name: "Production" },
    { id: "ctscrap", name: "Cured Tyre Scrap" },
    { id: "rwk", name: "Rework" },
    { id: "bdown", name: "Breakdown" },
    { id: "bldh", name: "Bladder Health" },
    { id: "rej", name: "Rejection" },
    { id: "pparam", name: "Process Parameters" },
    { id: "pcap", name: "Process Capability" },
    { id: "rsku", name: "Current Running SKUs" },
    { id: "ncr", name: "Held / NCR Material" },
    { id: "ovg", name: "Overage Material" },
    { id: "dsku", name: "Development SKUs" },
  ],
  uniformity: [
    { id: "uniformity-yield", name: "Uniformity Yield" },
    { id: "dbm-yield", name: "DBM Yield" },
    { id: "uniformity-parameters", name: "Uniformity Parameters" },
    { id: "process-capability", name: "Process Capability" },
    { id: "uniformity-oee", name: "Uniformity Machine OEE" },
    { id: "uniformity-rejection", name: "Uniformity Rejection" },
    { id: "breakdown", name: "Breakdown" },
  ],
  ttc: [
    { id: "total-tests", name: "Total Tests" },
    { id: "tests-completed", name: "Tests Completed" },
    { id: "pass-rate", name: "Pass Rate" },
    { id: "failed-tests", name: "Failed Tests" },
    { id: "pending-tests", name: "Pending Tests" },
    { id: "delayed-tests", name: "Delayed Tests" },
    { id: "running-tests", name: "Running Tests" },
    { id: "failure-reasons", name: "Major Failure Reasons" },
  ],
  srt: [
    { id: "cp_tec", name: "Technical Claims" },
    { id: "cp_ef", name: "Early Failure Claims" },
    { id: "cp_pol", name: "Policy Claims" },
    { id: "cp_att", name: "Attention" },
    { id: "s_efppm", name: "Early Failure PPM @9M" },
    { id: "s_tppm", name: "Technical PPM @12M" },
    { id: "s_top", name: "Top Size & Defect" },
    { id: "s_act", name: "Actions" },
  ],
  mould: [
    { id: "mavail", name: "Mould Availability" },
    { id: "mdue", name: "Dirty Mould — Due / Red Zone" },
    { id: "mexp", name: "Dirty Mould — Blocked / Life Expired" },
    { id: "mtemp", name: "Mould Temperature" },
    { id: "mdmg", name: "Mould Damage Cases" },
    { id: "mscr", name: "Mould-related Scrap" },
    { id: "mqc", name: "Under Quality Clearance" },
    { id: "mnew", name: "New Moulds Received" },
    { id: "mtot", name: "Total Moulds" },
    { id: "mtrf", name: "Mould Transfers" },
    { id: "mproc", name: "Mould Procurement" },
    { id: "mqcd", name: "Quality Clearance" },
  ],
  npi: [
    { id: "nprj", name: "Total Development Projects" },
    { id: "ntrial", name: "Active Trials" },
    { id: "nsucc", name: "Trial Success Rate" },
    { id: "nfail", name: "Trial Failure Reasons" },
    { id: "nrm", name: "RM Availability" },
    { id: "ncons", name: "Product / Compound Consistency" },
    { id: "ncomp", name: "NPI Compliance" },
  ],
};

const SECTION_NAMES = {
  mix: "Mixing",
  stk: "Stock",
  tbm: "TBM",
  cur: "Curing",
};

const SHIFT_GRANULARITY = {
  a: "SHIFT A",
  b: "SHIFT B",
  c: "SHIFT C",
};

function BanmoreTechnical() {
  const theme = useTheme();
  const [tab, setTab] = useState("overall");
  const [stockArea, setStockArea] = useState("mixing");
  const [shift, setShift] = useState("all");
  const [timeRange, setTimeRange] = useState({
    preset: "month",
    from: "",
    to: "",
    month: null,
  });

  const { data: plant } = usePolledQuery(() => getPlant("banmore"), {
    interval: 0,
    cacheKey: "technical:banmore:plant",
    staleTime: 30 * 60 * 1000,
  });
  const { data: asOfData } = usePolledQuery(() => getAsOf("banmore"), {
    interval: 0,
    cacheKey: "technical:banmore:as-of",
    staleTime: 15 * 60 * 1000,
  });

  const liveSnapshot = usePolledQuery(getLiveRunningSkus, {
    enabled: ["stock", "building", "curing"].includes(tab),
    interval: 60_000,
    cacheKey: "technical:banmore:live-running-skus",
    staleTime: 60_000,
    keepPreviousData: true,
  });

  // All six tiny summaries share one query/cache. Area switches only filter
  // aggregate display rows; item/barcode details remain lazy in OverageDrill.
  const overageSection = liveOverageSection(stockArea);
  const forceOverageRefresh = useRef(false);
  const overage = usePolledQuery(
    () => {
      const refresh = forceOverageRefresh.current;
      forceOverageRefresh.current = false;
      return getLiveOverageSummary({ refresh });
    },
    {
      enabled: tab === "stock",
      interval: 0,
      cacheKey: "technical:banmore:overage-live:all:v3",
      staleTime: 5 * 60 * 1000,
    },
  );
  const overageError =
    overage.error ??
    overage.data?.unavailable_sections?.find(
      (row) => row.dashboard_section === overageSection,
    );
  const overageData =
    !overageError && overage.data && overageSection
      ? {
          ...overage.data,
          totals: overage.data.totals.filter(
            (row) => row.dashboard_section === overageSection,
          ),
          products: overage.data.products.filter(
            (row) => row.dashboard_section === overageSection,
          ),
        }
      : null;
  const refreshOverage = () => {
    forceOverageRefresh.current = true;
    overage.refetch();
  };

  // Production-tab KPIs (Production) and Quality-tab KPIs (Scrap, NCM Hold)
  // come from separate category fetches — see technicalKpiSources.js.
  const productivity = useDashboardFetch({ plantId: "banmore" });
  const quality = useDashboardFetch({ plantId: "banmore" });
  const {
    setFilter: setProductivityFilter,
    resetDrill: resetProductivityDrill,
  } = productivity;
  const { setFilter: setQualityFilter, resetDrill: resetQualityDrill } =
    quality;

  const isLoading = productivity.isLoading || quality.isLoading;
  const error = productivity.error || quality.error || null;

  const activeStockArea =
    STOCK_AREAS.find((area) => area.id === stockArea) ?? STOCK_AREAS[0];
  const activeTab = TECHNICAL_TABS.find((item) => item.id === tab);
  const section =
    tab === "stock"
      ? activeStockArea.section
      : tab === "building"
        ? "tbm"
        : tab === "curing"
          ? "cur"
          : null;
  const subSection = tab === "stock" ? activeStockArea.subSection : null;
  const isOverageCard = (id) => tab === "stock" && id === "ovg";
  const isLiveTab = Boolean(section) && !activeTab?.pending;

  const dateWindow = useMemo(
    () => presetToDateRange(timeRange, asOfData?.asOf ?? null),
    [timeRange, asOfData?.asOf],
  );
  // Quality › Product's gold API accepts one snapshot date. This mirrors its
  // established filter contract: a month uses its first-day aggregate; other
  // selections use the window's latest day. A selected shift overrides the
  // base DAY/MONTH granularity.
  const uniformityGranularity =
    SHIFT_GRANULARITY[shift] ?? dateWindow.granularity ?? "DAY";
  const uniformityDate =
    uniformityGranularity === "MONTH" || uniformityGranularity === "YEAR"
      ? dateWindow.from
      : (dateWindow.to ?? dateWindow.from);
  const uniformityShift = shift === "all" ? "All" : String(shift).toUpperCase();
  // Trend modal context: the page's as-of day, not the raw system date.
  const trendToday = normalizeDateInput(asOfData?.asOf ?? "") ?? todayIso();
  const uniformityTrendFilter = useMemo(
    () =>
      technicalTrendFilter({
        timeRange,
        dateWindow,
        shift,
        today: trendToday,
      }),
    [timeRange, dateWindow, shift, trendToday],
  );

  // Building's GT Weight Variation card reads the same Quality › Product
  // summary (and snapshot date) as the Uniformity tab.
  const productSummary = usePolledQuery(
    () =>
      getProductSummary({
        date: uniformityDate,
        shift: uniformityShift,
        granularity: uniformityGranularity,
      }),
    {
      enabled: tab === "building" && Boolean(uniformityDate),
      interval: 0,
      deps: [uniformityDate, uniformityShift, uniformityGranularity],
    },
  );

  useEffect(() => {
    if (!isLiveTab) return;
    const scope = {
      section,
      subSection,
      productType: null,
      unitOfMeasurement: null,
      tyreType: "PCR",
    };
    setProductivityFilter({ ...scope, category: "p" }, true);
    setQualityFilter({ ...scope, category: "q" }, true);
  }, [isLiveTab, section, subSection, setProductivityFilter, setQualityFilter]);

  useEffect(() => {
    if (!isLiveTab || (!dateWindow.from && !dateWindow.to)) return;
    const dateFilter = {
      date: null,
      from: dateWindow.from,
      to: dateWindow.to,
      granularity: SHIFT_GRANULARITY[shift] ?? dateWindow.granularity,
      mode: dateWindow.mode,
      userWindow: Boolean(timeRange.from && timeRange.to),
    };
    setProductivityFilter(dateFilter);
    setQualityFilter(dateFilter);
  }, [
    dateWindow,
    isLiveTab,
    setProductivityFilter,
    setQualityFilter,
    shift,
    timeRange.from,
    timeRange.to,
  ]);

  useEffect(() => {
    resetProductivityDrill();
    resetQualityDrill();
  }, [tab, stockArea, resetProductivityDrill, resetQualityDrill]);

  const downtimeKpis = useMemo(
    () =>
      toDowntimeReasonKpis(productivity.downtimeRows, {
        section: SECTION_NAMES[productivity.state.section],
        granularity: productivity.state.granularity ?? "DAY",
        mode: productivity.state.mode ?? "snapshot",
        plantId: "banmore",
      }),
    [
      productivity.downtimeRows,
      productivity.state.section,
      productivity.state.granularity,
      productivity.state.mode,
    ],
  );
  // Building has no Scrap / Rework rows of its own; its Cured Tyre Scrap and
  // Rework are Curing's rows attributed to the BUILDING discipline, read in
  // the same window / granularity as the Building quality cards.
  const isBuildingTab = tab === "building";
  const qualityState = quality.state;
  const curingDisciplinePayload = (drillKpis, dates) => ({
    plantId: "banmore",
    context: {
      section: "Curing",
      category: "Quality",
      tyre_type: "PCR",
      sub_section: "BUILDING",
      granularity: qualityState.granularity ?? "DAY",
    },
    ...dates,
    drillKpis,
    drillOnly: true,
    limit: 10000,
  });
  const hasQualityWindow = Boolean(
    (qualityState.from && qualityState.to) || qualityState.date,
  );
  const buildingCardPayload = curingDisciplinePayload(
    BUILDING_ATTRIBUTED_CARD_KPIS,
    buildDatePayload(qualityState),
  );
  const buildingCardQuery = usePolledQuery(
    () => client.post("/dashboard/kpi-data", buildingCardPayload),
    {
      enabled: isBuildingTab && hasQualityWindow,
      interval: 0,
      deps: [JSON.stringify(buildingCardPayload)],
    },
  );
  const buildingKpis = useMemo(
    () =>
      toBuildingAttributedKpis(withNumericValues(buildingCardQuery.data), {
        granularity: qualityState.granularity ?? "DAY",
        mode: qualityState.mode ?? "snapshot",
        plantId: "banmore",
      }),
    [buildingCardQuery.data, qualityState.granularity, qualityState.mode],
  );
  const isBuildingAttributed = (id) =>
    isBuildingTab && Boolean(BUILDING_ATTRIBUTED_KPIS[id]);

  const kpisByCategory = {
    p: productivity.kpis,
    q: quality.kpis,
    downtime: downtimeKpis,
  };
  const liveMachines = (liveSnapshot.data?.machines ?? []).filter(
    (machine) =>
      machine.section === SECTION_NAMES[section] &&
      (!subSection || machine.sub_section === subSection),
  );
  const runningSkuCard =
    !liveSnapshot.error && liveSnapshot.data
      ? {
          id: "rsku",
          name: "Current Running SKUs",
          value: new Set(
            liveMachines
              .filter(
                (machine) =>
                  machine.machine_status === "Running" && machine.live_sku,
              )
              .map((machine) => machine.live_sku),
          ).size,
          unit: "SKUs",
          note: "Live snapshot · last 7 days",
          hideTrend: true,
          drillable: true,
        }
      : null;
  const mapDisplayKpis = (definitions) =>
    definitions.map((definition) => ({
      definition,
      live:
        definition.id === "rsku"
          ? runningSkuCard
          : definition.id === "gtw"
            ? toGtWeightCard(
                productSummary.data?.values?.[PAINT_WEIGHT_HEADLINE_KPI],
                definition,
              )
            : isBuildingAttributed(definition.id)
              ? (buildingKpis.find((kpi) => kpi.id === definition.id) ?? null)
              : isOverageCard(definition.id)
                ? overageSection && overageData && !overageError
                  ? toLiveOverageCard(overageData, definition)
                  : null
                : resolveTechnicalKpi(definition, kpisByCategory),
      cardLoading: isOverageCard(definition.id)
        ? Boolean(overageSection) && !overageData && !overageError
        : undefined,
      unavailableReason:
        isOverageCard(definition.id) && !overageSection
          ? "Bead is not covered by the overage guide"
          : definition.id === "rsku" && liveSnapshot.error
            ? "Live source unavailable"
            : definition.id === "gtw" && productSummary.error
              ? "Quality source unavailable"
              : isOverageCard(definition.id) && overageError
                ? "Inventory source unavailable"
                : undefined,
    }));
  const displayKpis = mapDisplayKpis(TECHNICAL_KPI_CATALOG[tab] ?? []);

  // Period-bound cards wait for their sources, but never gate the live card.
  // Its first load/error is independent; background polls keep its last answer
  // visible. Date/shift changes only reload the period cards.
  const hasCard = (id) =>
    displayKpis.some(({ definition }) => definition.id === id);
  const kpisLoading =
    isLiveTab &&
    (isLoading ||
      productivity.isDowntimeLoading ||
      (hasCard("gtw") &&
        Boolean(uniformityDate) &&
        !productSummary.data &&
        !productSummary.error) ||
      (isBuildingTab &&
        (!hasQualityWindow ||
          (!buildingCardQuery.data && !buildingCardQuery.error))));

  // One drill open at a time, tied to the scope it was opened in so a tab /
  // area switch closes it (the effect above resets the fetch side).
  const drillScope = `${tab}|${stockArea}`;
  const [openDrill, setOpenDrill] = useState(null);
  const openDrillKpiId =
    openDrill?.scope === drillScope ? openDrill.kpiId : null;
  const openDrillSource = openDrillKpiId
    ? TECHNICAL_KPI_SOURCES[openDrillKpiId]
    : null;
  const openDrillKpi = openDrillKpiId
    ? (displayKpis.find(({ definition }) => definition.id === openDrillKpiId)
        ?.live ?? null)
    : null;
  const drillFetch = openDrillSource?.category === "q" ? quality : productivity;

  // A Building-attributed drill reads the card's own window: one resolved
  // day for Today / Shift cards, the whole window for Month / custom range.
  const openBuildingDrill = isBuildingAttributed(openDrillKpiId)
    ? openDrillKpi
    : null;
  const buildingDrillPayload = openBuildingDrill
    ? curingDisciplinePayload(
        BUILDING_ATTRIBUTED_DRILL_KPIS,
        qualityState.granularity === "MONTH" ||
          qualityState.mode === "aggregate" ||
          !openBuildingDrill.resolvedDate
          ? buildDatePayload(qualityState)
          : buildDatePayload({ date: openBuildingDrill.resolvedDate }),
      )
    : null;
  const buildingDrillQuery = usePolledQuery(
    () => client.post("/dashboard/kpi-data", buildingDrillPayload),
    {
      enabled: Boolean(buildingDrillPayload),
      interval: 0,
      deps: [JSON.stringify(buildingDrillPayload)],
    },
  );
  const buildingDrillRows = useMemo(
    () => buildingAttributedRows(withNumericValues(buildingDrillQuery.data)),
    [buildingDrillQuery.data],
  );

  // "View Trend Analytics" opens the Production trend behind the card, in
  // the scope it was opened from; an area / tab switch closes it.
  // Building's Cured Tyre Scrap / Rework trend their Curing BUILDING rows.
  const [openTrend, setOpenTrend] = useState(null);
  const trendCard = openTrend?.scope === drillScope ? openTrend.kpi : null;
  const isBuildingTrend =
    Boolean(trendCard) && isBuildingAttributed(trendCard.id);
  const trendKpi = isBuildingTrend
    ? toBuildingTrendKpi(trendCard)
    : toTrendKpi(trendCard);
  const trendScope = isBuildingTrend
    ? BUILDING_TREND_SCOPE
    : {
        section,
        subSection,
        category:
          TECHNICAL_KPI_SOURCES[trendCard?.id]?.category === "q" ? "q" : "p",
      };
  const handleTrendOpen = (kpi) => {
    const trendable = isBuildingAttributed(kpi.id)
      ? toBuildingTrendKpi(kpi)
      : toTrendKpi(kpi);
    if (trendable) setOpenTrend({ kpi, scope: drillScope });
  };

  const handleCloseDrill = () => {
    setOpenDrill(null);
    resetProductivityDrill();
    resetQualityDrill();
  };

  const handleDrillKpi = (kpi) => {
    // These drills fetch their own rows.
    if (
      kpi.id === "rsku" ||
      kpi.id === "gtw" ||
      isBuildingAttributed(kpi.id) ||
      isOverageCard(kpi.id)
    ) {
      if (openDrillKpiId === kpi.id) handleCloseDrill();
      else {
        resetProductivityDrill();
        resetQualityDrill();
        setOpenDrill({ kpiId: kpi.id, scope: drillScope });
      }
      return;
    }
    const source = TECHNICAL_KPI_SOURCES[kpi.id];
    if (!kpi.drillable || !source) return;
    if (openDrillKpiId === kpi.id) {
      handleCloseDrill();
      return;
    }
    resetProductivityDrill();
    resetQualityDrill();
    setOpenDrill({ kpiId: kpi.id, scope: drillScope });
    // The downtime drills read the reason rows already fetched for the card.
    if (!source.drillKpis) return;
    const fetcher = source.category === "q" ? quality : productivity;
    fetcher.drillInto(
      source.drillKpis,
      source.productionId,
      {},
      kpi.resolvedDate ?? null,
    );
  };

  const areaLabel = tab === "stock" ? activeStockArea.label : activeTab?.label;
  const drillPanel =
    openDrillKpiId === "rsku" ? (
      <LiveRunningSkusDrill
        machines={liveMachines}
        snapshot={liveSnapshot.data}
        error={liveSnapshot.error}
        isLoading={liveSnapshot.isLoading}
        title={`Current Running SKUs — ${areaLabel}`}
        breadcrumb={[areaLabel, "Current Running SKUs"]}
        onClose={handleCloseDrill}
      />
    ) : openDrillKpiId === "gtw" ? (
      <PaintWeightDrill
        key={`${uniformityDate}|${uniformityShift}|${uniformityGranularity}`}
        date={uniformityDate}
        shift={uniformityShift}
        granularity={uniformityGranularity}
        breadcrumb={[areaLabel, "GT Weight Variation"]}
        onClose={handleCloseDrill}
      />
    ) : isOverageCard(openDrillKpiId) ? (
      <OverageDrill
        key={stockArea}
        data={overageData}
        section={overageSection}
        areaLabel={areaLabel}
        title={`Overage Material — ${areaLabel}`}
        breadcrumb={["Stock", areaLabel, "Overage Material"]}
        onRefresh={refreshOverage}
        onClose={handleCloseDrill}
      />
    ) : openDrillKpi ? (
      (() => {
        const drillState = drillFetch.state;
        const definition = TECHNICAL_KPI_CATALOG[tab].find(
          (item) => item.id === openDrillKpiId,
        );
        const areaLabel =
          tab === "stock" ? activeStockArea.label : activeTab?.label;
        // Today / Shift cards read one day out of a trailing week; the Month
        // and custom-range cards cover the whole window.
        const wholeWindow =
          drillState.granularity === "MONTH" || drillState.mode === "aggregate";
        return (
          <Box sx={{ mt: 2 }}>
            <TechnicalDrillPanel
              key={`${drillScope}|${openDrillKpiId}`}
              kpiId={openDrillKpiId}
              title={`${definition.name} — ${areaLabel}`}
              breadcrumb={
                tab === "stock"
                  ? ["Stock", activeStockArea.label, definition.name]
                  : [activeTab?.label, definition.name]
              }
              sectionName={
                openBuildingDrill ? "Curing" : SECTION_NAMES[drillState.section]
              }
              rawRows={
                openBuildingDrill ? buildingDrillRows : drillFetch.rawRows
              }
              card={openDrillKpi}
              planCard={
                TEMP_DISABLE_SKU_PLAN
                  ? null
                  : (productivity.kpis.find((item) => item.id === "comp") ??
                    null)
              }
              downtimeRows={productivity.downtimeRows}
              downtimeGranularity={productivity.downtimeGranularity}
              eventDate={
                wholeWindow ? null : (openDrillKpi.resolvedDate ?? null)
              }
              isLoading={
                openBuildingDrill
                  ? buildingDrillQuery.isLoading
                  : drillFetch.isDrillLoading
              }
              onClose={handleCloseDrill}
            />
          </Box>
        );
      })()
    ) : null;

  const handleTimeRangeChange = (updater) => {
    setTimeRange((previous) => {
      const next = typeof updater === "function" ? updater(previous) : updater;
      if (!next) return previous;
      if (next.preset === "month" && next.month !== previous.month) return next;
      if (next.preset !== "month") return { ...next, month: null };
      return next;
    });
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default" }}>
      <ProductionHeader
        plant={plant}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        shift={shift}
        onShiftChange={setShift}
        onExport={() => window.print()}
        asOf={asOfData?.asOf ?? null}
        lastUpdatedAt={productivity.lastUpdatedAt}
        categoryTabs={[]}
        tyreTypes={tab === "srt" ? [] : ["PCR"]}
        tyreType="PCR"
      />

      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: theme.zIndex.appBar - 1,
          backgroundColor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, value) => {
            setOpenDrill(null);
            setTab(value);
          }}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Technical dashboard sections"
          sx={{
            px: { xs: 1, md: 2.5 },
            minHeight: 48,
            "& .MuiTab-root": {
              minHeight: 48,
              minWidth: "auto",
              px: 2,
              fontSize: 13,
              fontWeight: 600,
              textTransform: "none",
            },
          }}
        >
          {TECHNICAL_TABS.map((item) => {
            const Icon = item.icon;
            return (
              <Tab
                key={item.id}
                value={item.id}
                label={item.label}
                icon={<Icon sx={{ fontSize: 18 }} />}
                iconPosition="start"
              />
            );
          })}
        </Tabs>
      </Box>

      <Box sx={{ px: { xs: 2, md: 3 }, py: 2.25 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "flex-start", sm: "baseline" }}
          spacing={{ xs: 0.25, sm: 1 }}
          sx={{ mb: 1.75 }}
        >
          <Typography
            component="h1"
            sx={{ fontSize: 20, fontWeight: 800, color: "text.primary" }}
          >
            Technical Head Dashboard
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            BTP · Banmore Tyre Plant
          </Typography>
        </Stack>

        {tab === "stock" && (
          <ScopeSelector
            items={STOCK_AREAS}
            value={stockArea}
            onChange={(value) => {
              setOpenDrill(null);
              setStockArea(value);
            }}
          />
        )}

        {tab === "overall" ? (
          <TechnicalOverallGroups mapKpis={mapDisplayKpis} />
        ) : tab === "inventory" ? (
          <InventoryPage
            plantId="banmore"
            tyreType="PCR"
            shift={shift}
            granularity={SHIFT_GRANULARITY[shift] ?? dateWindow.granularity}
            from={dateWindow.from}
            to={dateWindow.to}
          />
        ) : tab === "analysis" ? (
          <TechnicalAnalysis />
        ) : tab === "uniformity" ? (
          <TechnicalUniformityBalancingSection
            key={JSON.stringify([
              uniformityDate,
              uniformityShift,
              uniformityGranularity,
              dateWindow,
            ])}
            date={uniformityDate}
            shift={uniformityShift}
            granularity={uniformityGranularity}
            drillPeriod={technicalUniformityPeriod(dateWindow, shift)}
            onClearDrillShift={() => setShift("all")}
            trendFilter={uniformityTrendFilter}
            trendToday={trendToday}
          />
        ) : (
          <>
            <TechnicalKpiSection
              title={tab === "stock" ? activeStockArea.label : activeTab?.label}
              kpis={displayKpis}
              dashboardLayout={["stock", "building", "curing"].includes(tab)}
              isLoading={kpisLoading}
              isLiveLoading={!liveSnapshot.data && !liveSnapshot.error}
              onRefreshOverage={
                tab === "stock" && overageSection ? refreshOverage : undefined
              }
              isRefreshingOverage={overage.isLoading}
              overageError={
                tab === "stock" && overageSection ? overageError : null
              }
              error={isLiveTab ? error : null}
              openDrillKpiId={openDrillKpiId}
              onDrillKpi={handleDrillKpi}
              onTrendOpen={handleTrendOpen}
              onCloseDrill={handleCloseDrill}
            />
            {drillPanel}
            <TrendModal
              open={Boolean(trendKpi)}
              onClose={() => setOpenTrend(null)}
              plantId="banmore"
              kpi={trendKpi}
              section={trendScope.section}
              category={trendScope.category}
              subSection={trendScope.subSection}
              tyreType="PCR"
              asOf={asOfData?.asOf ?? null}
            />
          </>
        )}
      </Box>
    </Box>
  );
}

function ScopeSelector({ label, items, value, onChange }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "flex-start", sm: "center" }}
      spacing={1.25}
      sx={{ mb: 2 }}
    >
      {label && (
        <Typography
          sx={{
            minWidth: 68,
            fontSize: 11,
            fontWeight: 700,
            color: "text.secondary",
            textTransform: "uppercase",
          }}
        >
          {label}
        </Typography>
      )}
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        {items.map((item) => (
          <Button
            key={item.id}
            size="small"
            variant={value === item.id ? "contained" : "outlined"}
            onClick={() => onChange(item.id)}
            disableElevation
            sx={{
              minHeight: 32,
              borderRadius: 999,
              px: 1.5,
              textTransform: "none",
              fontSize: 12.5,
              fontWeight: value === item.id ? 700 : 600,
            }}
          >
            {item.label}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

function TechnicalOverallGroups({ mapKpis }) {
  return (
    <Stack component="section" spacing={2} aria-label="Overall technical KPIs">
      {OVERALL_GROUPS.map((group) => (
        <Box key={group.label}>
          <Typography
            sx={{
              mb: 1,
              fontSize: 11.5,
              fontWeight: 800,
              color: "text.secondary",
              textTransform: "uppercase",
            }}
          >
            {group.label}
          </Typography>
          <KpiGrid kpis={mapKpis(group.kpis)} minWidth={230} />
        </Box>
      ))}
    </Stack>
  );
}

function TechnicalKpiSection({
  title,
  kpis,
  dashboardLayout = false,
  isLoading,
  isLiveLoading,
  onRefreshOverage,
  isRefreshingOverage,
  overageError,
  error,
  openDrillKpiId,
  onDrillKpi,
  onTrendOpen,
  onCloseDrill,
}) {
  return (
    <Box component="section" aria-labelledby="technical-kpis-heading">
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Typography
          id="technical-kpis-heading"
          sx={{ fontSize: 18, fontWeight: 750, color: "text.primary" }}
        >
          {title}
        </Typography>
        {onRefreshOverage && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshOutlinedIcon sx={{ fontSize: 16 }} />}
            disabled={isRefreshingOverage}
            onClick={onRefreshOverage}
            sx={{ flexShrink: 0 }}
          >
            Refresh overage
          </Button>
        )}
      </Stack>

      {overageError && (
        <Typography
          role="alert"
          sx={{ mb: 1.5, fontSize: 12.5, color: "error.main" }}
        >
          Live overage unavailable: {overageError.message}
        </Typography>
      )}
      {error && (
        <Typography sx={{ mb: 1.5, fontSize: 12.5, color: "error.main" }}>
          Period values unavailable: {error.message}
        </Typography>
      )}
      <KpiGrid
        kpis={kpis}
        dashboardLayout={dashboardLayout}
        isLoading={isLoading}
        isLiveLoading={isLiveLoading}
        openDrillKpiId={openDrillKpiId}
        onDrillKpi={onDrillKpi}
        onTrendOpen={onTrendOpen}
        onCloseDrill={onCloseDrill}
      />
    </Box>
  );
}

function KpiGrid({
  kpis,
  minWidth = 220,
  dashboardLayout = false,
  isLoading = false,
  isLiveLoading = false,
  openDrillKpiId = null,
  onDrillKpi,
  onTrendOpen,
  onCloseDrill,
}) {
  return (
    <Box
      role={dashboardLayout ? "group" : undefined}
      aria-label={dashboardLayout ? "Technical KPI cards" : undefined}
      sx={{
        display: "grid",
        gridTemplateColumns: dashboardLayout
          ? {
              xs: "minmax(0, 1fr)",
              sm: "repeat(2, minmax(0, 1fr))",
              md: "repeat(3, minmax(0, 1fr))",
              lg: "repeat(4, minmax(0, 1fr))",
            }
          : `repeat(auto-fit, minmax(min(${minWidth}px, 100%), 1fr))`,
        gap: dashboardLayout ? 2 : 1,
        alignItems: dashboardLayout ? "start" : undefined,
      }}
    >
      {kpis.map(({ definition, live, unavailableReason, cardLoading }) =>
        (cardLoading ??
        (definition.id === "rsku" ? isLiveLoading : isLoading)) ? (
          <UnavailableKpiCard
            key={definition.id}
            name={definition.name}
            alignMetrics={dashboardLayout}
            isLoading
          />
        ) : live && hasKpiValue(live.value) ? (
          <KpiCard
            key={definition.id}
            kpi={onDrillKpi ? live : { ...live, drillable: false }}
            isDrilling={openDrillKpiId === definition.id}
            alignMetrics={dashboardLayout}
            onClick={onDrillKpi}
            onTrendOpen={onTrendOpen}
            onCloseDrill={onCloseDrill}
          />
        ) : (
          <UnavailableKpiCard
            key={definition.id}
            name={definition.name}
            alignMetrics={dashboardLayout}
            reason={unavailableReason}
          />
        ),
      )}
    </Box>
  );
}

const ANALYSIS_OUTPUTS = ["Conicity", "RFV", "LFV", "RCF", "LCF", "Pressure"];
const ANALYSIS_INPUTS = [
  "Tread Length",
  "Tread Width",
  "Tread Gauge",
  "Splice",
  "Centering",
];

function TechnicalAnalysis() {
  const [output, setOutput] = useState("RFV");
  const [input, setInput] = useState("Tread Gauge");
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [sku, setSku] = useState("All");
  const [productType, setProductType] = useState("All");
  const [machine, setMachine] = useState("All");

  return (
    <Stack spacing={1.25}>
      <AnalysisPanel title="Parameter Analysis — Setup">
        <AnalysisPills
          label="Output Process"
          items={["Uniformity"]}
          value="Uniformity"
        />
        <AnalysisPills
          label="Output Parameter"
          items={ANALYSIS_OUTPUTS}
          value={output}
          onChange={setOutput}
        />
        <AnalysisPills
          label="Input Process"
          items={["VMI Max"]}
          value="VMI Max"
        />
        <AnalysisPills
          label="Input Parameters"
          items={ANALYSIS_INPUTS}
          value={input}
          onChange={setInput}
        />
        <Stack
          direction="row"
          spacing={1.5}
          useFlexGap
          flexWrap="wrap"
          sx={{ mt: 1.25, pt: 1.25, borderTop: 1, borderColor: "divider" }}
        >
          <AnalysisSelect
            label="Date Range"
            value={dateRange}
            onChange={setDateRange}
            items={["Last 7 days", "Last 30 days", "This month", "All"]}
          />
          <AnalysisSelect
            label="SKU"
            value={sku}
            onChange={setSku}
            items={[
              "All",
              "185/65 R15",
              "205/55 R16",
              "195/65 R15",
              "215/60 R16",
              "225/65 R17",
            ]}
          />
          <AnalysisSelect
            label="Product Type"
            value={productType}
            onChange={setProductType}
            items={["All", "PCR", "LTR"]}
          />
          <AnalysisSelect
            label="Machine"
            value={machine}
            onChange={setMachine}
            items={[
              "All",
              "VMI Maxx-1",
              "VMI Maxx-2",
              "VMI Maxx-3",
              "VMI Maxx-4",
            ]}
          />
        </Stack>
      </AnalysisPanel>

      <KpiGrid
        minWidth={190}
        kpis={[
          "Matched Tyres",
          "Unmatched Tyres",
          "Correlation Score",
          "Relationship Strength",
          "Relationship",
        ].map((name) => ({ definition: { id: name, name }, live: null }))}
      />

      <AnalysisPanel title={`${input} → ${output}`}>
        <AnalysisEmptyState label="Scatter analysis unavailable" />
      </AnalysisPanel>
      <AnalysisPanel title="Correlation Summary">
        <AnalysisEmptyState label="Correlation data unavailable" />
      </AnalysisPanel>
      <AnalysisPanel title="Tyre-level Detail">
        <AnalysisEmptyState label="Tyre-level data unavailable" />
      </AnalysisPanel>
    </Stack>
  );
}

function AnalysisPanel({ title, children }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 1.75,
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        boxShadow: theme.custom.shadow,
      }}
    >
      <Typography sx={{ mb: 1.25, fontSize: 15, fontWeight: 750 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function AnalysisPills({ label, items, value, onChange }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "flex-start", sm: "center" }}
      spacing={1}
      sx={{ mb: 1 }}
    >
      <Typography sx={{ width: 116, fontSize: 11.5, color: "text.secondary" }}>
        {label}
      </Typography>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        {items.map((item) => (
          <Button
            key={item}
            size="small"
            variant={value === item ? "contained" : "outlined"}
            onClick={() => onChange?.(item)}
            disableElevation
            sx={{ borderRadius: 999, textTransform: "none", fontSize: 12 }}
          >
            {item}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

function AnalysisSelect({ label, value, onChange, items }) {
  return (
    <Box sx={{ minWidth: 150 }}>
      <Typography sx={{ mb: 0.5, fontSize: 11, color: "text.secondary" }}>
        {label}
      </Typography>
      <FormControl fullWidth size="small">
        <Select
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {items.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}

function AnalysisEmptyState({ label }) {
  return (
    <Box
      sx={{
        minHeight: 150,
        display: "grid",
        placeItems: "center",
        color: "text.disabled",
      }}
    >
      <Stack alignItems="center" spacing={0.75}>
        <QueryStatsOutlinedIcon sx={{ fontSize: 30 }} />
        <Typography sx={{ fontSize: 13 }}>{label}</Typography>
        <Typography sx={{ fontSize: 18, fontWeight: 800 }}>NA</Typography>
      </Stack>
    </Box>
  );
}

function UnavailableKpiCard({
  name,
  reason = "Data unavailable",
  isLoading = false,
  alignMetrics = false,
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        minHeight: 136,
        minWidth: 0,
        p: 1.75,
        display: "flex",
        flexDirection: "column",
        justifyContent: alignMetrics ? "flex-start" : "space-between",
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        boxShadow: theme.custom.shadow,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ minWidth: 0, mb: alignMetrics ? 1 : 0 }}
      >
        <GridViewOutlinedIcon sx={{ fontSize: 20, color: "text.disabled" }} />
        <Typography
          sx={{
            minWidth: 0,
            overflowWrap: "anywhere",
            fontSize: alignMetrics ? 15 : name.length > 30 ? 13 : 14.5,
            lineHeight: 1.25,
            fontWeight: 700,
            color: "text.primary",
          }}
        >
          {name}
        </Typography>
      </Stack>
      {isLoading ? (
        <CircularProgress size={26} aria-label={`Loading ${name}`} />
      ) : (
        <Typography
          sx={{
            fontSize: 28,
            lineHeight: 1.1,
            fontWeight: 800,
            color: "text.disabled",
          }}
        >
          NA
        </Typography>
      )}
      <Typography
        sx={{
          fontSize: 12,
          color: "text.disabled",
          mt: alignMetrics ? "auto" : 0,
          pt: alignMetrics ? 1.25 : 0,
        }}
      >
        {isLoading ? "Loading…" : reason}
      </Typography>
    </Box>
  );
}

function hasKpiValue(value) {
  if (value == null || value === "") return false;
  const normalized = String(value).trim().toLowerCase();
  return !["na", "n/a", "nan", "null", "—", "-"].includes(normalized);
}

export default BanmoreTechnical;
