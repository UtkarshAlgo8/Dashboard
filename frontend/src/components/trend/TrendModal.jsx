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

/**
 * KPI Trend Analysis modal per BRD §9.3 (FR-X10 through FR-X17).
 *
 * Uses v2 POST /dashboard/fetch when kpi.name is available (live data),
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
}) {
  const theme = useTheme();
  const toast = useToast();
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Resolve the active date range (preset OR custom) to ISO from/to.
  // For "today" we send the single date; otherwise we send the range.
  const resolved = presetToDateRange({ preset: range, from, to });

  /**
   * v2 fetch: use kpi.name (actual gold_dummy kpi_name like "OEE_o")
   * so we bypass the stale KPI_NAME_BY_ID map in getTrend.
   *
   * Lambda ignores section/category/granularity filters, so we omit
   * them from the payload and filter client-side. We also drop the
   * drillKpis flag — it OR-joins with drill_down_level=1 and returns
   * every landing KPI, polluting the time series with mixed data.
   * Date filter (date OR from+to) is the only server-side narrowing.
   */
  const useV2 = Boolean(kpi?.rawName);
  const v2Payload = useV2
    ? {
        context: {},
        date: range === "today" ? resolved.from : null,
        from: range === "today" ? null : resolved.from,
        to: range === "today" ? null : resolved.to,
        drillKpis: null,
        limit: 10000,
      }
    : null;

  const sectionName = sectionIdToName(section);

  const { data: v2Rows, isLoading: v2Loading } = usePolledQuery(
    v2Payload
      ? () =>
          client.post("/dashboard/fetch", v2Payload).then((r) => r.data ?? r)
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
    const matched = v2Rows.filter(
      (r) =>
        r.section === sectionName &&
        r.kpi_name === kpi.rawName &&
        r.granularity === "Daily",
    );
    const sorted = matched.sort((a, b) => (a.date > b.date ? 1 : -1));
    labels = sorted.map((r) => r.date ?? "");
    values = sorted.map((r) => {
      const v = r.actual_value;
      if (v == null) return null;
      const n = typeof v === "number" ? v : Number.parseFloat(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    });
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
