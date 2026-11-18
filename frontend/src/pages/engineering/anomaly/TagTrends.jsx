import { Alert, useTheme } from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { points } from "@/lib/anomaly/model.js";
import AnomalyChart from "./AnomalyChart.jsx";

export default function TagTrends({
  tags,
  mode = "stack",
  envelope = true,
  health = false,
  normalize = false,
}) {
  const { model, nav } = useAnomaly();
  const p = useTheme().custom.anomaly;
  if (!tags.length)
    return <Alert severity="info">Select tags to plot their values.</Alert>;
  const series = [],
    axes = [];
  const units = [
    ...new Set(tags.map((tag) => model.tags[tag]?.unit.split(" (")[0])),
  ];
  const normalized = normalize && mode !== "stack";
  tags.forEach((tag, k) => {
    if (!model.tags[tag]) return;
    const values = model.getTagSeries(tag),
      config = model.tags[tag].cfg;
    const unit = model.tags[tag].unit.split(" (")[0];
    const axis =
      mode === "stack" ? k : normalized ? 0 : Math.min(units.indexOf(unit), 1);
    const color = p.charts[k % p.charts.length];
    const rawPoints = (arr) =>
      points(model, arr, nav.from, nav.to, {
        tag: true,
        hideStops: nav.hideStops,
      });
    const finite = normalized
      ? [...rawPoints(values.lo), ...rawPoints(values.hi)]
          .map(([, value]) => value)
          .filter((value) => value != null)
      : [];
    const min = finite.length ? Math.min(...finite) : 0;
    const spread = finite.length ? Math.max(...finite) - min || 1 : 1;
    const scale = (value) =>
      value == null ? null : normalized ? (value - min) / spread : value;
    const data = (arr) =>
      rawPoints(arr).map(([time, value]) => [time, scale(value)]);
    const mean = data(values.a);
    const low = data(values.lo),
      high = data(values.hi);
    series.push({
      name: `${tag} · ${normalized ? "normalised" : unit}`,
      type: "line",
      data: mean,
      yAxis: axis,
      color,
    });
    series.push({
      name: `${tag} min–max`,
      type: "arearange",
      data: low.map(([x, y], index) => [x, y, high[index]?.[1] ?? null]),
      yAxis: axis,
      color,
      showInLegend: false,
    });
    const excluded = mean.filter(
      ([x]) => values.x[Math.floor((x - model.tagStart) / model.tagStep)] === 2,
    );
    series.push({
      name: `${tag} EXCLUDED`,
      type: "scatter",
      data: excluded,
      yAxis: axis,
      color: p.Critical,
      marker: { enabled: true, symbol: "square", radius: 3 },
      showInLegend: false,
    });
    if (!axes[axis]) {
      axes[axis] = {
        title: {
          text:
            mode === "stack"
              ? `${tag.slice(0, 40)} · ${unit}`
              : normalized
                ? "Normalised 0–1 over window"
                : unit,
        },
        opposite: mode !== "stack" && axis === 1,
        ...(mode === "stack"
          ? {
              top: `${(100 * k) / (tags.length + (health ? 1 : 0))}%`,
              height: `${85 / (tags.length + (health ? 1 : 0))}%`,
              offset: 0,
            }
          : {}),
        plotLines: [],
      };
    }
    if (envelope && config.op_min != null) {
      axes[axis].plotLines.push(
        ...[config.op_min, config.op_max].map((value) => ({
          value: scale(value),
          color,
          width: 1,
          dashStyle: "Dash",
        })),
      );
    }
  });
  if (health && tags.length === 1) {
    series.push({
      name: "Sensor health",
      data: points(model, model.getTagSeries(tags[0]).h, nav.from, nav.to, {
        tag: true,
      }),
      yAxis: axes.length,
      color: p.muted,
    });
    axes.push({
      min: 0,
      max: 100,
      top: "65%",
      height: "25%",
      offset: 0,
      title: { text: "Sensor health" },
      plotLines: [50, 80].map((value) => ({
        value,
        width: 1,
        dashStyle: "Dash",
        color: p.line,
      })),
    });
    axes[0] = { ...axes[0], top: "0%", height: "55%" };
  }
  return (
    <AnomalyChart
      title="Raw tag values and operating envelopes"
      series={series}
      yAxis={axes}
      height={
        mode === "stack"
          ? Math.max(300, tags.length * 125 + (health ? 110 : 40))
          : 450
      }
      episodes={model.episodes}
      legend={mode !== "stack"}
    />
  );
}
