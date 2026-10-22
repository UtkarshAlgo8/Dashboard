import { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import { formatCompactNumber, withUnit } from "@/lib/numberFormat.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * One column per item on a zero-based axis, where a click on a column opens
 * the next drill level. Sibling of CategoryBarChart, which does not drill.
 *
 *   items    - [{ key, label, value, color, clickable, dataLabel?, tooltip }]
 *              in display order. `value: null` is "no breakdown": no column,
 *              only its data label. `tooltip` is [[name, text], ...].
 *   unit     - unit suffix for the axis
 *   xTitle   - x-axis title
 *   yTitle   - y-axis title
 *   refLine  - optional { value, label }, drawn as a dashed line
 *   groups   - optional [{ name, color }] for the legend
 *   onPick   - (item) => void, called for a clickable column
 */
function DrillColumnChart({
  items,
  unit,
  xTitle,
  yTitle,
  refLine = null,
  groups = null,
  onPick,
}) {
  const theme = useTheme();

  const options = useMemo(() => {
    const grid = theme.palette.divider;
    const text = theme.palette.text.secondary;
    const axisTitle = { color: text, fontSize: "12px", fontWeight: "700" };
    const values = items.map((it) => it.value ?? 0);
    const top = Math.max(...values, refLine?.value ?? 0, 0);
    const longest = items.reduce((n, it) => Math.max(n, it.label.length), 0);

    return {
      chart: {
        type: "column",
        height: 360 + Math.min(120, Math.max(0, longest - 8) * 5),
        spacing: [16, 12, 12, 8],
        backgroundColor: "transparent",
        style: { fontFamily: theme.typography.fontFamily },
      },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: {
        enabled: Boolean(groups?.length),
        itemStyle: { color: text, fontSize: "11px", fontWeight: 600 },
        symbolWidth: 12,
        symbolHeight: 12,
      },
      xAxis: {
        categories: items.map((it) => it.label),
        title: { text: xTitle, style: axisTitle },
        lineColor: grid,
        tickColor: grid,
        labels: {
          style: { color: text, fontSize: "11px", textOverflow: "ellipsis" },
          autoRotation: [-45, -90],
        },
      },
      yAxis: {
        min: 0,
        // Keep the reference line on the plot even when every column is
        // below it.
        max: top > 0 ? top * 1.12 : null,
        title: { text: yTitle, style: axisTitle },
        gridLineColor: grid,
        labels: {
          style: { color: text, fontSize: "11px" },
          formatter: function () {
            return withUnit(formatCompactNumber(this.value), unit);
          },
        },
        plotLines: refLine
          ? [
              {
                value: refLine.value,
                color: theme.custom.brand.amber,
                dashStyle: "Dash",
                width: 1.5,
                zIndex: 4,
                label: {
                  text: refLine.label,
                  align: "right",
                  x: -4,
                  y: -6,
                  style: {
                    color: theme.custom.brand.amber,
                    fontSize: "10px",
                    fontWeight: "700",
                  },
                },
              },
            ]
          : [],
      },
      tooltip: {
        useHTML: true,
        formatter: function () {
          const it = items[this.point.index];
          if (!it) return false;
          return (
            `<b>${it.label}</b><br/>` +
            it.tooltip.map(([k, v]) => `${k}: <b>${v}</b>`).join("<br/>") +
            (it.clickable
              ? `<br/><span style="color:${text}">Click to drill down</span>`
              : "")
          );
        },
      },
      plotOptions: {
        column: {
          borderWidth: 0,
          borderRadius: 3,
          pointPadding: 0.1,
          groupPadding: 0.08,
          point: {
            events: {
              click: function () {
                const it = items[this.index];
                if (it?.clickable) onPick?.(it);
              },
            },
          },
          dataLabels: {
            enabled: true,
            crop: false,
            overflow: "allow",
            style: {
              fontSize: "10.5px",
              fontWeight: "700",
              color: theme.palette.text.primary,
              textOutline: "none",
            },
            formatter: function () {
              return items[this.point.index]?.dataLabel ?? null;
            },
          },
        },
      },
      series: [
        {
          name: yTitle,
          showInLegend: false,
          data: items.map((it) => ({
            // "no breakdown" keeps its category and its label, but no column.
            y: it.value ?? 0,
            color: it.color,
          })),
          cursor: items.some((it) => it.clickable) ? "pointer" : undefined,
        },
        // Legend-only series: one swatch per colour group.
        ...(groups ?? []).map((g) => ({
          name: g.name,
          color: g.color,
          data: [],
          events: { legendItemClick: () => false },
        })),
      ],
    };
  }, [items, unit, xTitle, yTitle, refLine, groups, onPick, theme]);

  return (
    <Box sx={{ width: "100%" }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </Box>
  );
}

export default DrillColumnChart;
