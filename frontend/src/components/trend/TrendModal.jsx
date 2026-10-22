import { useMemo, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import TimeRangeSelect from "@/components/production/TimeRangeSelect.jsx";
import { toDisplayDate } from "@/lib/dateFormat.js";
import LineChart from "./LineChart.jsx";
import MultiLineChart from "./MultiLineChart.jsx";
import BarChart from "./BarChart.jsx";
import ProgressChart from "./ProgressChart.jsx";
import MultiSelectPills from "./MultiSelectPills.jsx";
import PlanComplianceTrendModal from "./PlanComplianceTrendModal.jsx";
import {
  ChartPanel,
  ChartSkeleton,
  FilterRow,
  ModalFrame,
  SingleSelectRow,
} from "./TrendModalParts.jsx";
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
  hasMachine,
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
  // The header's tyre line (null = both), so the trend plots the same
  // slice as the card it was opened from.
  tyreType = null,
  // The product pill the card is pinned to (e.g. "Carcass"). The Production
  // trend's Overall line follows it on CTP; `productType` stays null so the
  // Product Type lens still lists every product.
  cardProductType = null,
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
        tyreType={tyreType}
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
        tyreType={tyreType}
        cardProductType={cardProductType}
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
        tyreType={tyreType}
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
        tyreType={tyreType}
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
      tyreType={tyreType}
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
  tyreType = null,
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
          ...(tyreType ? { tyre_type: tyreType } : {}),
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

    if (plantId === "chennai" && CTP_SUMMED_TREND_KPIS.has(kpi.rawName)) {
      // CTP stores one day (or month) of these counts as several rows — per
      // tyre line, and per responsible department in `status` — so each
      // period is their sum, the same figure the card shows.
      const gran = isMonthly || range === "year" ? "MONTH" : "DAY";
      const periodOf = (r) =>
        range === "year"
          ? dateKey(r.date).slice(0, 4)
          : isMonthly
            ? monthKey(r.date)
            : dateKey(r.date);
      const byPeriod = new Map();
      for (const r of pinned) {
        if (r.granularity !== gran) continue;
        const key = periodOf(r);
        const v = rowVal(r);
        if (!key || v == null) continue;
        byPeriod.set(key, (byPeriod.get(key) ?? 0) + v);
      }
      const periods = [...byPeriod.keys()].sort();
      labels =
        gran === "DAY" ? periods.map((d) => toDisplayDate(d) ?? "") : periods;
      values = periods.map((k) => Math.round(byPeriod.get(k) * 100) / 100);
    } else if (isMonthly) {
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
// CTP quality counts stored as several rows per period (see the legacy modal).
const CTP_SUMMED_TREND_KPIS = new Set(["Scrap", "Rework", "NCM_Hold"]);

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

function buildProductionSeriesConfig(
  sectionName,
  kpi,
  plantId,
  cardProductType,
) {
  // CTP TBM/Curing read the plain Production rows, as the card does — the
  // figure the gold validation checks. Production_product is missing for
  // Carcass (the Overall line plotted Green Tyre under a Carcass card: PCR
  // 06-10 13,679 vs 13,648) and drifts from Production for Green Tyre. It
  // stays the fallback when a window carries no plain Production row.
  // Overall follows the card's product; Product Type shows every product.
  const readsPlainProduction = (viewBy) =>
    plantId === "chennai" &&
    (viewBy === "overall" || viewBy === "product_type") &&
    Boolean(AGGREGATE_PRODUCT_BY_SECTION[sectionName]);
  // BTP TBM/Curing store the section aggregate (Green Tyre / Cured Tyre)
  // beside its own categories (Passenger Radial, LCV, Unknown) at every
  // level — product, machine and SKU — so summing a month or a machine
  // across product types doubles it (TBM Aug-2026: 1,378,634 vs the card's
  // 689,317). Every lens except Product Type reads only the card's product,
  // as the card does. Carcass has no Production_product row, so Overall
  // falls back to the plain Production row for it.
  const pinsBtpProduct = (viewBy) =>
    plantId === "banmore" &&
    viewBy !== "product_type" &&
    Boolean(AGGREGATE_PRODUCT_BY_SECTION[sectionName]);
  const btpProductPin = canonicalizeProductType(
    cardProductType ?? AGGREGATE_PRODUCT_BY_SECTION[sectionName],
  );
  return {
    viewByOptions: PRODUCTION_VIEW_BY_OPTIONS,
    defaultViewBy: "overall",
    mainKpiName: (viewBy) =>
      readsPlainProduction(viewBy)
        ? ["Production", "Production_product"]
        : pinsBtpProduct(viewBy) && viewBy === "overall"
          ? ["Production_product", "Production"]
          : productionKpiName(viewBy, sectionName),
    pickMainRows: (rows, viewBy) => {
      if (pinsBtpProduct(viewBy)) {
        const ofKpi = (name) =>
          rows.filter(
            (r) =>
              (name == null || r.kpi_name === name) &&
              canonicalizeProductType(r.product_type) === btpProductPin,
          );
        if (viewBy !== "overall") return ofKpi(null);
        const productRows = ofKpi("Production_product");
        return productRows.length > 0 ? productRows : ofKpi("Production");
      }
      if (!readsPlainProduction(viewBy)) return rows;
      const pin =
        viewBy === "overall"
          ? canonicalizeProductType(
              cardProductType ?? AGGREGATE_PRODUCT_BY_SECTION[sectionName],
            )
          : null;
      const ofKpi = (name) =>
        rows.filter(
          (r) =>
            r.kpi_name === name &&
            (pin == null || canonicalizeProductType(r.product_type) === pin),
        );
      const plainRows = ofKpi("Production");
      return plainRows.length > 0 ? plainRows : ofKpi("Production_product");
    },
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
    // BTP Machine / SKU lenses carry hundreds of series — plot one by default.
    singleSeriesByDefault: (viewBy) =>
      plantId === "banmore" && (viewBy === "machine" || viewBy === "sku"),
    showOverlay: false,
    mainMonthlyAggregation: () => "sum",
    // CTP stores each day once per trench and tyre line (Curing 2026-10-06:
    // 3 PCR + 3 TBR rows = 16,898), so a day is their sum. Banmore keeps
    // plotting its one row per day.
    mainDailyAggregation: () => (plantId === "chennai" ? "sum" : null),
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
  tyreType = null,
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

  // Match the LegacyTrendModal's v2Granularity (L256-L260): ask Athena for
  // pre-aggregated MONTH rows in Monthly view so the plot reads the same
  // MTD roll-up the KPI card does. DAY view stays at DAY granularity.
  // Without this, the modal averages DAY-level rows per month (buildMainChart
  // + mainMonthlyAggregation = "average"), which is wrong for rate KPIs —
  // OEE's MONTH row is monthly A×P×Q, not the mean of daily OEE values
  // (see timeRange.js §presetToDateRange "month" branch).
  const payloadGranularity = isMonthly || range === "year" ? "MONTH" : "DAY";
  const singlePayload = {
    plantId,
    context: {
      section: sectionName,
      category: "Productivity",
      granularity: payloadGranularity,
      // Scope the request too, not just the rows we keep: an unscoped
      // Stock SKU fetch runs close to the 10k row cap and would silently
      // truncate days off the chart. The backend keeps product-agnostic
      // KPIs (OEE / Downtime overlays) alive through these filters.
      ...(subSection ? { sub_section: subSection } : {}),
      ...(productType ? { product_type: productType } : {}),
      ...(tyreType ? { tyre_type: tyreType } : {}),
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

  // Which column holds the SKU identity is config-driven — Production
  // stores it in `itemcode`.
  const skuField = config.skuField ?? "sub_section";

  // Split the scoped rows by kpi_name into mainRows + (optional) overlay rows.
  // mainKpis may be an array (Downtime fetches 6 reasons in one call);
  // filter via Set membership.
  const rawMainRows = useMemo(() => {
    const allowed = new Set(mainKpis);
    const rows = scopedRows.filter((r) => allowed.has(r.kpi_name));
    return config.pickMainRows ? config.pickMainRows(rows, viewBy) : rows;
  }, [scopedRows, mainKpis, config, viewBy]);

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

  // Distinct machine + SKU values — the Autocomplete options for each
  // filter. Empty while loading. A config that picks its main rows (a
  // product pin) lists only what survives the pick, so no option leads to
  // an empty chart.
  const optionRows = config.pickMainRows ? rawMainRows : scopedRows;
  const machineOptions = useMemo(() => {
    const set = new Set();
    for (const r of optionRows) if (hasMachine(r)) set.add(r.machine);
    return [...set].sort();
  }, [optionRows]);
  const skuOptions = useMemo(() => {
    const set = new Set();
    for (const r of optionRows) if (r[skuField]) set.add(r[skuField]);
    return [...set].sort();
  }, [optionRows, skuField]);

  // Lenses with hundreds of series (Production Machine / SKU) are
  // unreadable with every line drawn. With nothing picked, plot only the
  // biggest producer in the window; the filter shows it as the selection
  // and more can be added from there.
  const singleSeriesField = config.singleSeriesByDefault?.(viewBy)
    ? config.groupField(viewBy)
    : null;
  const defaultSeriesId = useMemo(() => {
    if (!singleSeriesField) return null;
    const totals = new Map();
    for (const r of mainRows) {
      const id = r[singleSeriesField];
      if (singleSeriesField === "machine" ? !hasMachine(r) : !id) continue;
      totals.set(id, (totals.get(id) ?? 0) + (numOrNull(r.actual_value) ?? 0));
    }
    let best = null;
    for (const [id, total] of totals) {
      if (!best || total > best.total) best = { id, total };
    }
    return best?.id ?? null;
  }, [mainRows, singleSeriesField]);
  const effectiveMachines = useMemo(
    () =>
      singleSeriesField === "machine" &&
      machines.length === 0 &&
      defaultSeriesId
        ? [defaultSeriesId]
        : machines,
    [singleSeriesField, machines, defaultSeriesId],
  );
  const effectiveSku = useMemo(
    () =>
      singleSeriesField === skuField && sku.length === 0 && defaultSeriesId
        ? [defaultSeriesId]
        : sku,
    [singleSeriesField, skuField, sku, defaultSeriesId],
  );

  // Apply the Machines + SKU filters to mainRows before grouping.
  // Empty selection in either = all rows pass through that filter.
  const filteredMainRows = useMemo(() => {
    // Under the Machine lens every series IS a machine, so a row with no
    // machine has no series to belong to — it used to draw a "nan" line.
    const machineGrouped = config.groupField(viewBy) === "machine";
    const base = machineGrouped ? mainRows.filter(hasMachine) : mainRows;
    if (effectiveMachines.length === 0 && effectiveSku.length === 0) {
      return base;
    }
    const allowedMachines =
      effectiveMachines.length > 0 ? new Set(effectiveMachines) : null;
    const allowedSku = effectiveSku.length > 0 ? new Set(effectiveSku) : null;
    return base.filter((r) => {
      if (allowedMachines && !allowedMachines.has(r.machine)) return false;
      if (allowedSku && !allowedSku.has(r[skuField])) return false;
      return true;
    });
  }, [mainRows, effectiveMachines, effectiveSku, skuField, config, viewBy]);

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
        dailyAggregation: config.mainDailyAggregation?.(viewBy) ?? null,
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
            hasMachine(r) &&
            (!allowedMachines || allowedMachines.has(r.machine)),
        );
      } else if (isMonthly) {
        // Prefer section rollups so an overall chart does not double-count
        // a rollup row together with its machine children.
        const overallRows = rows.filter((r) => !hasMachine(r));
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
              value={effectiveMachines}
              onChange={setMachines}
              placeholder="All machines"
            />
          )}
          {showSkuFilter && (
            <FilterRow
              label="SKU"
              options={skuOptions}
              value={effectiveSku}
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

function ProductionTrendModal({ cardProductType = null, ...props }) {
  const sectionName = sectionIdToName(props.section);
  const config = useMemo(
    () =>
      buildProductionSeriesConfig(
        sectionName,
        props.kpi,
        props.plantId,
        cardProductType,
      ),
    [sectionName, props.kpi, props.plantId, cardProductType],
  );
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
  // "sum" adds a day's rows together; null keeps one row per day.
  dailyAggregation = null,
}) {
  if (groupField) {
    return buildGroupedSeries({
      rows: mainRows,
      groupField,
      activeCompare,
      isMonthly,
      monthlyAggregation,
      dailyAggregation,
    });
  }

  if (isMonthly) {
    // Prefer section-level rollups so a MONTH row isn't double-counted
    // alongside its machine children. `drillOnly: true` skips the
    // dashboard's LANDING_PREDICATE, so without this filter the SQL
    // returns every machine's MONTH OEE_o row and `mainMonthlyAggregation
    // = "average"` dilutes the section value (e.g. Mixing OEE 84.7 vs an
    // averaged 78). Same filter the overlay chart applies (L988-L993)
    // and that the section-oee endpoint enforces server-side, so the
    // plotted value matches the KPI card.
    const scopedMonthly = mainRows.filter(
      (r) => !hasMachine(r) && !r.sub_section,
    );
    const rowsToPlot = scopedMonthly.length > 0 ? scopedMonthly : mainRows;
    const monthMap = new Map();
    for (const r of rowsToPlot) {
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
  const byDate =
    dailyAggregation === "sum"
      ? sumByDate(mainRows)
      : new Map(mainRows.map((r) => [r.date, numOrNull(r.actual_value)]));
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
  dailyAggregation = null,
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
    const byDate = byKey.get(k);
    const v = numOrNull(r.actual_value);
    if (dailyAggregation === "sum" && byDate.has(r.date)) {
      if (v != null) byDate.set(r.date, (byDate.get(r.date) ?? 0) + v);
    } else {
      byDate.set(r.date, v);
    }
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

/** Each date's rows added together; a date with no numeric row maps to null. */
function sumByDate(rows) {
  const out = new Map();
  for (const r of rows) {
    const v = numOrNull(r.actual_value);
    const prev = out.get(r.date) ?? null;
    out.set(r.date, v == null ? prev : (prev ?? 0) + v);
  }
  return out;
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

export default TrendModal;
