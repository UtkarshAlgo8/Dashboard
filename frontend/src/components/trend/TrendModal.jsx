import { useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import JKLoader from "@/components/JKLoader.jsx";
import TimeRangeSelect from "@/components/production/TimeRangeSelect.jsx";
import { toDisplayDate } from "@/lib/dateFormat.js";
import LineChart from "./LineChart.jsx";
import MultiLineChart from "./MultiLineChart.jsx";
import BarChart from "./BarChart.jsx";
import ProgressChart from "./ProgressChart.jsx";
import MultiSelectPills from "./MultiSelectPills.jsx";
import PlanComplianceTrendModal from "./PlanComplianceTrendModal.jsx";
import { pickChartType } from "./pickChartType.js";
import { useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getTrend } from "@/api/trends.js";
import client from "@/api/client.js";
import { presetToDateRange } from "@/lib/timeRange.js";
import { canonicalUnit } from "@/lib/kpi-transformer.js";
import { isKg, kgToTonnes } from "@/lib/units.js";
import { DOWNTIME_REASONS } from "@/lib/downtime.js";
import {
  canonicalizeProductType,
  canonicalizeSubSection,
  denanDimension,
  isProductAgnosticKpi,
  preferScopedRows,
} from "@/lib/dashboardRowScopes.js";

/**
 * KPI Trend Analysis modal per BRD §9.3 (FR-X10 through FR-X17).
 *
 * Two paths share this modal:
 *
 *   1. OEE path — VIEW BY pills (Overall / Machine) on
 *      top of a multi-series main chart (one line per grouping value),
 *      plus an optional Machines filter that scopes which machines
 *      feed the chart and an optional combined-overlay chart below
 *      showing every picked overlay kpi on the same axes plus a legend.
 *      Spec: specs/10-trend-modal.md. Change log: specs/cr/CR-08.
 *
 *   2. Legacy single-series path — every other KPI (Production, Scrap,
 *      Downtime, …) keeps the original single-line behaviour.
 *
 * v2 fetch: use kpi.rawName (actual gold_dummy kpi_name like "OEE_o")
 * so we bypass the stale KPI_NAME_BY_ID map in getTrend. Falls back to
 * the legacy GET endpoint for KPIs without rawName.
 */
function TrendModal({
  open,
  onClose,
  plantId,
  kpi,
  section,
  category,
  compound,
  subSection = null,
  productType = null,
  // The unit pinned on the dashboard card (e.g. "Batch" / "KG"). Production is
  // recorded in BOTH a count unit and a mass unit, so the trend pins one to
  // avoid blending two series into a zig-zag.
  unit = null,
  asOf = null,
}) {
  const theme = useTheme();
  const toast = useToast();
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Each time the modal opens, start with the monthly trend view regardless
  // of the dashboard's current time-range selection.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setRange("month");
      setFrom("");
      setTo("");
    }
  }

  if (!kpi) return null;

  // Route OEE / Production / Downtime to the multi-series pills UI;
  // everything else keeps the legacy single-series form.
  if (kpi.id === "oee") {
    return (
      <OeeTrendModal
        open={open}
        onClose={onClose}
        plantId={plantId}
        kpi={kpi}
        section={section}
        subSection={subSection}
        productType={productType}
        asOf={asOf}
        range={range}
        from={from}
        to={to}
        onRangeChange={setRange}
        onFromChange={setFrom}
        onToChange={setTo}
        theme={theme}
      />
    );
  }
  if (kpi.id === "prod" || kpi.id === "production") {
    return (
      <ProductionTrendModal
        open={open}
        onClose={onClose}
        plantId={plantId}
        kpi={kpi}
        section={section}
        subSection={subSection}
        productType={productType}
        asOf={asOf}
        range={range}
        from={from}
        to={to}
        onRangeChange={setRange}
        onFromChange={setFrom}
        onToChange={setTo}
        theme={theme}
      />
    );
  }
  if (kpi.id === "downtime") {
    return (
      <DowntimeTrendModal
        open={open}
        onClose={onClose}
        plantId={plantId}
        kpi={kpi}
        section={section}
        subSection={subSection}
        productType={productType}
        asOf={asOf}
        range={range}
        from={from}
        to={to}
        onRangeChange={setRange}
        onFromChange={setFrom}
        onToChange={setTo}
        theme={theme}
      />
    );
  }
  if (
    kpi.id === "comp" ||
    kpi.rawName === "Plan_Compliance" ||
    kpi.name?.toLowerCase().includes("plan") ||
    kpi.name?.toLowerCase().includes("fulfillment")
  ) {
    return (
      <PlanComplianceTrendModal
        open={open}
        onClose={onClose}
        plantId={plantId}
        kpi={kpi}
        section={section}
        subSection={subSection}
        productType={productType}
        asOf={asOf}
        range={range}
        from={from}
        to={to}
        onRangeChange={setRange}
        onFromChange={setFrom}
        onToChange={setTo}
      />
    );
  }
  return (
    <LegacyTrendModal
      open={open}
      onClose={onClose}
      plantId={plantId}
      kpi={kpi}
      section={section}
      category={category}
      compound={compound}
      subSection={subSection}
      productType={productType}
      unit={unit}
      asOf={asOf}
      range={range}
      from={from}
      to={to}
      onRangeChange={setRange}
      onFromChange={setFrom}
      onToChange={setTo}
      toast={toast}
      theme={theme}
    />
  );
}

/* =========================================================================
 * Legacy single-series modal — preserved verbatim for non-OEE KPIs.
 * The original implementation lives here; only the shell (DialogTitle,
 * close button) is shared via the modal frame.
 * ========================================================================= */

function LegacyTrendModal({
  open,
  onClose,
  plantId,
  kpi,
  section,
  category,
  compound,
  subSection,
  productType,
  unit,
  asOf,
  range,
  from,
  to,
  onRangeChange,
  onFromChange,
  onToChange,
  toast,
  theme,
}) {
  // Resolve the active date range (preset OR custom) to ISO from/to,
  // anchored to the as-of date (BRD §13.5).
  const resolved = presetToDateRange({ preset: range, from, to }, asOf);
  const isMonthly = range === "month" && !from && !to;
  const isDailyTrend = range === "today" && !from && !to;
  const anchorIso = asOf ?? resolved.to ?? null;
  const monthlyFrom = anchorIso
    ? `${anchorIso.slice(0, 4)}-01-01`
    : resolved.from;
  const monthlyTo = anchorIso ?? resolved.to;
  const dailyFrom = anchorIso ? `${anchorIso.slice(0, 7)}-01` : resolved.from;
  const dailyTo = anchorIso ?? resolved.to;

  const sectionName = sectionIdToName(section);

  // realdata.md §3: real granularities are MONTH (monthly), DAY otherwise.
  const v2Granularity = isMonthly
    ? "MONTH"
    : range === "year"
      ? "MONTH"
      : "DAY";
  const useV2 = Boolean(kpi?.rawName);
  const shouldSendProductType =
    Boolean(productType) &&
    (category === "p" ||
      category === "q" ||
      category === "P" ||
      category === "Q");
  const v2Payload = useV2
    ? {
        plantId,
        context: {
          section: sectionName,
          category: categoryIdToName(category),
          granularity: v2Granularity,
          ...(subSection ? { sub_section: subSection } : {}),
          ...(shouldSendProductType ? { product_type: productType } : {}),
        },
        date: null,
        from: isDailyTrend
          ? dailyFrom
          : isMonthly
            ? monthlyFrom
            : resolved.from,
        to: isDailyTrend ? dailyTo : isMonthly ? monthlyTo : resolved.to,
        drillKpis: [kpi.rawName],
        drillOnly: true,
        limit: 10000,
      }
    : null;

  const { data: v2Rows, isLoading: v2Loading } = usePolledQuery(
    v2Payload
      ? () =>
          client.post("/dashboard/kpi-data", v2Payload).then((r) => r.data ?? r)
      : () => null,
    {
      enabled: Boolean(v2Payload),
      interval: 0,
      deps: [JSON.stringify(v2Payload)],
    },
  );

  const {
    data: legacyData,
    isLoading: legacyLoading,
    error: legacyError,
  } = usePolledQuery(
    () =>
      getTrend({
        plantId,
        kpiId: kpi?.id,
        section,
        category,
        range,
        from,
        to,
        compound,
      }),
    {
      enabled: open && Boolean(kpi) && !useV2,
      interval: 0,
      deps: [open, kpi?.id, section, category, range, from, to],
    },
  );

  if (legacyError) toast.error("Could not load trend data.");

  const isLoading = useV2 ? v2Loading : legacyLoading;

  // Production is stored in KG but charted in MT (kpi.unit is already "MT"
  // from the transformer), so a KG row's value is divided by 1000 here to
  // match the axis/tooltip label. Non-KG rows pass through. See lib/units.js.
  const rowVal = (r) => {
    const v = numOrNull(r?.actual_value);
    return isKg(r?.unit_of_measurement) ? kgToTonnes(v) : v;
  };

  let labels = [];
  let values = [];
  if (useV2 && Array.isArray(v2Rows)) {
    const scoped = v2Rows.filter((r) => {
      if (r.section !== sectionName || r.kpi_name !== kpi.rawName) return false;
      if (subSection && r.sub_section !== subSection) return false;
      if (
        productType &&
        !isProductAgnosticKpi(kpi.rawName) &&
        denanDimension(r.product_type) !== productType
      ) {
        return false;
      }
      return true;
    });
    const productPinned = isProductAgnosticKpi(kpi.rawName)
      ? preferScopedRows(scoped, productType)
      : scoped;

    const pinned = (() => {
      const units = new Set(
        productPinned
          .map((r) => canonicalUnit(r.unit_of_measurement))
          .filter(Boolean),
      );
      if (units.size <= 1 || !unit) return productPinned;
      const pin = canonicalUnit(unit);
      const only = productPinned.filter(
        (r) => canonicalUnit(r.unit_of_measurement) === pin,
      );
      return only.length > 0 ? only : productPinned;
    })();

    if (isMonthly) {
      const byMonth = new Map();
      for (const r of pinned) {
        if (r.granularity !== "MONTH") continue;
        const mk = monthKey(r.date);
        if (!mk) continue;
        const prev = byMonth.get(mk);
        if (!prev || dateKey(r.date) > dateKey(prev.date)) byMonth.set(mk, r);
      }
      const months = [...byMonth.keys()].sort();
      labels = months;
      values = months.map((m) => rowVal(byMonth.get(m)));
    } else if (range === "year") {
      const byYear = new Map();
      for (const r of pinned) {
        if (r.granularity !== "MONTH") continue;
        const yk = dateKey(r.date).slice(0, 4);
        if (!yk) continue;
        const prev = byYear.get(yk);
        if (!prev || dateKey(r.date) > dateKey(prev.date)) byYear.set(yk, r);
      }
      const years = [...byYear.keys()].sort();
      labels = years;
      values = years.map((y) => rowVal(byYear.get(y)));
    } else {
      const sorted = pinned
        .filter((r) => r.granularity === "DAY")
        .sort((a, b) => (dateKey(a.date) > dateKey(b.date) ? 1 : -1));
      labels = sorted.map((r) => toDisplayDate(r.date) ?? "");
      values = sorted.map((r) => rowVal(r));
    }
  } else if (legacyData) {
    labels = legacyData.labels ?? [];
    values = legacyData.values ?? [];
  }

  const chartType = pickChartType(kpi.id, kpi.unit, kpi.name);

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      kpi={kpi}
      headerExtras={
        <TimeRangeSelect
          preset={range}
          variant="trend"
          presetLabels={{ today: "Daily", month: "Monthly", year: "Yearly" }}
          from={from}
          to={to}
          onPresetChange={(p) => {
            const next = typeof p === "string" ? p : (p?.preset ?? "month");
            onRangeChange(next);
            onFromChange("");
            onToChange("");
          }}
          onFromChange={(v) => {
            onFromChange(v);
            onRangeChange("custom");
          }}
          onToChange={(v) => {
            onToChange(v);
            onRangeChange("custom");
          }}
        />
      }
    >
      <Box
        sx={{
          backgroundColor: theme.custom.surface.soft,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
          p: 2,
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isLoading && values.length === 0 ? (
          <ChartSkeleton />
        ) : values.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: "text.disabled" }}>
            No trend data for this period.
          </Typography>
        ) : chartType === "line" ? (
          <LineChart
            labels={labels}
            values={values}
            unit={kpi.unit}
            target={kpi.target ?? null}
          />
        ) : chartType === "bar" ? (
          <BarChart
            labels={labels}
            values={values}
            unit={kpi.unit}
            target={kpi.target ?? null}
          />
        ) : (
          <ProgressChart
            value={kpi.value}
            unit={kpi.unit}
            target={kpi.target ?? null}
          />
        )}
      </Box>
    </ModalFrame>
  );
}

/* =========================================================================
 * Multi-series trend modal — shared implementation for the OEE and
 * Production trend paths. Parameterised by a `seriesConfig` (see the
 * config block above) so the same UI handles both KPIs; only the data
 * layer differs. Specs/cr/CR-08 + CR-09.
 * ========================================================================= */

// OEE has no product-type lens: product_type is a Production-only
// dimension (the gold layer's OEE rows carry no product split, so the
// pill only ever produced a tyre_type re-cut of the same numbers).
const VIEW_BY_OPTIONS = [
  { value: "overall", label: "Overall" },
  { value: "machine", label: "Machine" },
];

const VIEW_BY_LABEL = Object.fromEntries(
  VIEW_BY_OPTIONS.map((o) => [o.value, o.label]),
);

// Production adds SKU to the lens set — CR-09.
const PRODUCTION_VIEW_BY_OPTIONS = [
  { value: "overall", label: "Overall" },
  { value: "product_type", label: "Product Type" },
  { value: "machine", label: "Machine" },
  { value: "sku", label: "SKU" },
];

const PRODUCTION_VIEW_BY_LABEL = Object.fromEntries(
  PRODUCTION_VIEW_BY_OPTIONS.map((o) => [o.value, o.label]),
);

// Each overlay has one or more valid kpi_names. Availability picks the
// suffix aligned with the active VIEW BY so a Machine comparison overlays
// the per-machine Availability, etc. Production is section-conditional
// (TBM/Curing read Production_product; Mixing/Stock read Production).
const OVERLAY_BASE_KPI = {
  Breakdown: "Breakdown",
  Production: "Production",
  Scrap: "Scrap",
  Availability: "Availability",
};

const OVERLAY_AVAILABILITY_BY_VIEW = {
  overall: "Availability_o",
  machine: "Availability_m",
};

const PRODUCTION_KPI_BY_SECTION = {
  TBM: "Production_product",
  Curing: "Production_product",
  Mixing: "Production",
  Stock: "Production",
};

const AGGREGATE_PRODUCT_BY_SECTION = {
  TBM: "Green Tyre",
  Curing: "Cured Tyre",
};

// The Production trend reads a different stored leaf per lens — the
// base (section) row carries no machine and no itemcode, so grouping it
// by those fields produced an empty chart. Same mapping as
// ProductionDrillPanel: machine -> Production_m, SKU -> Production_sku.
function productionKpiName(viewBy, sectionName) {
  if (viewBy === "machine") return "Production_m";
  if (viewBy === "sku") return "Production_sku";
  return PRODUCTION_KPI_BY_SECTION[sectionName] ?? "Production";
}

function overlayKpiName(overlayValue, viewBy, sectionName) {
  if (overlayValue === "Availability") {
    return OVERLAY_AVAILABILITY_BY_VIEW[viewBy] ?? "Availability_o";
  }
  if (overlayValue === "Production") {
    if (viewBy === "machine") return "Production_m";
    if (sectionName === "TBM" || sectionName === "Curing") {
      return "Production_product";
    }
    return PRODUCTION_KPI_BY_SECTION[sectionName] ?? "Production";
  }
  return OVERLAY_BASE_KPI[overlayValue] ?? overlayValue;
}

const OVERLAY_OPTIONS = [
  { value: "Breakdown", label: "+ Breakdown" },
  { value: "Production", label: "+ Production" },
  { value: "Scrap", label: "+ Scrap" },
  { value: "Availability", label: "+ Availability" },
];

/* =========================================================================
 * Multi-series modal config — drives the shared `MultiSeriesTrendModal`
 * for the OEE and Production trend paths. Everything that varies between
 * the two lenses is captured here so the modal implementation stays
 * generic. See specs/cr/CR-09-production-plot.md.
 *
 * shape:
 *   viewByOptions             [{ value, label }]
 *   defaultViewBy             "overall"
 *   mainKpiName(viewBy, sec)  → string | string[]   (one or many kpi_names per fetch)
 *   groupField(viewBy)        → string | null  (chart line grouping)
 *   machineFilterVisibility   (viewBy) → boolean
 *   skuFilterVisibility       (viewBy) → boolean
 *   showCompare               (viewBy) → boolean
 *   showOverlay               boolean
 *   mainUnit                  string   (chart y-axis unit)
 *   mainTitleSuffix           string   (e.g. "OEE", "Production — MT")
 *   viewByLabel               (viewBy) → string
 * ========================================================================= */

const OEE_SERIES_CONFIG = {
  viewByOptions: VIEW_BY_OPTIONS,
  defaultViewBy: "overall",
  mainKpiName: (viewBy) => (viewBy === "machine" ? "OEE_m" : "OEE_o"),
  groupField: (viewBy) => (viewBy === "machine" ? "machine" : null),
  machineFilterVisibility: (viewBy) => viewBy === "machine",
  skuFilterVisibility: () => false,
  // No product-type lens left, so there is nothing to compare — the
  // Machines filter plays that role in the Machine view.
  showCompare: () => false,
  showOverlay: true,
  mainMonthlyAggregation: () => "average",
  mainUnit: "%",
  mainTitleSuffix: "OEE",
  viewByLabel: (viewBy) => VIEW_BY_LABEL[viewBy] ?? "Overall",
};

function buildProductionSeriesConfig(sectionName, kpi) {
  return {
    viewByOptions: PRODUCTION_VIEW_BY_OPTIONS,
    defaultViewBy: "overall",
    mainKpiName: (viewBy) => productionKpiName(viewBy, sectionName),
    // Production rows DO carry product_type (NOT in
    // PRODUCT_AGNOSTIC_KPIS), so the "Product Type" pill groups by
    // the real product_type column. SKU lives in `itemcode` on the
    // Production_sku rows (NOT sub_section — that is the trench/line).
    groupField: (viewBy) =>
      ({
        machine: "machine",
        product_type: "product_type",
        sku: "itemcode",
      })[viewBy] ?? null,
    skuField: "itemcode",
    machineFilterVisibility: (viewBy) =>
      viewBy === "machine" || viewBy === "product_type",
    skuFilterVisibility: (viewBy) => viewBy === "sku",
    showCompare: (viewBy) => viewBy === "product_type",
    showOverlay: false,
    mainMonthlyAggregation: () => "sum",
    mainUnit: kpi?.unit ?? "",
    mainTitleSuffix: kpi?.name ?? "Production",
    viewByLabel: (viewBy) => PRODUCTION_VIEW_BY_LABEL[viewBy] ?? "Overall",
  };
}

// CR-11: Downtime series config. mainKpiName returns the 6
// availability-loss reason leaves (the MultiSeriesTrendModal
// handles arrays — see line 631). Overall sums them per date; Reason
// groups by kpi_name so each reason becomes its own line. No
// overlay row (overlays don't carry reason semantics).
const DOWNTIME_VIEW_BY_OPTIONS = [
  { value: "overall", label: "Overall" },
  { value: "reason", label: "Reason" },
];
const DOWNTIME_VIEW_BY_LABEL = Object.fromEntries(
  DOWNTIME_VIEW_BY_OPTIONS.map((o) => [o.value, o.label]),
);

function buildDowntimeSeriesConfig() {
  return {
    viewByOptions: DOWNTIME_VIEW_BY_OPTIONS,
    defaultViewBy: "overall",
    mainKpiName: () => DOWNTIME_REASONS,
    groupField: (viewBy) => (viewBy === "reason" ? "kpi_name" : null),
    machineFilterVisibility: (viewBy) => viewBy === "reason",
    skuFilterVisibility: () => false,
    showCompare: () => false,
    showOverlay: false,
    mainUnit: "min",
    mainTitleSuffix: "Downtime",
    viewByLabel: (viewBy) => DOWNTIME_VIEW_BY_LABEL[viewBy] ?? "Overall",
  };
}

function MultiSeriesTrendModal({
  open,
  onClose,
  plantId,
  kpi,
  section,
  // The dashboard's active scope. The trend must show the SAME slice the
  // user is looking at: a Stock sub-section tab ("4 Roll") and a product
  // pill ("Belt Mother Roll") both narrow the chart.
  subSection = null,
  productType = null,
  asOf,
  range,
  from,
  to,
  onRangeChange,
  onFromChange,
  onToChange,
  theme,
  config,
}) {
  const viewByOptions = config.viewByOptions;

  // Default VIEW BY from the config; compare + overlays start empty;
  // machines + sku filters start empty (= all rows pass through).
  const [viewBy, setViewBy] = useState(config.defaultViewBy);
  // A pinned dimension can remove the lens that is currently active
  // (open the modal, pick Product Type, change the pill outside). Fall
  // back to the default lens rather than rendering an unselected row.
  const viewByIsValid = viewByOptions.some((o) => o.value === viewBy);
  if (!viewByIsValid && viewBy !== config.defaultViewBy) {
    setViewBy(config.defaultViewBy);
  }
  const [compare, setCompare] = useState([]);
  const [overlays, setOverlays] = useState([]);
  // Multi-select filters — scope which machines' / sub_sections' rows
  // feed the chart. Empty = all rows pass. Visibility per viewBy is
  // config-driven; both states are always present so React hook order
  // is stable across viewBy changes.
  const [machines, setMachines] = useState([]);
  const [sku, setSku] = useState([]);

  // Reset compare when VIEW BY flips — the previous selection's IDs may
  // not exist in the new lens (machines vs sub_sections vs shifts).
  const [prevViewBy, setPrevViewBy] = useState(viewBy);
  if (prevViewBy !== viewBy) {
    setPrevViewBy(viewBy);
    setCompare([]);
  }

  // Date range resolution (mirrors the legacy modal so the URL/dash copy
  // stays in sync — the user expects the Trend range to match the card).
  const resolved = presetToDateRange({ preset: range, from, to }, asOf);
  const anchorIso = asOf ?? resolved.to ?? null;
  const monthlyFrom = anchorIso
    ? `${anchorIso.slice(0, 4)}-01-01`
    : resolved.from;
  const monthlyTo = anchorIso ?? resolved.to;
  const dailyFrom = anchorIso ? `${anchorIso.slice(0, 7)}-01` : resolved.from;
  const dailyTo = anchorIso ?? resolved.to;
  const isMonthly = range === "month" && !from && !to;
  const isDailyTrend = range === "today" && !from && !to;
  const rangeFrom = isDailyTrend
    ? dailyFrom
    : isMonthly
      ? monthlyFrom
      : resolved.from;
  const rangeTo = isDailyTrend ? dailyTo : isMonthly ? monthlyTo : resolved.to;

  // Productivity and Quality use separate requests because the backend
  // applies category as an exact predicate. The kpi_name(s) come from the
  // config so the same modal handles OEE / Production and Downtime too.
  const sectionName = sectionIdToName(section);
  const mainKpis = useMemo(() => {
    const raw = config.mainKpiName(viewBy, sectionName);
    return Array.isArray(raw) ? raw : [raw];
  }, [config, viewBy, sectionName]);
  const overlayKpis = config.showOverlay
    ? overlays.map((o) => overlayKpiName(o, viewBy, sectionName))
    : [];
  const qualityOverlayKpis = config.showOverlay
    ? overlays
        .filter((o) => o === "Scrap")
        .map((o) => overlayKpiName(o, viewBy, sectionName))
    : [];
  const productivityOverlayKpis = overlayKpis.filter(
    (kpiName) => !qualityOverlayKpis.includes(kpiName),
  );

  const singlePayload = {
    plantId,
    context: {
      section: sectionName,
      category: "Productivity",
      granularity: "DAY",
      // Scope the request too, not just the rows we keep: an unscoped
      // Stock SKU fetch runs close to the 10k row cap and would silently
      // truncate days off the chart. The backend keeps product-agnostic
      // KPIs (OEE / Downtime overlays) alive through these filters.
      ...(subSection ? { sub_section: subSection } : {}),
      ...(productType ? { product_type: productType } : {}),
    },
    from: rangeFrom,
    to: rangeTo,
    drillKpis:
      productivityOverlayKpis.length > 0
        ? [...mainKpis, ...productivityOverlayKpis]
        : mainKpis,
    drillOnly: true,
    limit: 10000,
  };

  const { data: singleRows, isLoading: singleLoading } = usePolledQuery(
    () =>
      client
        .post("/dashboard/kpi-data", singlePayload)
        .then((r) => r.data ?? r),
    {
      enabled: Boolean(singlePayload),
      interval: 0,
      deps: [JSON.stringify(singlePayload)],
      // Clear the previous slice on every date or lens change. Showing the
      // old chart while the new request is pending is misleading, especially
      // when the new range has a different number of points.
      keepPreviousData: false,
    },
  );

  const qualityPayload =
    qualityOverlayKpis.length > 0
      ? {
          ...singlePayload,
          context: { ...singlePayload.context, category: "Quality" },
          drillKpis: qualityOverlayKpis,
        }
      : null;

  const { data: qualityRows, isLoading: qualityLoading } = usePolledQuery(
    () =>
      client
        .post("/dashboard/kpi-data", qualityPayload)
        .then((r) => r.data ?? r),
    {
      enabled: Boolean(qualityPayload),
      interval: 0,
      deps: [JSON.stringify(qualityPayload)],
      keepPreviousData: false,
    },
  );

  const allRows = useMemo(() => {
    const productivityRows = Array.isArray(singleRows) ? singleRows : [];
    const scrapRows = Array.isArray(qualityRows) ? qualityRows : [];
    return [...productivityRows, ...scrapRows];
  }, [singleRows, qualityRows]);

  // Apply the dashboard's scope to every row before anything reads them,
  // so the filter options, the chart and the overlays all describe the
  // same slice the user has selected outside. A row that carries NO value
  // for a pinned dimension is kept — those are the section-level roll-ups
  // that belong to every slice; only a row explicitly belonging to another
  // sub-section / product is dropped.
  const scopedRows = useMemo(() => {
    if (!Array.isArray(allRows)) return [];
    const pinnedSub = canonicalizeSubSection(subSection);
    const pinnedProduct = canonicalizeProductType(productType);
    if (!pinnedSub && !pinnedProduct) return allRows;
    const matches = (rowValue, pinned, canon) => {
      if (!pinned) return true;
      const v = canon(rowValue);
      if (v == null) return true;
      return v.toLowerCase() === pinned.toLowerCase();
    };
    return allRows.filter(
      (r) =>
        matches(r.sub_section, pinnedSub, canonicalizeSubSection) &&
        matches(r.product_type, pinnedProduct, canonicalizeProductType),
    );
  }, [allRows, subSection, productType]);

  // Distinct machine + SKU values from the scoped rows — the Autocomplete
  // options for each filter. Empty while loading.
  const machineOptions = useMemo(() => {
    const set = new Set();
    for (const r of scopedRows) if (r.machine) set.add(r.machine);
    return [...set].sort();
  }, [scopedRows]);

  // Which column holds the SKU identity is config-driven — Production
  // stores it in `itemcode`.
  const skuField = config.skuField ?? "sub_section";
  const skuOptions = useMemo(() => {
    const set = new Set();
    for (const r of scopedRows) if (r[skuField]) set.add(r[skuField]);
    return [...set].sort();
  }, [scopedRows, skuField]);

  // Split the scoped rows by kpi_name into mainRows + (optional) overlay rows.
  // mainKpis may be an array (Downtime fetches 6 reasons in one call);
  // filter via Set membership.
  const rawMainRows = useMemo(() => {
    if (mainKpis.length === 1) {
      const k = mainKpis[0];
      return scopedRows.filter((r) => r.kpi_name === k);
    }
    const allowed = new Set(mainKpis);
    return scopedRows.filter((r) => allowed.has(r.kpi_name));
  }, [scopedRows, mainKpis]);

  // Production stores the same quantity under two units (e.g. nos + kg)
  // as separate rows. Without a pin they collide on (group, date) and
  // the chart shows whichever row arrived last. Pin to the unit the
  // card was opened with; fall back to every row when nothing matches.
  const mainRows = useMemo(() => {
    const pin = canonicalUnit(kpi?.unit);
    if (!pin) return rawMainRows;
    const units = new Set(
      rawMainRows
        .map((r) => canonicalUnit(r.unit_of_measurement))
        .filter(Boolean),
    );
    if (units.size <= 1) return rawMainRows;
    const only = rawMainRows.filter(
      (r) => canonicalUnit(r.unit_of_measurement) === pin,
    );
    return only.length > 0 ? only : rawMainRows;
  }, [rawMainRows, kpi?.unit]);

  // Apply the Machines + SKU filters to mainRows before grouping.
  // Empty selection in either = all rows pass through that filter.
  const filteredMainRows = useMemo(() => {
    if (machines.length === 0 && sku.length === 0) return mainRows;
    const allowedMachines = machines.length > 0 ? new Set(machines) : null;
    const allowedSku = sku.length > 0 ? new Set(sku) : null;
    return mainRows.filter((r) => {
      if (allowedMachines && !allowedMachines.has(r.machine)) return false;
      if (allowedSku && !allowedSku.has(r[skuField])) return false;
      return true;
    });
  }, [mainRows, machines, sku, skuField]);

  const overlayRowsByKpi = useMemo(() => {
    const out = {};
    if (!config.showOverlay || !overlays.length) return out;
    for (const r of scopedRows) {
      if (mainKpis.includes(r.kpi_name)) continue;
      if (!out[r.kpi_name]) out[r.kpi_name] = [];
      out[r.kpi_name].push(r);
    }
    return out;
  }, [overlays, scopedRows, mainKpis, config.showOverlay]);

  // Build COMPARE options from the filtered main rows. Group by the
  // active viewBy's field so a brand-new value in the gold layer
  // shows up automatically. The row is hidden when
  // config.showCompare(viewBy) is false (Machine / SKU views — the
  // matching filter takes its role; Overall — no grouping).
  const compareOptions = useMemo(() => {
    const field = config.groupField(viewBy);
    if (!field) return [];
    const set = new Set();
    for (const r of filteredMainRows) {
      const v = r[field];
      if (v) set.add(v);
    }
    return [...set].sort().map((v) => ({ value: v, label: v }));
  }, [config, viewBy, filteredMainRows]);

  // Default-fill compare when the user hasn't picked anything yet. The
  // filter prunes stale IDs after a viewBy switch.
  const activeCompare = useMemo(() => {
    const validIds = new Set(compareOptions.map((o) => o.value));
    const filtered = (compare ?? []).filter((c) => validIds.has(c));
    return filtered.length > 0 ? filtered : compareOptions.map((o) => o.value);
  }, [compare, compareOptions]);

  // Group filtered rows by the active VIEW BY's grouping field.
  // buildMainChart turns the shape into one (labels, series) bundle
  // ready for MultiLineChart.
  const mainChart = useMemo(
    () =>
      buildMainChart({
        mainRows: filteredMainRows,
        groupField: config.groupField(viewBy),
        activeCompare,
        isMonthly,
        monthlyAggregation: config.mainMonthlyAggregation?.(viewBy),
      }),
    [filteredMainRows, config, viewBy, activeCompare, isMonthly],
  );

  // The chart title reflects the active VIEW BY lens + the KPI's
  // unit/suffix (e.g. "Product Type · OEE — Daily" / "Machine ·
  // Production — MT — Monthly").
  const mainTitle = useMemo(() => {
    const lens = config.viewByLabel(viewBy);
    const suffix = isMonthly ? "Monthly" : "Daily";
    return `${lens} · ${config.mainTitleSuffix} — ${suffix}`;
  }, [config, viewBy, isMonthly]);

  // Combined overlay chart — one line per picked overlay, sharing the
  // same date axis. Only built when overlays are enabled in config;
  // empty otherwise (the overlay chart panel is also hidden).
  const overlayChart = useMemo(() => {
    if (!config.showOverlay || overlays.length === 0) {
      return { labels: [], series: [] };
    }

    const machineView = viewBy === "machine";
    const allowedMachines = machines.length > 0 ? new Set(machines) : null;
    const perOverlayRows = overlays.map((overlayValue) => {
      const kpiName = overlayKpiName(overlayValue, viewBy, sectionName);
      let rows = overlayRowsByKpi[kpiName] ?? [];
      if (overlayValue === "Production") {
        rows = preferProductionOverlayRows(rows, sectionName, productType);
      }
      if (isMonthly && machineView) {
        rows = rows.filter(
          (r) =>
            r.machine && (!allowedMachines || allowedMachines.has(r.machine)),
        );
      } else if (isMonthly) {
        // Prefer section rollups so an overall chart does not double-count
        // a rollup row together with its machine children.
        const overallRows = rows.filter((r) => !r.machine);
        if (overallRows.length > 0) rows = overallRows;
      }
      return { overlayValue, rows };
    });

    if (!isMonthly) {
      const dateSet = new Set();
      for (const { rows } of perOverlayRows) {
        for (const r of rows) if (r.date) dateSet.add(r.date);
      }
      const dates = [...dateSet].sort();
      const labels = dates.map((d) => toDisplayDate(d) ?? "");
      const series = perOverlayRows.map(({ overlayValue, rows }) => {
        const meta = OVERLAY_OPTIONS.find((o) => o.value === overlayValue);
        const displayLabel = meta?.label?.replace(/^\+\s*/, "") ?? overlayValue;
        const byDate = new Map(
          rows.map((r) => [r.date, numOrNull(r.actual_value)]),
        );
        return {
          name: displayLabel,
          values: dates.map((d) => byDate.get(d) ?? null),
          unit: overlayUnit(overlayValue),
        };
      });
      return { labels, series };
    }

    const monthSet = new Set();
    for (const { rows } of perOverlayRows) {
      for (const r of rows) {
        const mk = monthKey(r.date);
        if (mk) monthSet.add(mk);
      }
    }
    const months = [...monthSet].sort();
    const labels = months.map(toDisplayMonth);
    const series = [];
    for (const { overlayValue, rows } of perOverlayRows) {
      const meta = OVERLAY_OPTIONS.find((o) => o.value === overlayValue);
      const displayLabel = meta?.label?.replace(/^\+\s*/, "") ?? overlayValue;
      const rowsBySeries = new Map();
      for (const r of rows) {
        const mk = monthKey(r.date);
        const value = numOrNull(r.actual_value);
        if (!mk || value == null) continue;
        const seriesKey = machineView ? r.machine : "overall";
        if (!rowsBySeries.has(seriesKey))
          rowsBySeries.set(seriesKey, new Map());
        const monthValues = rowsBySeries.get(seriesKey);
        if (!monthValues.has(mk)) monthValues.set(mk, []);
        monthValues.get(mk).push(value);
      }
      const aggregation = overlayAggregation(overlayValue, machineView);
      for (const seriesKey of [...rowsBySeries.keys()].sort()) {
        const monthValues = rowsBySeries.get(seriesKey);
        series.push({
          name: machineView ? `${displayLabel} · ${seriesKey}` : displayLabel,
          values: months.map((month) =>
            aggregateValues(monthValues.get(month) ?? [], aggregation),
          ),
          unit: overlayUnit(overlayValue),
        });
      }
    }
    return { labels, series };
  }, [
    overlays,
    viewBy,
    machines,
    sectionName,
    productType,
    overlayRowsByKpi,
    config.showOverlay,
    isMonthly,
  ]);

  const overlayLabels = overlayChart.labels;
  const overlaySeries = overlayChart.series;

  const loading = singleLoading || qualityLoading;
  const hasMainData = mainChart.series.length > 0;
  // COMPARE + filter visibility are config-driven per view-by.
  const showCompare = config.showCompare(viewBy);
  const showMachinesFilter = config.machineFilterVisibility(viewBy);
  const showSkuFilter = config.skuFilterVisibility(viewBy);
  // Spell out the inherited scope so the numbers aren't silently narrower
  // than the section header suggests.
  const scopeLabel = [
    canonicalizeSubSection(subSection),
    canonicalizeProductType(productType),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      kpi={kpi}
      headerExtras={
        <TimeRangeSelect
          preset={range}
          variant="trend"
          presetLabels={{ today: "Daily", month: "Monthly", year: "Yearly" }}
          from={from}
          to={to}
          onPresetChange={(p) => {
            const next = typeof p === "string" ? p : (p?.preset ?? "month");
            onRangeChange(next);
            onFromChange("");
            onToChange("");
          }}
          onFromChange={(v) => {
            onFromChange(v);
            onRangeChange("custom");
          }}
          onToChange={(v) => {
            onToChange(v);
            onRangeChange("custom");
          }}
        />
      }
    >
      <Stack spacing={2}>
        <Stack spacing={1.25}>
          <SingleSelectRow
            label="View by"
            value={viewBy}
            onChange={setViewBy}
            options={viewByOptions}
          />
          {scopeLabel && (
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
              Scoped to {scopeLabel} — set on the dashboard.
            </Typography>
          )}
          {showMachinesFilter && (
            <FilterRow
              label="Machines"
              options={machineOptions}
              value={machines}
              onChange={setMachines}
              placeholder="All machines"
            />
          )}
          {showSkuFilter && (
            <FilterRow
              label="SKU"
              options={skuOptions}
              value={sku}
              onChange={setSku}
              placeholder="All SKUs"
            />
          )}
          {showCompare && (
            <MultiSelectPills
              label="Compare"
              options={compareOptions}
              value={activeCompare}
              onChange={setCompare}
            />
          )}
          {config.showOverlay && (
            <MultiSelectPills
              label="Overlay"
              options={OVERLAY_OPTIONS}
              value={overlays}
              onChange={setOverlays}
            />
          )}
        </Stack>

        {/* Main chart — VIEW BY lens, one line per COMPARE item. */}
        <ChartPanel
          theme={theme}
          title={mainTitle}
          loading={loading}
          empty={!hasMainData}
          emptyMessage={
            loading
              ? "Loading…"
              : "No data for this combination — try another VIEW BY or date range."
          }
        >
          {hasMainData && (
            <MultiLineChart
              labels={mainChart.labels}
              series={mainChart.series}
              unit={config.mainUnit}
            />
          )}
        </ChartPanel>

        {/* Combined overlay chart — one line per picked overlay kpi,
            legend names carry each line's unit (%, min, MT, …). Units
            differ across overlays so this is a correlation view, not a
            magnitude view; the per-series tooltip shows the value with
            its own unit suffix. Only rendered when overlays are enabled
            in config (OEE only — Production has no overlay row). */}
        {config.showOverlay && overlays.length > 0 && (
          <ChartPanel
            theme={theme}
            title={`Overlays · ${isMonthly ? "Monthly" : "Daily"}`}
            loading={loading}
            empty={overlaySeries.every((s) => s.values.every((v) => v == null))}
            emptyMessage={
              loading
                ? "Loading…"
                : "No overlay data for this combination — try a different VIEW BY or date range."
            }
          >
            <MultiLineChart labels={overlayLabels} series={overlaySeries} />
          </ChartPanel>
        )}
      </Stack>
    </ModalFrame>
  );
}

// Thin wrappers — each one supplies its seriesConfig and delegates to
// the shared implementation. Keeps the per-KPI data layer (kpi_name
// mapping, group fields, filter visibility, overlay presence) in one
// place per KPI.
function OeeTrendModal(props) {
  return <MultiSeriesTrendModal {...props} config={OEE_SERIES_CONFIG} />;
}

function ProductionTrendModal(props) {
  const sectionName = sectionIdToName(props.section);
  const config = buildProductionSeriesConfig(sectionName, props.kpi);
  return <MultiSeriesTrendModal {...props} config={config} />;
}

function DowntimeTrendModal(props) {
  return (
    <MultiSeriesTrendModal {...props} config={buildDowntimeSeriesConfig()} />
  );
}

/* =========================================================================
 * Small helpers + shared frame.
 * ========================================================================= */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toDisplayMonth(mKey) {
  if (!mKey || !mKey.includes("-")) return mKey;
  const parts = mKey.split("-");
  const monthIdx = Number.parseInt(parts[1], 10) - 1;
  return MONTH_NAMES[monthIdx] || mKey;
}

// Build the (labels, series) bundle for the main chart.
// - groupField provided → one series per distinct value of that
//   field (machine / sub_section / tyre_type / product_type, per
//   the calling config).
// - groupField null → a single "Overall" series (the section
//   aggregate).
function buildMainChart({
  mainRows,
  groupField,
  activeCompare,
  isMonthly = false,
  monthlyAggregation = "average",
}) {
  if (groupField) {
    return buildGroupedSeries({
      rows: mainRows,
      groupField,
      activeCompare,
      isMonthly,
      monthlyAggregation,
    });
  }

  if (isMonthly) {
    const monthMap = new Map();
    for (const r of mainRows) {
      if (!r.date) continue;
      const mk = monthKey(r.date);
      if (!mk) continue;
      const val = numOrNull(r.actual_value);
      if (val == null) continue;
      const prev = monthMap.get(mk) || {
        sum: 0,
        count: 0,
        latestVal: val,
        latestDate: r.date,
      };
      prev.sum += val;
      prev.count += 1;
      if (dateKey(r.date) >= dateKey(prev.latestDate)) {
        prev.latestVal = val;
        prev.latestDate = r.date;
      }
      monthMap.set(mk, prev);
    }
    const months = [...monthMap.keys()].sort();
    const labels = months.map(toDisplayMonth);
    const values = months.map((m) => {
      const entry = monthMap.get(m);
      if (!entry || entry.count === 0) return null;
      return aggregateValues(entry, monthlyAggregation);
    });
    return {
      labels,
      series: [{ name: "Overall", values }],
    };
  }

  // Overall: a single series named "Overall". The end of compare[] is
  // ignored (compare row isn't even shown in this mode).
  const dateSet = new Set();
  for (const r of mainRows) if (r.date) dateSet.add(r.date);
  const dates = [...dateSet].sort();
  const labels = dates.map((d) => toDisplayDate(d) ?? "");
  const byDate = new Map(
    mainRows.map((r) => [r.date, numOrNull(r.actual_value)]),
  );
  const values = dates.map((d) => byDate.get(d) ?? null);
  return {
    labels,
    series: [{ name: "Overall", values }],
  };
}

function buildGroupedSeries({
  rows,
  groupField,
  activeCompare,
  isMonthly = false,
  monthlyAggregation = "average",
}) {
  if (isMonthly) {
    const monthSet = new Set();
    for (const r of rows) {
      if (r.date) {
        const mk = monthKey(r.date);
        if (mk) monthSet.add(mk);
      }
    }
    const months = [...monthSet].sort();
    const labels = months.map(toDisplayMonth);

    const byKey = new Map();
    for (const r of rows) {
      const k = r[groupField];
      if (!k || !r.date) continue;
      const mk = monthKey(r.date);
      if (!mk) continue;
      const val = numOrNull(r.actual_value);
      if (val == null) continue;

      if (!byKey.has(k)) byKey.set(k, new Map());
      const mEntry = byKey.get(k).get(mk) || { sum: 0, count: 0 };
      mEntry.sum += val;
      mEntry.count += 1;
      byKey.get(k).set(mk, mEntry);
    }

    const allIds = [...byKey.keys()].sort();
    const ordered = allIds.filter((id) => activeCompare.includes(id));

    const series = ordered.map((id) => ({
      name: id,
      values: months.map((m) => {
        const entry = byKey.get(id)?.get(m);
        if (!entry || entry.count === 0) return null;
        return aggregateValues(entry, monthlyAggregation);
      }),
    }));
    return { labels, series };
  }

  const dateSet = new Set();
  for (const r of rows) if (r.date) dateSet.add(r.date);
  const dates = [...dateSet].sort();
  const labels = dates.map((d) => toDisplayDate(d) ?? "");

  const byKey = new Map();
  for (const r of rows) {
    const k = r[groupField];
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, new Map());
    byKey.get(k).set(r.date, numOrNull(r.actual_value));
  }

  // Sort the active list by the natural order of the underlying distinct
  // values (so TBM-03 comes before TBM-04 even when the user only picked
  // those two out of ten).
  const allIds = [...byKey.keys()].sort();
  const ordered = allIds.filter((id) => activeCompare.includes(id));

  const series = ordered.map((id) => ({
    name: id,
    values: dates.map((d) => byKey.get(id)?.get(d) ?? null),
  }));
  return { labels, series };
}

// Per-overlay unit suffix for the combined-overlay chart's legend +
// tooltip. Mixed units on one axis is a correlation view, not a
// magnitude view, so a "%" line and a "min" line share the y-axis;
// the legend entry ("Availability (%)" / "Breakdown (min)") and
// per-series tooltip tell the user which is which. Production +
// Scrap carry varying units (MT/NOS/KG depending on the card pin);
// we leave them unitless and let the tooltip show the raw value.
function overlayUnit(overlayValue) {
  if (overlayValue === "Availability") return "%";
  if (overlayValue === "Breakdown") return "min";
  return "";
}

function overlayAggregation(overlayValue, machineView) {
  if (overlayValue === "Production" || overlayValue === "Scrap") return "sum";
  if (overlayValue === "Breakdown") return machineView ? "sum" : "average";
  return "average";
}

function preferProductionOverlayRows(rows, sectionName, productType) {
  const aggregateProduct = AGGREGATE_PRODUCT_BY_SECTION[sectionName];
  if (aggregateProduct) {
    const selectedProduct = productType || aggregateProduct;
    const productRows = rows.filter((r) => r.product_type === selectedProduct);
    if (productRows.length > 0) rows = productRows;
  }

  // Production is stored in multiple units. OEE's overlay has no unit
  // selector, so use the standard MT series when available and never add
  // different units together.
  const units = [
    ...new Set(
      rows.map((r) => canonicalUnit(r.unit_of_measurement)).filter(Boolean),
    ),
  ];
  if (units.length > 1) {
    const preferred = units.find((unit) => unit === "MT") ?? units.sort()[0];
    const unitRows = rows.filter(
      (r) => canonicalUnit(r.unit_of_measurement) === preferred,
    );
    if (unitRows.length > 0) rows = unitRows;
  }
  return rows;
}

function aggregateValues(valuesOrEntry, aggregation) {
  if (Array.isArray(valuesOrEntry)) {
    if (valuesOrEntry.length === 0) return null;
    const total = valuesOrEntry.reduce((sum, value) => sum + value, 0);
    const result = aggregation === "sum" ? total : total / valuesOrEntry.length;
    return Math.round(result * 100) / 100;
  }

  const entry = valuesOrEntry;
  if (!entry || entry.count === 0) return null;
  const result = aggregation === "sum" ? entry.sum : entry.sum / entry.count;
  return Math.round(result * 100) / 100;
}

function numOrNull(v) {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Normalize a date (ISO yyyy-mm-dd or DD-MM-YYYY) to sortable YYYYMMDD. */
function dateKey(d) {
  if (typeof d !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replaceAll("-", "");
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d);
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

/** Month bucket "YYYY-MM" from either date format. */
function monthKey(d) {
  const k = dateKey(d);
  return k ? `${k.slice(0, 4)}-${k.slice(4, 6)}` : "";
}

function sectionIdToName(id) {
  return { mix: "Mixing", stk: "Stock", tbm: "TBM", cur: "Curing" }[id] ?? id;
}

function categoryIdToName(id) {
  return (
    {
      p: "Productivity",
      q: "Quality",
      c: "Cost",
      m: "Morale",
      s: "Safety",
      i: "Inventory",
    }[id] ?? id
  );
}

/* =========================================================================
 * Frame: title + close + TimeRangeSelect + body. Shared by both paths so
 * the visual shell is identical regardless of which trend view is open.
 * ========================================================================= */

function ModalFrame({ open, onClose, kpi, headerExtras, children }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: { xs: "95vw", sm: "85vw", md: "75vw" },
          maxWidth: "75vw",
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle sx={{ pr: 6, pb: 1 }}>
        <Typography
          sx={{
            fontSize: 11,
            color: "text.disabled",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 700,
          }}
        >
          KPI Trend Analysis
        </Typography>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography sx={{ fontSize: 22, fontWeight: 700 }}>
            {kpi.name}
          </Typography>
          {kpi.unit && (
            <Typography sx={{ fontSize: 14, color: "text.disabled" }}>
              ({kpi.unit})
            </Typography>
          )}
        </Stack>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: "absolute", top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {headerExtras}
        {children}
      </DialogContent>
    </Dialog>
  );
}

// A bordered panel that hosts one chart, with title + skeleton/empty states.
// Reused by the OEE modal for the main chart and every overlay chart.
function ChartPanel({ theme, title, loading, empty, emptyMessage, children }) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: "primary.main",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          backgroundColor: theme.custom.surface.soft,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.25,
          p: 2,
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && empty ? (
          <ChartSkeleton />
        ) : empty ? (
          <Typography sx={{ fontSize: 13, color: "text.disabled" }}>
            {emptyMessage}
          </Typography>
        ) : (
          children
        )}
      </Box>
    </Box>
  );
}

// Local single-select pill row — mirrors the legacy modal's exclusive
// ToggleButtonGroup look without dragging the Production-drill helper
// across folders. Inline here because TrendModal is the only consumer.
function SingleSelectRow({ label, value, onChange, options }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ flexWrap: "wrap" }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          minWidth: 76,
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
            fontWeight: 600,
            border: "1.25px solid",
            borderColor: "divider",
          },
          "& .Mui-selected": {
            borderColor: `${"primary.main"} !important`,
            color: "primary.main",
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

function ChartSkeleton() {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 260,
      }}
    >
      <JKLoader />
    </Box>
  );
}

// Local multi-select dropdown filter — MUI `Autocomplete multiple` in
// the same row shape as `SingleSelectRow` / `MultiSelectPills`. Used
// for the Machines + SKU scopes on the OEE and Production trend
// modals. Inline here because TrendModal is the only consumer for
// now; promote to common/ if a second consumer appears (per
// conventions.md "Shared component library").
function FilterRow({ label, options, value, onChange, placeholder }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ flexWrap: "wrap" }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.disabled",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          minWidth: 76,
        }}
      >
        {label}
      </Typography>
      <Autocomplete
        multiple
        size="small"
        sx={{ minWidth: 240, maxWidth: 360 }}
        options={options}
        value={value}
        onChange={(_, next) => onChange(next)}
        disableCloseOnSelect
        disabled={options.length === 0}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={value.length === 0 ? placeholder : ""}
            variant="outlined"
          />
        )}
      />
    </Stack>
  );
}

export default TrendModal;
