import { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import {
  formatCompactNumber,
  formatIndianNumber,
  withUnit,
} from "@/lib/numberFormat.js";

// highcharts-react-official 3.x ships as a UMD bundle — normalise both
// the direct default and the wrapped default. Mirrors LineChart.jsx so
// the two siblings share an import shape.
const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * Multi-series line chart for the Trend modal's VIEW BY × COMPARE view,
 * and the combined OVERLAY chart. Sibling to LineChart.jsx (single-series,
 * kept for non-OEE trends).
 *
 *   labels   - x-axis category labels (strings, parallel to values[])
 *   series   - array of { name, values, unit? } where values[i] is the y at
 *              labels[i] (nulls allowed — gaps render as breaks in the line).
 *              Each series can carry its own `unit`; the legend suffix and
 *              tooltip both pick it up. Falls back to the top-level `unit`
 *              prop when a series doesn't declare one — that's the OEE
 *              chart's case (all series are %).
 *   unit     - global unit suffix; overridden per-series when set
 *   target   - optional dashed amber plot line
 *   colors   - optional override of the brand palette, one per series
 *
 * Highcharts natively supports multi-series; we just feed the array in
 * instead of a hard-coded single entry. Legend renders inline (the
 * existing ChartLegend.jsx is single-series, so the legend ships as a
 * Highcharts native one here).
 */
function MultiLineChart({ labels, series, unit, target, colors, yMin }) {
  const theme = useTheme();

  const palette = useMemo(() => {
    if (Array.isArray(colors) && colors.length) return colors;
    // Stable brand palette — pulled once via theme, not per render, so
    // HMR / theme swaps don't reshuffle series colours.
    const b = theme.custom.brand;
    return [b.blue, b.orange, b.green, b.purple, b.teal, b.cyan];
  }, [colors, theme]);

  const options = useMemo(() => {
    const grid = theme.palette.divider;
    const text = theme.palette.text.secondary;
    const amber = theme.custom.brand.amber;

    // Per-series unit wins over the global one; missing falls through.
    // The legend entry appends the unit so the user can tell a "%" line
    // from a "min" line without consulting the tooltip.
    const cleanedSeries = (Array.isArray(series) ? series : []).map((s, i) => {
      const color = palette[i % palette.length];
      const seriesUnit = s.unit ?? unit ?? "";
      const values = (s.values ?? []).map((v) =>
        typeof v === "number" && Number.isFinite(v) ? v : null,
      );
      const legendName = seriesUnit
        ? `${s.name ?? `Series ${i + 1}`} (${seriesUnit})`
        : (s.name ?? `Series ${i + 1}`);
      return {
        name: legendName,
        // `notes[i]` adds a line under that point in the tooltip (e.g. the
        // tyres tested behind a machine's yield).
        data: Array.isArray(s.notes)
          ? values.map((y, j) => ({ y, note: s.notes[j] ?? null }))
          : values,
        color,
        tooltip: {
          valueSuffix: seriesUnit ? ` ${seriesUnit}` : "",
        },
      };
    });

    const showDataLabels =
      labels.length > 0 &&
      (labels.length <= 15 || labels.length * cleanedSeries.length <= 45);

    return {
      chart: {
        type: "line",
        height: 320,
        spacing: [16, 12, 12, 8],
        backgroundColor: "transparent",
        style: { fontFamily: theme.typography.fontFamily },
      },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: {
        // Inline legend — Highcharts renders the colour swatch + name
        // for each series automatically. Single-series hides itself
        // gracefully (Highcharts skips the legend block when only one
        // series exists), so this works for the Overall view too.
        enabled: true,
        itemStyle: {
          color: text,
          fontSize: "11px",
          fontWeight: 600,
        },
        itemHoverStyle: { color: text },
        symbolWidth: 12,
        symbolHeight: 12,
      },
      xAxis: {
        categories: labels,
        gridLineWidth: 1,
        gridLineColor: grid,
        gridLineDashStyle: "Solid",
        lineColor: grid,
        tickColor: grid,
        labels: { style: { color: text, fontSize: "11px" } },
      },
      yAxis: {
        title: { text: null },
        // A floor set by the caller (yield lines start just below their
        // lowest value rather than at 0).
        ...(yMin != null ? { min: yMin, startOnTick: false } : {}),
        gridLineWidth: 1,
        gridLineColor: grid,
        gridLineDashStyle: "Solid",
        labels: {
          style: { color: text, fontSize: "11px" },
          // The combined-overlay chart mixes units (%, min, MT, …) on
          // a single axis, so the axis label stays unitless. Per-series
          // tooltips carry the unit; the legend does too.
          formatter: function () {
            return withUnit(formatCompactNumber(this.value), unit);
          },
        },
        plotLines:
          target == null
            ? []
            : [
                {
                  value: target,
                  color: amber,
                  width: 1.5,
                  dashStyle: "Dash",
                  zIndex: 4,
                  label: {
                    text: `Target ${withUnit(formatCompactNumber(target), unit)}`,
                    align: "right",
                    style: {
                      color: amber,
                      fontSize: "11px",
                      fontWeight: "600",
                    },
                  },
                },
              ],
      },
      tooltip: {
        shared: true,
        useHTML: false,
        // Only charts that carry notes swap the default point line.
        ...((Array.isArray(series) ? series : []).some((s) =>
          Array.isArray(s.notes),
        )
          ? {
              pointFormatter: function () {
                const suffix = this.series.tooltipOptions.valueSuffix ?? "";
                const note = this.options?.note
                  ? ` · ${this.options.note}`
                  : "";
                return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${formatIndianNumber(this.y)}${suffix}</b>${note}<br/>`;
              },
            }
          : {}),
      },
      plotOptions: {
        line: {
          lineWidth: 2.5,
          marker: { enabled: true, radius: 3.5, lineWidth: 0 },
          states: { hover: { lineWidth: 3 } },
          dataLabels: {
            enabled: showDataLabels,
            allowOverlap: false,
            crop: false,
            overflow: "justify",
            padding: 3,
            style: {
              fontSize: "10px",
              fontWeight: "600",
              color: text,
              textOutline: "none",
              fontFamily: theme.typography.fontFamily,
            },
            formatter: function () {
              if (this.y == null) return null;
              return formatCompactNumber(this.y);
            },
          },
        },
      },
      series: cleanedSeries,
    };
  }, [labels, series, unit, target, theme, palette, yMin]);

  return (
    <Box sx={{ width: "100%" }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </Box>
  );
}

export default MultiLineChart;
