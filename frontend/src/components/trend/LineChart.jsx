import { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { formatCompactNumber, withUnit } from "@/lib/numberFormat.js";
import ChartLegend from "./ChartLegend.jsx";
import { buildTrendLegend, pickTrendExtremes } from "./trendLegend.js";

// highcharts-react-official 3.x ships as a UMD bundle. Depending on
// the Vite CJS-interop path the default import resolves to either
// the React component or to a wrapper object whose `.default` is
// the component. Normalise both shapes here.
const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * Trend modal line chart, powered by Highcharts. Same props the
 * previous SVG implementation accepted so TrendModal is unchanged.
 *
 *   labels  - x-axis category labels (strings)
 *   values  - numeric series, parallel to labels (nulls allowed)
 *   unit    - optional unit string
 *   target  - optional dashed amber plot line
 *   lowerIsBetter - colour the min Best / max Worst (Scrap, Rework, ...)
 *
 * BEST / WORST points are emphasised via per-point colour (green for
 * best, red for worst — max/min, flipped when lowerIsBetter) matching
 * BRD FR-X14 + the artifact look.
 */
function LineChart({ labels, values, unit, target, lowerIsBetter = false }) {
  const theme = useTheme();

  const options = useMemo(() => {
    const colors = {
      line: theme.custom.brand.orange,
      target: theme.custom.brand.amber,
      best: theme.custom.brand.green,
      worst: theme.custom.brand.red,
      grid: theme.palette.divider,
      text: theme.palette.text.secondary,
    };

    const cleaned = values.map((v) =>
      typeof v === "number" && Number.isFinite(v) ? v : null,
    );
    const { best, worst } = pickTrendExtremes(cleaned, lowerIsBetter);

    const data = cleaned.map((v) => {
      if (v === null) return { y: null };
      if (best !== null && v === best)
        return { y: v, color: colors.best, marker: { radius: 6 } };
      if (worst !== null && v === worst)
        return { y: v, color: colors.worst, marker: { radius: 6 } };
      return { y: v };
    });

    const showDataLabels = labels.length > 0 && labels.length <= 31;

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
      legend: { enabled: false },
      xAxis: {
        categories: labels,
        gridLineWidth: 1,
        gridLineColor: colors.grid,
        gridLineDashStyle: "Solid",
        lineColor: colors.grid,
        tickColor: colors.grid,
        labels: { style: { color: colors.text, fontSize: "11px" } },
      },
      yAxis: {
        title: { text: null },
        gridLineWidth: 1,
        gridLineColor: colors.grid,
        gridLineDashStyle: "Solid",
        labels: {
          style: { color: colors.text, fontSize: "11px" },
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
                  color: colors.target,
                  width: 1.5,
                  dashStyle: "Dash",
                  zIndex: 4,
                  label: {
                    text: `Target ${withUnit(formatCompactNumber(target), unit)}`,
                    align: "right",
                    style: {
                      color: colors.target,
                      fontSize: "11px",
                      fontWeight: "600",
                    },
                  },
                },
              ],
      },
      tooltip: {
        shared: false,
        valueSuffix: unit ? ` ${unit}` : "",
      },
      plotOptions: {
        line: {
          color: colors.line,
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
              color: colors.text,
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
      series: [{ name: "Actual", data }],
    };
  }, [labels, values, unit, target, lowerIsBetter, theme]);

  const legendItems = buildTrendLegend({
    values,
    target,
    unit,
    colors: {
      actual: theme.custom.brand.orange,
      best: theme.custom.brand.green,
      worst: theme.custom.brand.red,
      target: theme.custom.brand.amber,
    },
  });

  return (
    <Box sx={{ width: "100%" }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
      <ChartLegend items={legendItems} />
    </Box>
  );
}

export default LineChart;
