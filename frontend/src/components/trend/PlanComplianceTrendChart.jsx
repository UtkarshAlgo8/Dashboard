import { useMemo } from "react";
import { Box, useTheme } from "@mui/material";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

/**
 * Plan vs Production Trend combo chart powered by Highcharts.
 *
 * Props:
 *   labels             - x-axis date labels (e.g. ['01 Sep', '02 Sep'])
 *   plannedValues      - parallel array of numeric planned quantities
 *   producedValues     - parallel array of numeric actual produced quantities
 *   fulfillmentValues  - parallel array of fulfillment percentages (e.g. [95.0, 103.8])
 *   unit               - quantity unit (default 'NOS')
 */
export default function PlanComplianceTrendChart({
  labels = [],
  plannedValues = [],
  producedValues = [],
  fulfillmentValues = [],
  unit = "NOS",
}) {
  const theme = useTheme();

  const options = useMemo(() => {
    const isDark = theme.palette.mode === "dark";
    const colors = {
      planned: "#FFA3A3", // Coral / Light pink
      produced: theme.custom?.brand?.red || "#E52E2E", // Solid red
      fulfillment: theme.custom?.brand?.red || "#E52E2E",
      grid: theme.palette.divider,
      text: theme.palette.text.secondary,
      textPrimary: theme.palette.text.primary,
    };

    const maxQty = Math.max(
      ...plannedValues.filter((v) => typeof v === "number"),
      ...producedValues.filter((v) => typeof v === "number"),
      0,
    );
    const useKFormat = maxQty >= 1000;

    return {
      chart: {
        height: 380,
        spacing: [20, 16, 16, 16],
        backgroundColor: "transparent",
        style: { fontFamily: theme.typography.fontFamily },
      },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      legend: {
        enabled: true,
        align: "center",
        verticalAlign: "top",
        layout: "horizontal",
        itemStyle: {
          color: colors.textPrimary,
          fontSize: "12px",
          fontWeight: "600",
        },
        itemHoverStyle: {
          color: theme.palette.primary.main,
        },
        symbolRadius: 2,
      },
      xAxis: {
        categories: labels,
        lineColor: colors.grid,
        tickColor: colors.grid,
        labels: {
          style: {
            color: colors.text,
            fontSize: "11px",
            fontWeight: "500",
          },
        },
      },
      yAxis: [
        {
          // Left Axis: Quantity
          title: {
            text: useKFormat ? `Quantity in Thousands (${unit})` : `Quantity (${unit})`,
            style: { color: colors.text, fontSize: "11px", fontWeight: "600" },
          },
          labels: {
            formatter: function () {
              if (useKFormat) {
                return this.value >= 1000 ? Math.round(this.value / 1000) + "k" : this.value;
              }
              return this.value.toLocaleString();
            },
            style: { color: colors.text, fontSize: "11px" },
          },
          gridLineColor: colors.grid,
          min: 0,
          opposite: false,
        },
        {
          // Right Axis: Fulfillment %
          title: {
            text: "Fulfillment %",
            style: { color: colors.text, fontSize: "11px", fontWeight: "600" },
          },
          labels: {
            format: "{value}%",
            style: { color: colors.text, fontSize: "11px" },
          },
          gridLineWidth: 0,
          min: 0,
          opposite: true,
        },
      ],
      tooltip: {
        shared: true,
        useHTML: true,
        backgroundColor: isDark ? "#1E1E1E" : "#FFFFFF",
        borderColor: colors.grid,
        borderRadius: 8,
        shadow: true,
        formatter: function () {
          const dateLabel = this.x;
          let planned = null;
          let produced = null;
          let fulfillment = null;

          for (const pt of this.points) {
            if (pt.series.name === "Planned") planned = pt.y;
            else if (pt.series.name === "Produced") produced = pt.y;
            else if (pt.series.name === "Fulfillment %") fulfillment = pt.y;
          }

          const diff = produced != null && planned != null ? produced - planned : null;
          const diffStr =
            diff != null
              ? diff >= 0
                ? `+${diff.toLocaleString()} ${unit}`
                : `${diff.toLocaleString()} ${unit}`
              : "—";

          return `
            <div style="padding: 6px 10px; font-family: inherit; font-size: 12px; min-width: 170px;">
              <div style="font-weight: 700; margin-bottom: 6px; color: ${colors.textPrimary}; border-bottom: 1px solid ${colors.grid}; padding-bottom: 4px;">
                ${dateLabel}
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #FFA3A3; font-weight: 600;">■ Planned:</span>
                <span style="font-weight: 700; color: ${colors.textPrimary};">${planned != null ? planned.toLocaleString() + " " + unit : "—"}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: ${colors.produced}; font-weight: 600;">■ Produced:</span>
                <span style="font-weight: 700; color: ${colors.textPrimary};">${produced != null ? produced.toLocaleString() + " " + unit : "—"}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: ${colors.text};">Deviation:</span>
                <span style="font-weight: 600; color: ${diff != null && diff < 0 ? colors.produced : 'inherit'};">${diffStr}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 4px; padding-top: 4px; border-top: 1px dashed ${colors.grid};">
                <span style="color: ${colors.fulfillment}; font-weight: 700;">● Fulfillment:</span>
                <span style="font-weight: 800; color: ${colors.fulfillment};">${fulfillment != null ? fulfillment.toFixed(1) + "%" : "—"}</span>
              </div>
            </div>
          `;
        },
      },
      plotOptions: {
        column: {
          grouping: true,
          pointPadding: 0.12,
          groupPadding: 0.22,
          borderWidth: 0,
          borderRadius: 3,
          dataLabels: {
            enabled: labels.length > 0 && labels.length <= 31,
            formatter: function () {
              if (this.y == null || this.y === 0) return "";
              if (useKFormat) {
                return this.y >= 1000 ? Math.round(this.y / 1000) + "k" : this.y;
              }
              return this.y.toLocaleString();
            },
            style: {
              fontSize: "10.5px",
              fontWeight: "600",
              color: colors.textPrimary,
              textOutline: isDark ? "1px #000" : "1px #FFF",
            },
            inside: false,
            verticalAlign: "bottom",
            y: -4,
          },
        },
        line: {
          marker: {
            enabled: true,
            radius: 4.5,
            symbol: "circle",
            fillColor: colors.fulfillment,
            lineWidth: 2,
            lineColor: isDark ? "#1E1E1E" : "#FFFFFF",
          },
          dataLabels: {
            enabled: labels.length > 0 && labels.length <= 31,
            formatter: function () {
              return this.y != null ? this.y.toFixed(1) + "%" : "";
            },
            style: {
              fontSize: "11px",
              fontWeight: "700",
              color: colors.fulfillment,
              textOutline: isDark ? "1px #000" : "1px #FFF",
            },
            y: -10,
          },
        },
      },
      series: [
        {
          name: "Planned",
          type: "column",
          yAxis: 0,
          color: colors.planned,
          data: plannedValues,
        },
        {
          name: "Produced",
          type: "column",
          yAxis: 0,
          color: colors.produced,
          data: producedValues,
        },
        {
          name: "Fulfillment %",
          type: "line",
          yAxis: 1,
          color: colors.fulfillment,
          lineWidth: 2.5,
          data: fulfillmentValues,
          zIndex: 5,
        },
      ],
    };
  }, [labels, plannedValues, producedValues, fulfillmentValues, unit, theme]);

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <HighchartsReact highcharts={Highcharts} options={options} />
    </Box>
  );
}
