import { useState } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import TimeRangeSelect from "@/components/production/TimeRangeSelect.jsx";
import LineChart from "./LineChart.jsx";
import BarChart from "./BarChart.jsx";
import ProgressChart from "./ProgressChart.jsx";
import { pickChartType } from "./pickChartType.js";
import { useToast } from "@/components/common";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { getTrend } from "@/api/trends.js";
import client from "@/api/client.js";
import { presetToDateRange } from "@/lib/timeRange.js";
import {
  denanDimension,
  isProductAgnosticKpi,
  preferScopedRows,
} from "@/lib/dashboardRowScopes.js";

/**
 * KPI Trend Analysis modal per BRD §9.3 (FR-X10 through FR-X17).
 *
 * Uses v2 POST /dashboard/kpi-data when kpi.name is available (live data),
 * falling back to the legacy GET /plants/:id/production/trends endpoint
 * (mock / older integration).
 *
 * Opens via the Trend Icon on a KpiCard. Owns its own time-range
 * state. Closes via Escape, backdrop click, or the X button.
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
  asOf = null,
}) {
  const theme = useTheme();
  const toast = useToast();
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Resolve the active date range (preset OR custom) to ISO from/to,
  // anchored to the as-of date (BRD §13.5).
  const resolved = presetToDateRange({ preset: range, from, to }, asOf);

  // Monthly trend (BRD §13.6): one point per month = the latest MTD
  // record within that month. To collect every month we must fetch a
  // window wider than the snapshot's trailing few days — back to the
  // start of the as-of year through the as-of date.
  const isMonthly = range === "month" && !from && !to;
  // Daily trend (dashboard_doc.md §2): the CURRENT MONTH day-by-day, one
  // point per day, anchored to the latest available date — NOT a single
  // day. So when the preset is "today" with no custom range, we fetch the
  // whole current month at Daily granularity and plot every day.
  const isDailyTrend = range === "today" && !from && !to;
  const anchorIso = asOf ?? resolved.to ?? null;
  const monthlyFrom = anchorIso
    ? `${anchorIso.slice(0, 4)}-01-01`
    : resolved.from;
  const monthlyTo = anchorIso ?? resolved.to;
  // First day of the anchor month → anchor day.
  const dailyFrom = anchorIso ? `${anchorIso.slice(0, 7)}-01` : resolved.from;
  const dailyTo = anchorIso ?? resolved.to;

  const sectionName = sectionIdToName(section);

  /**
   * v2 fetch: use kpi.rawName (actual gold_dummy kpi_name like "OEE_o")
   * so we bypass the stale KPI_NAME_BY_ID map in getTrend.
   *
   * Request the card's rawName as a drillKpi. Some cards read a DRILL-LEVEL
   * kpi_name (TBM/Curing Production reads `Production_product`, drill_down_level
   * '3', C7) that a landing-only fetch (drillKpis:null) never returns — the
   * series came back empty ("No trend data" for Curing Production, found
   * 2026-07-23). The backend OR-joins it with the landing band, and the
   * client-side filter below (r.kpi_name === kpi.rawName) already isolates the
   * single series, so the extra landing rows never reach the chart.
   */
  // Narrow the fetch with section/category/granularity — the table is far
  // too large to fetch unfiltered (the row cap would truncate the series).
  // realdata.md §3: real granularities are MONTH (monthly), DAY otherwise.
  // Year/YTD is disabled — a stale "year" range falls back to MONTH.
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
        // Daily trend sends a RANGE (current month), not a single-day
        // equality, so the series has one point per day (§2). Monthly/
        // Yearly use their wider windows; custom ranges pass through.
        date: null,
        from: isDailyTrend
          ? dailyFrom
          : isMonthly
            ? monthlyFrom
            : resolved.from,
        to: isDailyTrend ? dailyTo : isMonthly ? monthlyTo : resolved.to,
        drillKpis: [kpi.rawName],
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

  /**
   * Legacy fetch (mock / older API).
   */
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

  if (!kpi) return null;

  const isLoading = useV2 ? v2Loading : legacyLoading;

  // Resolve trend data — prefer v2 rows, fall back to legacy.
  // Filter client-side: the Lambda ignores section/granularity/kpi_name,
  // so the response contains every KPI for every section. We narrow
  // to one section + one KPI + Daily granularity for the line chart.
  let labels = [];
  let values = [];
  if (useV2 && Array.isArray(v2Rows)) {
    // Pin the series to one product type + sub-section so the line is a
    // single consistent series, not a blend (BRD §13.6). product_type is
    // empty for section-level KPIs (OEE) — those rows always pass.
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
    const pinned = isProductAgnosticKpi(kpi.rawName)
      ? preferScopedRows(scoped, productType)
      : scoped;

    if (isMonthly) {
      // One point per month = the latest available MTD record in that
      // month (last day of a completed month; latest day of the running
      // month). Group MTD rows by YYYY-MM, keep the max-date row each.
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
      values = months.map((m) => numOrNull(byMonth.get(m).actual_value));
    } else if (range === "year") {
      // Year/YTD disabled (realdata.md §3) — no yearly granularity in the
      // real data. Match MONTH so a stale "year" range still renders a series
      // instead of going blank; the Year preset itself is disabled upstream.
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
      values = years.map((y) => numOrNull(byYear.get(y).actual_value));
    } else {
      const sorted = pinned
        .filter((r) => r.granularity === "DAY")
        .sort((a, b) => (dateKey(a.date) > dateKey(b.date) ? 1 : -1));
      labels = sorted.map((r) => r.date ?? "");
      values = sorted.map((r) => numOrNull(r.actual_value));
    }
  } else if (legacyData) {
    labels = legacyData.labels ?? [];
    values = legacyData.values ?? [];
  }

  const chartType = pickChartType(kpi.id, kpi.unit, kpi.name);

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
        <Box>
          <TimeRangeSelect
            preset={range}
            // dashboard_doc.md §1: the Trend modal labels its presets
            // Daily / Monthly / Yearly (vs the header's Today/Month/Year).
            // ids stay today/month/year so the granularity mapping below
            // (Daily / MTD / YTD) is unchanged.
            presetLabels={{ today: "Daily", month: "Monthly", year: "Yearly" }}
            from={from}
            to={to}
            onPresetChange={(p) => {
              setRange(p);
              setFrom("");
              setTo("");
            }}
            onFromChange={(v) => {
              setFrom(v);
              setRange("custom");
            }}
            onToChange={(v) => {
              setTo(v);
              setRange("custom");
            }}
          />
        </Box>

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
      </DialogContent>
    </Dialog>
  );
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

function ChartSkeleton() {
  const heights = [40, 60, 90, 70, 110, 80, 130, 100, 140, 120, 150, 130];
  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Skeleton variant="text" width={60} sx={{ fontSize: 11 }} />
        <Skeleton variant="text" width={60} sx={{ fontSize: 11 }} />
      </Stack>
      <Stack
        direction="row"
        alignItems="flex-end"
        spacing={1}
        sx={{ height: 220 }}
      >
        {heights.map((h, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            sx={{ flex: 1, height: h, alignSelf: "flex-end" }}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={1}>
        {heights.map((_, i) => (
          <Skeleton key={i} variant="text" sx={{ flex: 1, fontSize: 11 }} />
        ))}
      </Stack>
    </Stack>
  );
}

export default TrendModal;
