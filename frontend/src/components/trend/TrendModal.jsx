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
import { pickChartType } from "./pickChartType.js";
import { useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getTrend } from "@/api/trends.js";
import client from "@/api/client.js";
import { presetToDateRange } from "@/lib/timeRange.js";
import { canonicalUnit } from "@/lib/kpi-transformer.js";
import { isKg, kgToTonnes } from "@/lib/units.js";
import {
  denanDimension,
  isProductAgnosticKpi,
  preferScopedRows,
} from "@/lib/dashboardRowScopes.js";

/**
 * KPI Trend Analysis modal per BRD §9.3 (FR-X10 through FR-X17).
 *
 * Two paths share this modal:
 *
 *   1. OEE path — VIEW BY pills (Overall / Product Type / Machine) on
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
  // The date window currently selected on the dashboard (resolved from/to).
  // The trend opens on this SAME range so it matches what the user is viewing.
  dashFrom = null,
  dashTo = null,
}) {
  const theme = useTheme();
  const toast = useToast();
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Each time the modal opens, seed its range from the dashboard's selection
  // so the trend shows the SAME window the user has on the dashboard. The user
  // can still change it afterwards; a later dashboard change is picked up on
  // the next open. Uses the render-time "adjust state on prop change" pattern
  // (guarded by the open transition) — no effect, no extra render.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && dashFrom && dashTo) {
      setRange("custom");
      setFrom(dashFrom);
      setTo(dashTo);
    }
  }

  if (!kpi) return null;

  // Route OEE to the new pills UI; everything else keeps the legacy form.
  return kpi.id === "oee" ? (
    <OeeTrendModal
      open={open}
      onClose={onClose}
      plantId={plantId}
      kpi={kpi}
      section={section}
      asOf={asOf}
      range={range}
      from={from}
      to={to}
      onRangeChange={setRange}
      onFromChange={setFrom}
      onToChange={setTo}
      theme={theme}
    />
  ) : (
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
          presetLabels={{ today: "Daily", month: "Monthly", year: "Yearly" }}
          from={from}
          to={to}
          onPresetChange={(p) => {
            onRangeChange(p);
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
 * New OEE Trend modal — VIEW BY / COMPARE / OVERLAY pills on top of a
 * MultiLineChart, with optional single-series overlay charts stacked
 * below. One trip per OEE Trend open — the SHIFT three-trip fan-out
 * was removed in CR-08.
 * ========================================================================= */

const VIEW_BY_OPTIONS = [
  { value: "overall", label: "Overall" },
  { value: "product_type", label: "Product Type" },
  { value: "machine", label: "Machine" },
];

const VIEW_BY_LABEL = Object.fromEntries(
  VIEW_BY_OPTIONS.map((o) => [o.value, o.label]),
);

// Each VIEW BY level maps to one OEE kpi_name. "Product Type" reads
// OEE_o and groups client-side by the `tyre_type` gold column (the
// product_type column is NULL for OEE rows — Q-OEE-01 in
// docs/open-questions.md). "Machine" reads OEE_m (one row per
// machine/day). "Overall" reads OEE_o (section-level).
function viewByMainKpi(viewBy) {
  if (viewBy === "machine") return "OEE_m";
  return "OEE_o"; // overall + product_type
}

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
  product_type: "Availability_o",
  machine: "Availability_m",
};

const PRODUCTION_KPI_BY_SECTION = {
  TBM: "Production_product",
  Curing: "Production_product",
  Mixing: "Production",
  Stock: "Production",
};

function overlayKpiName(overlayValue, viewBy, sectionName) {
  if (overlayValue === "Availability") {
    return OVERLAY_AVAILABILITY_BY_VIEW[viewBy] ?? "Availability_o";
  }
  if (overlayValue === "Production") {
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

function OeeTrendModal({
  open,
  onClose,
  plantId,
  kpi,
  section,
  asOf,
  range,
  from,
  to,
  onRangeChange,
  onFromChange,
  onToChange,
  theme,
}) {
  // Default VIEW BY = Overall. Other defaults are derived as the user
  // makes picks (compare fills to "all", overlays starts empty).
  const [viewBy, setViewBy] = useState("overall");
  const [compare, setCompare] = useState([]);
  const [overlays, setOverlays] = useState([]);
  // Multi-select Machines filter — scopes which machines' rows feed
  // the chart. Empty = all machines. Visible only when viewBy is
  // Machine or Product Type (hidden for Overall since OEE_o is
  // already section-aggregated).
  const [machines, setMachines] = useState([]);

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

  // One trip covers main + overlays via drillKpis. (The previous Shift
  // lens fanned out three calls — removed in CR-08.)
  const sectionName = sectionIdToName(section);
  const mainKpi = viewByMainKpi(viewBy);
  const overlayKpis = overlays.map((o) =>
    overlayKpiName(o, viewBy, sectionName),
  );

  const singlePayload = {
    plantId,
    context: {
      section: sectionName,
      category: "Productivity",
      granularity: "DAY",
    },
    from: rangeFrom,
    to: rangeTo,
    drillKpis: [mainKpi, ...overlayKpis],
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
      // Toggling an overlay mutates the payload (drillKpis adds the
      // overlay kpi_name). Without keepPreviousData, usePolledQuery
      // nulls `data` on deps change, which blanks the main OEE chart
      // for the round-trip duration. Keep the previous data so the
      // main chart stays rendered; only the new overlay chart shows
      // its own skeleton until the response lands.
      keepPreviousData: true,
    },
  );

  // Distinct machine values from the loaded rows — the Autocomplete
  // options for the Machines filter. Empty while loading.
  const machineOptions = useMemo(() => {
    if (!Array.isArray(singleRows)) return [];
    const set = new Set();
    for (const r of singleRows) if (r.machine) set.add(r.machine);
    return [...set].sort();
  }, [singleRows]);

  // Split singleRows by kpi_name into mainRows + overlay rows.
  const mainRows = useMemo(() => {
    if (!Array.isArray(singleRows)) return [];
    return singleRows.filter((r) => r.kpi_name === mainKpi);
  }, [singleRows, mainKpi]);

  // Apply the Machines filter to mainRows before grouping. Empty
  // selection = all machines pass through.
  const filteredMainRows = useMemo(() => {
    if (machines.length === 0) return mainRows;
    const allowed = new Set(machines);
    return mainRows.filter((r) => allowed.has(r.machine));
  }, [mainRows, machines]);

  const overlayRowsByKpi = useMemo(() => {
    const out = {};
    if (!overlays.length) return out;
    if (!Array.isArray(singleRows)) return out;
    for (const r of singleRows) {
      if (r.kpi_name === mainKpi) continue;
      if (!out[r.kpi_name]) out[r.kpi_name] = [];
      out[r.kpi_name].push(r);
    }
    return out;
  }, [overlays, singleRows, mainKpi]);

  // Build COMPARE options from the filtered main rows. For Machine view
  // the COMPARE row is hidden (the Machines filter takes its role) so
  // the options aren't used, but we still build them for the default-
  // fill behaviour. For Product Type they group by `tyre_type`; for
  // Overall, the row is hidden and the options stay empty.
  const compareOptions = useMemo(() => {
    if (viewBy === "product_type") {
      const set = new Set();
      for (const r of filteredMainRows) if (r.tyre_type) set.add(r.tyre_type);
      return [...set].sort().map((t) => ({ value: t, label: t }));
    }
    if (viewBy === "machine") {
      const set = new Set();
      for (const r of filteredMainRows) if (r.machine) set.add(r.machine);
      return [...set].sort().map((m) => ({ value: m, label: m }));
    }
    return [];
  }, [viewBy, filteredMainRows]);

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
    () => buildMainChart({ mainRows: filteredMainRows, viewBy, activeCompare }),
    [filteredMainRows, viewBy, activeCompare],
  );

  // The chart title reflects the active VIEW BY lens.
  const mainTitle = useMemo(() => {
    const lens = VIEW_BY_LABEL[viewBy] ?? "Overall";
    return `${lens} · OEE — Daily`;
  }, [viewBy]);

  // Combined overlay chart — one line per picked overlay, sharing the
  // same date axis. The labels come from the union of all overlay
  // rows' dates so a sparse kpi doesn't shorten the axis. Each series
  // carries its own unit suffix (MultiLineChart renders it in the
  // legend and tooltip).
  const overlayChart = useMemo(() => {
    if (overlays.length === 0) {
      return { labels: [], series: [] };
    }
    // Collect the union of dates across every picked overlay so the
    // x-axis is consistent regardless of which kpi has data.
    const dateSet = new Set();
    const perOverlayRows = overlays.map((overlayValue) => {
      const kpiName = overlayKpiName(overlayValue, viewBy, sectionName);
      const rows = overlayRowsByKpi[kpiName] ?? [];
      for (const r of rows) if (r.date) dateSet.add(r.date);
      return { overlayValue, rows };
    });
    const dates = [...dateSet].sort();
    const labels = dates.map((d) => toDisplayDate(d) ?? "");

    const series = perOverlayRows.map(({ overlayValue, rows }) => {
      const meta = OVERLAY_OPTIONS.find((o) => o.value === overlayValue);
      const displayLabel = meta?.label?.replace(/^\+\s*/, "") ?? overlayValue;
      const byDate = new Map(
        rows.map((r) => [r.date, numOrNull(r.actual_value)]),
      );
      const values = dates.map((d) => byDate.get(d) ?? null);
      return {
        name: displayLabel,
        values,
        unit: overlayUnit(overlayValue),
      };
    });
    return { labels, series };
  }, [overlays, viewBy, sectionName, overlayRowsByKpi]);

  const overlayLabels = overlayChart.labels;
  const overlaySeries = overlayChart.series;

  const loading = singleLoading;
  const hasMainData = mainChart.series.length > 0;
  // COMPARE picks which grouping values draw as lines. For Machine
  // view the Machines filter takes that role, so COMPARE hides; for
  // Overall the row is also hidden.
  const showCompare = viewBy === "product_type";
  // Machines filter scopes the data; only meaningful when the chart
  // is split by Machine or Product Type. Hidden for Overall since
  // OEE_o is section-aggregated.
  const showMachinesFilter = viewBy === "machine" || viewBy === "product_type";

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      kpi={kpi}
      headerExtras={
        <TimeRangeSelect
          preset={range}
          presetLabels={{ today: "Daily", month: "Monthly", year: "Yearly" }}
          from={from}
          to={to}
          onPresetChange={(p) => {
            onRangeChange(p);
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
            options={VIEW_BY_OPTIONS}
          />
          {showMachinesFilter && (
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
                Machines
              </Typography>
              <Autocomplete
                multiple
                size="small"
                sx={{ minWidth: 240, maxWidth: 360 }}
                options={machineOptions}
                value={machines}
                onChange={(_, next) => setMachines(next)}
                disableCloseOnSelect
                disabled={machineOptions.length === 0}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={machines.length === 0 ? "All machines" : ""}
                    variant="outlined"
                  />
                )}
              />
            </Stack>
          )}
          {showCompare && (
            <MultiSelectPills
              label="Compare"
              options={compareOptions}
              value={activeCompare}
              onChange={setCompare}
            />
          )}
          <MultiSelectPills
            label="Overlay"
            options={OVERLAY_OPTIONS}
            value={overlays}
            onChange={setOverlays}
          />
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
              : "No OEE data for this combination — try another VIEW BY or date range."
          }
        >
          {hasMainData && (
            <MultiLineChart
              labels={mainChart.labels}
              series={mainChart.series}
              unit="%"
            />
          )}
        </ChartPanel>

        {/* Combined overlay chart — one line per picked overlay kpi,
            legend names carry each line's unit (%, min, MT, …). Units
            differ across overlays so this is a correlation view, not a
            magnitude view; the per-series tooltip shows the value with
            its own unit suffix. */}
        {overlays.length > 0 && (
          <ChartPanel
            theme={theme}
            title="Overlays · Daily"
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

/* =========================================================================
 * Small helpers + shared frame.
 * ========================================================================= */

// Build the (labels, series) bundle for the main chart.
// - product_type view: one series per distinct `tyre_type` value
//   (Q-OEE-01 — `product_type` is NULL for OEE rows so we group by
//   `tyre_type`).
// - machine view: one series per distinct `machine` value
// - overall view: a single "Overall" series
function buildMainChart({ mainRows, viewBy, activeCompare }) {
  if (viewBy === "product_type") {
    return buildGroupedSeries({
      rows: mainRows,
      groupField: "tyre_type",
      activeCompare,
    });
  }
  if (viewBy === "machine") {
    return buildGroupedSeries({
      rows: mainRows,
      groupField: "machine",
      activeCompare,
    });
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

function buildGroupedSeries({ rows, groupField, activeCompare }) {
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
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
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

export default TrendModal;
