import { Box, Typography, useTheme } from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { ANOMALY_STATES } from "@/lib/anomaly/constants.js";
import { producingAt } from "@/lib/anomaly/model.js";
import AnomalyChart from "./AnomalyChart.jsx";

export default function SensorHeatmap({ kind = "health", tags }) {
  const { model, nav } = useAnomaly();
  const p = useTheme().custom.anomaly;
  const ids =
    tags ??
    model.tagIds
      .slice()
      .sort(
        (a, b) =>
          model.tags[a].se.localeCompare(model.tags[b].se) ||
          a.localeCompare(b),
      );
  const i0 = Math.max(
    0,
    Math.floor((nav.from - model.tagStart) / model.tagStep),
  );
  const i1 = Math.min(
    model.getTagSeries(ids[0] ?? "").h?.length ?? 0,
    Math.ceil((nav.to - model.tagStart) / model.tagStep),
  );
  const stride = Math.max(1, Math.ceil((i1 - i0) / 180));
  const data = [];
  ids.forEach((tag, row) => {
    const values =
      model.getTagSeries(tag)[kind === "health" ? "h" : "an"] ?? [];
    for (let i = i0; i <= i1; i += stride) {
      let value = null;
      for (let j = i; j < Math.min(i + stride, i1 + 1); j++) {
        if (
          nav.hideStops &&
          !producingAt(model, model.tagStart + j * model.tagStep)
        )
          continue;
        if (values[j] != null)
          value =
            value == null
              ? values[j]
              : kind === "health"
                ? Math.min(value, values[j])
                : Math.max(value, values[j]);
      }
      if (value != null)
        data.push([
          model.tagStart + (i + (stride - 1) / 2) * model.tagStep,
          row,
          value,
        ]);
    }
  });
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        Worst value per {stride * 10}-minute display bucket · click a cell to
        inspect its tag.{" "}
        {kind === "health"
          ? "Red < 50 · amber 50–80 · teal ≥ 80"
          : "Normal · Watch · Anomaly · Unscored"}
      </Typography>
      <AnomalyChart
        title={
          kind === "health" ? "Sensor health heatmap" : "Per-tag anomaly status"
        }
        chartType="heatmap"
        series={[
          {
            name: kind === "health" ? "Health" : "Anomaly status",
            data,
            colsize: model.tagStep * stride,
            rowsize: 0.92,
            borderWidth: 0,
          },
        ]}
        height={Math.max(180, ids.length * 16 + 70)}
        interactive={false}
        legend={false}
        yAxis={{
          categories: ids.map(
            (tag) =>
              `${model.tags[tag].se} ${tag.length > 38 ? `${tag.slice(0, 37)}…` : tag}`,
          ),
          reversed: true,
          gridLineWidth: 0,
          labels: { style: { color: p.muted, fontSize: "9px" } },
        }}
        colorAxis={{
          dataClasses:
            kind === "health"
              ? [
                  { to: 49.99, color: p.Critical },
                  { from: 50, to: 79.99, color: p.Advisory },
                  { from: 80, color: p.Normal },
                ]
              : ANOMALY_STATES.map((name, value) => ({
                  from: value,
                  to: value,
                  name,
                  color: [p.track, p.Advisory, p.Critical, p.Unknown][value],
                })),
        }}
        onPointClick={(point) => nav.openTag(ids[point.y])}
        extra={{
          tooltip: {
            pointFormatter() {
              return `${ids[this.y]}<br>${kind === "health" ? `Health: ${this.value}` : ANOMALY_STATES[this.value]}`;
            },
          },
        }}
      />
    </Box>
  );
}
