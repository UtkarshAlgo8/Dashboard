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

/**
 * KPI Trend Analysis modal per BRD §9.3 (FR-X10 through FR-X17).
 *
 * Opens via the Trend Icon on a KpiCard. Owns its own time-range
 * state (the dashboard's TimeRange is independent — FR-X6 says the
 * component is available in both surfaces, not that they share
 * state). Closes via Escape, backdrop click, or the X button (MUI
 * Dialog defaults).
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

  const { data, isLoading, error } = usePolledQuery(
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
      enabled: open && Boolean(kpi),
      interval: 0,
      deps: [
        open,
        plantId,
        kpi?.id,
        section,
        category,
        range,
        from,
        to,
        compound,
      ],
    },
  );

  if (error) toast.error("Could not load trend data.");

  if (!kpi) return null;

  const chartType = pickChartType(kpi.id, kpi.unit, kpi.name);
  const labels = data?.labels ?? [];
  const values = data?.values ?? [];

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
