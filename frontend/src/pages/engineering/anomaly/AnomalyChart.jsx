import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import "highcharts/highcharts-more";
import "highcharts/modules/heatmap";
import "highcharts/modules/broken-axis";
import "highcharts/modules/accessibility";
import { Alert, Box, useTheme } from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { formatTime, overlaps, producingAt } from "@/lib/anomaly/model.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/** Shared PdM chart presentation; all detection/health series are supplied data. */
export default function AnomalyChart({
  series,
  height = 320,
  yAxis,
  xAxis = {},
  episodes = [],
  interactive = true,
  range,
  onPointClick,
  chartType = "line",
  colorAxis,
  title = "Equipment time series",
  legend = true,
  hideStops,
  extra = {},
}) {
  const theme = useTheme();
  const p = theme.custom.anomaly;
  const { model, nav } = useAnomaly();
  const [from, to] = range ?? [nav.from, nav.to];
  const shouldHideStops = hideStops ?? nav.hideStops;
  const breaks = [];
  let firstProducing = null,
    lastProducing = null;
  if (shouldHideStops) {
    let start = null;
    for (
      let i = Math.max(0, Math.floor((from - model.start) / model.step));
      i <=
      Math.min(
        model.state.length,
        Math.ceil((to - model.start) / model.step) + 1,
      );
      i++
    ) {
      const time = model.start + i * model.step;
      const stopped = i < model.state.length && !producingAt(model, time);
      if (
        i < model.state.length &&
        !stopped &&
        time <= to &&
        time + model.step > from
      ) {
        firstProducing ??= Math.max(from, time);
        lastProducing = Math.min(to, time + model.step);
      }
      if (stopped && start == null) start = time;
      if (!stopped && start != null) {
        breaks.push({ from: start, to: time, breakSize: 0 });
        start = null;
      }
    }
    if (start != null) breaks.push({ from: start, to, breakSize: 0 });
    if (firstProducing == null)
      return (
        <Alert severity="info">
          No producing data in this window. Show stopped periods or select
          another range.
        </Alert>
      );
  }
  const axisStyle = {
    color: p.muted,
    fontSize: "10px",
    fontFamily: "'Geist Mono', monospace",
  };
  const axes = Array.isArray(yAxis) ? yAxis : [yAxis ?? {}];
  const visibleEpisodes = episodes.filter((episode) =>
    overlaps(episode, from, to),
  );
  const { tooltip: tooltipOptions, ...extraOptions } = extra;
  const options = {
    chart: {
      type: chartType,
      height,
      backgroundColor: "transparent",
      animation: false,
      style: { fontFamily: "Geist, system-ui, sans-serif" },
      zooming: { type: interactive ? "x" : undefined },
      events: interactive
        ? {
            selection(event) {
              if (event.xAxis) {
                nav.setWindow(event.xAxis[0].min, event.xAxis[0].max);
                return false;
              }
            },
            click(event) {
              const value = this.xAxis[0].toValue(event.chartX);
              if (Number.isFinite(value)) nav.setTime(value);
            },
          }
        : {},
    },
    title: { text: undefined },
    credits: { enabled: false },
    time: { timezone: "Asia/Kolkata" },
    accessibility: { description: title },
    colors: p.charts,
    xAxis: {
      type: "datetime",
      min: firstProducing ?? from,
      max: Math.max(lastProducing ?? to, (firstProducing ?? from) + model.step),
      gridLineColor: p.grid,
      lineColor: p.line,
      tickColor: p.line,
      labels: { style: axisStyle },
      breaks,
      plotBands: visibleEpisodes.map((e) => ({
        from: e.start,
        to: e.end,
        color: `${p.accent}20`,
        label: {
          text: visibleEpisodes.length < 8 ? e.fm : undefined,
          style: { ...axisStyle, color: p.accent },
        },
      })),
      plotLines: [
        {
          value: nav.time,
          color: p.accent,
          width: 1.5,
          zIndex: 5,
          label: { text: "Selected time", style: axisStyle },
        },
      ],
      ...xAxis,
    },
    yAxis: axes.map((axis) => ({
      title: { text: null, style: axisStyle },
      gridLineColor: p.grid,
      labels: { style: axisStyle },
      ...axis,
    })),
    legend: {
      enabled: legend,
      itemStyle: { color: p.muted, fontWeight: "400", fontSize: "11px" },
      itemHiddenStyle: { color: p.Unknown },
    },
    tooltip: {
      shared: chartType !== "heatmap",
      backgroundColor: p.paper,
      borderColor: p.strongLine,
      style: { color: p.ink, fontSize: "11px" },
      xDateFormat: "%Y-%m-%d %H:%M IST",
      valueDecimals: 2,
      ...tooltipOptions,
    },
    plotOptions: {
      series: {
        animation: false,
        turboThreshold: 5000,
        connectNulls: false,
        marker: { enabled: false },
        lineWidth: 1.5,
        states: { inactive: { opacity: 0.5 } },
        point: {
          events: {
            click(event) {
              if (onPointClick) {
                event.stopPropagation?.();
                onPointClick(this);
              } else if (interactive) nav.setTime(this.x);
            },
          },
        },
      },
      scatter: { lineWidth: 0 },
      arearange: {
        lineWidth: 0,
        fillOpacity: 0.14,
        enableMouseTracking: false,
      },
      heatmap: {
        borderWidth: 0,
        lineWidth: 0,
        marker: { enabled: true },
        nullColor: p.track,
      },
    },
    series,
    colorAxis,
    ...extraOptions,
  };
  return (
    <Box
      sx={{
        minWidth: 0,
        width: "100%",
        "& .highcharts-container": { maxWidth: "100%" },
        "& .highcharts-axis-title": { fill: p.muted },
      }}
      aria-label={title}
    >
      <HighchartsReact highcharts={Highcharts} options={options} />
      {interactive && (
        <Box sx={{ px: 1, pb: 0.5, fontSize: 10, color: "text.secondary" }}>
          Drag to select a window · click a point to inspect ·{" "}
          {formatTime(from, true)} – {formatTime(to, true)} IST
        </Box>
      )}
    </Box>
  );
}
