import { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import "highcharts/highcharts-more";
import HighchartsReactImport from "highcharts-react-official";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import { CATEGORY_COLORS, fmtDrill } from "./reliabilityDrill.js";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

// Spec §3 Map view corner labels. Low MTBF is left, high MTTR is up.
const CORNERS = [
  { text: "Worst", x: "left", y: "top" },
  { text: "Repair problem", x: "right", y: "top" },
  { text: "Reliability problem", x: "left", y: "bottom" },
  { text: "Healthy", x: "right", y: "bottom" },
];

/**
 * The MTBF / MTTR map at machine level (plot_drilldown_spec §3): one bubble
 * per machine, MTBF hrs across, MTTR hrs up, bubble size = downtime, colour =
 * category, crosshair at the plant's own MTBF / MTTR for the period.
 *
 * MTBF is drawn on a log axis: it runs from ~10 to ~700 hrs, and on a linear
 * axis every machine left of the plant line would sit in one sliver.
 *
 *   points  - [{ key, label, status, mtbf, mttr, downtime, clickable }]
 *   plant   - { mtbf, mttr } in hrs; either may be null
 *   onPick  - (point) => void for a clickable bubble
 */
function MtbfMttrMap({ points, plant, onPick }) {
  const theme = useTheme();

  const options = useMemo(() => {
    const grid = theme.palette.divider;
    const text = theme.palette.text.secondary;
    const axisTitle = { color: text, fontSize: "12px", fontWeight: "700" };
    const crosshair = (value, label) =>
      value == null
        ? []
        : [
            {
              value,
              color: theme.custom.brand.amber,
              dashStyle: "Dash",
              width: 1.5,
              zIndex: 3,
              label: {
                text: label,
                style: {
                  color: theme.custom.brand.amber,
                  fontSize: "10px",
                  fontWeight: "700",
                },
              },
            },
          ];

    return {
      chart: {
        type: "bubble",
        height: 460,
        zooming: { type: "xy" },
        spacing: [16, 16, 12, 8],
        backgroundColor: "transparent",
        style: { fontFamily: theme.typography.fontFamily },
        events: {
          render: function () {
            // Kept on the chart so each redraw replaces its own labels.
            (this.jkCornerLabels ?? []).forEach((l) => l.destroy());
            const { plotLeft, plotTop, plotWidth, plotHeight } = this;
            this.jkCornerLabels = CORNERS.map((c) => {
              const label = this.renderer
                .text(c.text, 0, 0)
                .css({ color: text, fontSize: "11px", fontWeight: "700" })
                .attr({ zIndex: 2, opacity: 0.8 })
                .add();
              const box = label.getBBox();
              label.attr({
                x:
                  c.x === "left"
                    ? plotLeft + 8
                    : plotLeft + plotWidth - box.width - 8,
                y: c.y === "top" ? plotTop + 16 : plotTop + plotHeight - 8,
              });
              return label;
            });
          },
        },
      },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: {
        itemStyle: { color: text, fontSize: "11px", fontWeight: 600 },
      },
      xAxis: {
        type: "logarithmic",
        title: { text: "MTBF (hrs)", style: axisTitle },
        gridLineWidth: 1,
        gridLineColor: grid,
        lineColor: grid,
        labels: { style: { color: text, fontSize: "11px" } },
        plotLines: crosshair(
          plant.mtbf,
          `Plant MTBF ${fmtDrill(plant.mtbf)} hrs`,
        ),
      },
      yAxis: {
        min: 0,
        title: { text: "MTTR (hrs)", style: axisTitle },
        gridLineColor: grid,
        labels: { style: { color: text, fontSize: "11px" } },
        plotLines: crosshair(
          plant.mttr,
          `Plant MTTR ${fmtDrill(plant.mttr)} hrs`,
        ),
      },
      tooltip: {
        useHTML: true,
        formatter: function () {
          const p = this.point.options.meta;
          return (
            `<b>${p.label}</b> · ${p.status ?? "—"}<br/>` +
            (p.eqname ? `${p.eqname}<br/>` : "") +
            `MTBF: <b>${fmtDrill(p.mtbf)} hrs</b><br/>` +
            `MTTR: <b>${fmtDrill(p.mttr)} hrs</b><br/>` +
            `Downtime: <b>${formatIndianNumber(p.downtime)} min</b>` +
            (p.clickable
              ? `<br/><span style="color:${text}">Click to drill down</span>`
              : "")
          );
        },
      },
      plotOptions: {
        bubble: {
          minSize: 6,
          maxSize: 42,
          opacity: 0.7,
          marker: { lineWidth: 1, lineColor: "#ffffff" },
          cursor: points.some((p) => p.clickable) ? "pointer" : undefined,
          point: {
            events: {
              click: function () {
                const p = this.options.meta;
                if (p?.clickable) onPick?.(p);
              },
            },
          },
        },
      },
      series: CATEGORY_COLORS.map((c) => ({
        name: c.name,
        color: c.color,
        data: points
          .filter((p) => (p.status ?? "Unmapped") === c.id)
          .map((p) => ({ x: p.mtbf, y: p.mttr, z: p.downtime ?? 0, meta: p })),
      })).filter((s) => s.data.length > 0),
    };
  }, [points, plant, onPick, theme]);

  return (
    <Box sx={{ width: "100%" }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </Box>
  );
}

export default MtbfMttrMap;
