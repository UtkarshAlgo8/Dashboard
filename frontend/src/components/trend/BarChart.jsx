import { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import ChartLegend from "./ChartLegend.jsx";
import { formatCompactNumber, withUnit } from "@/lib/numberFormat.js";
import { buildTrendLegend } from "./trendLegend.js";

// highcharts-react-official 3.x ships as a UMD bundle. Depending on
// the Vite CJS-interop path the default import resolves to either
// the React component or to a wrapper object whose `.default` is
// the component. Normalise both shapes here.
const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * Trend modal column chart, powered by Highcharts. Same props as the
 * previous SVG implementation so TrendModal is unchanged.
 *
 *   labels  - x-axis category labels
 *   values  - numeric series parallel to labels
 *   unit    - optional unit string
 *   target  - optional dashed amber plot line
 *
 * Note: Highcharts calls vertical bars `column` (their `bar` is
 * horizontal). We use `column` since the artifact's discrete-count
 * KPIs render vertical bars.
 */
function BarChart({ labels, values, unit, target }) {
  const theme = useTheme();

  const options = useMemo(() => {
    const colors = {
      bar: theme.custom.brand.orange,
      target: theme.custom.brand.amber,
      best: theme.custom.brand.green,
      worst: theme.custom.brand.red,
      grid: theme.palette.divider,
      text: theme.palette.text.secondary,
    };

    const cleaned = values.map((v) =>
      typeof v === "number" && Number.isFinite(v) ? v : null,
    );
    const numeric = cleaned.filter((v) => v !== null);
    const max = numeric.length ? Math.max(...numeric) : null;
    const min = numeric.length ? Math.min(...numeric) : null;

    const data = cleaned.map((v) => {
      if (v === null) return { y: null };
      if (max !== min && v === max) return { y: v, color: colors.best };
      if (max !== min && v === min) return { y: v, color: colors.worst };
      return { y: v };
    });

    return {
      chart: {
        type: "column",
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
        lineColor: colors.grid,
        tickColor: colors.grid,
        labels: { style: { color: colors.text, fontSize: "11px" } },
      },
      yAxis: {
        title: { text: null },
        gridLineColor: colors.grid,
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
                    text: `Target ${target}${unit ?? ""}`,
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
        column: {
          color: colors.bar,
          borderRadius: 2,
          borderWidth: 0,
          pointPadding: 0.08,
          groupPadding: 0.06,
        },
      },
      series: [{ name: "Actual", data }],
    };
  }, [labels, values, unit, target, theme]);

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

export default BarChart;
