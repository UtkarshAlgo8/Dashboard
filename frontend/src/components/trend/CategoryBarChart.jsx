import { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import {
  formatCompactNumber,
  formatIndianNumber,
  withUnit,
} from "@/lib/numberFormat.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * One value per category (a machine type, a machine), drawn as bars on a
 * zero-based axis. Sibling of BarChart.jsx, which plots a value over time.
 *
 *   items       - [{ label, value, group? }] in display order
 *   groups      - optional [{ id, name, color }]; each item is coloured by its
 *                 `group` and the legend names the groups
 *   horizontal  - true for horizontal bars (Highcharts `bar`)
 *   unit        - unit suffix for the axis, labels and tooltip
 */
function CategoryBarChart({ items, groups = null, horizontal = false, unit }) {
  const theme = useTheme();

  const options = useMemo(() => {
    const grid = theme.palette.divider;
    const text = theme.palette.text.secondary;
    const categories = items.map((it) => it.label);
    const valueOf = (it) =>
      typeof it.value === "number" && Number.isFinite(it.value)
        ? it.value
        : null;

    // One series per group, aligned to the shared categories, so the legend
    // names the groups; `grouping: false` keeps each bar on its category.
    const series = groups
      ? groups.map((g) => ({
          name: g.name,
          color: g.color,
          data: items.map((it) => (it.group === g.id ? valueOf(it) : null)),
        }))
      : [
          {
            name: unit ? `Value (${unit})` : "Value",
            color: theme.custom.brand.blue,
            data: items.map(valueOf),
          },
        ];

    const rowHeight = 34;
    return {
      chart: {
        type: horizontal ? "bar" : "column",
        height: horizontal ? Math.max(220, items.length * rowHeight + 80) : 340,
        // Room on the right for the last axis label and the value labels of
        // bars that reach the end of the axis.
        spacing: [16, horizontal ? 48 : 12, 12, 8],
        backgroundColor: "transparent",
        style: { fontFamily: theme.typography.fontFamily },
      },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: {
        enabled: Boolean(groups),
        itemStyle: { color: text, fontSize: "11px", fontWeight: 600 },
        symbolWidth: 12,
        symbolHeight: 12,
      },
      xAxis: {
        categories,
        lineColor: grid,
        tickColor: grid,
        labels: { style: { color: text, fontSize: "11px" } },
      },
      yAxis: {
        min: 0,
        ...(unit === "%" ? { max: 100 } : {}),
        title: { text: null },
        gridLineColor: grid,
        labels: {
          style: { color: text, fontSize: "11px" },
          formatter: function () {
            return withUnit(formatCompactNumber(this.value), unit);
          },
        },
      },
      tooltip: {
        shared: false,
        pointFormatter: function () {
          return `<b>${withUnit(formatIndianNumber(this.y), unit)}</b>`;
        },
        headerFormat: "{point.key}<br/>",
      },
      plotOptions: {
        series: {
          grouping: false,
          borderWidth: 0,
          borderRadius: 3,
          pointPadding: 0.12,
          groupPadding: 0.08,
          dataLabels: {
            enabled: items.length <= 20,
            inside: false,
            crop: false,
            overflow: "allow",
            style: {
              fontSize: "10px",
              fontWeight: "600",
              color: text,
              textOutline: "none",
            },
            formatter: function () {
              return this.y == null
                ? null
                : unit === "%"
                  ? `${formatIndianNumber(this.y)}%`
                  : formatCompactNumber(this.y);
            },
          },
        },
      },
      series,
    };
  }, [items, groups, horizontal, unit, theme]);

  return (
    <Box sx={{ width: "100%" }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </Box>
  );
}

export default CategoryBarChart;
