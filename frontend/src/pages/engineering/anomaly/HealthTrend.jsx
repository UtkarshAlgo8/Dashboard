import { useTheme } from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { points } from "@/lib/anomaly/model.js";
import AnomalyChart from "./AnomalyChart.jsx";

export default function HealthTrend({ equipment, height = 330 }) {
  const { model, nav } = useAnomaly();
  const p = useTheme().custom.anomaly;
  const source = equipment ? model.equipment[equipment] : model.overall;
  const data = (values) =>
    points(model, values, nav.from, nav.to, { hideStops: nav.hideStops });
  const episodes = model.episodes.filter(
    (e) => !equipment || e.se === equipment,
  );
  const transients = model.transients.filter(
    (e) =>
      (!equipment || e.se === equipment) &&
      e.start >= nav.from &&
      e.start <= nav.to,
  );
  const series = [
    { name: "Failure-mode health", data: data(source.health), color: p.ink },
    {
      name: "Isolation Forest",
      data: data(source.isolation),
      color: p.muted,
      dashStyle: "ShortDot",
    },
    {
      name: "Transient (not alerted)",
      type: "scatter",
      data: transients.map((e) => ({ x: e.start, y: 3, custom: e })),
      color: p.accent,
      marker: { enabled: true, symbol: "diamond", radius: 3 },
    },
  ];
  if (equipment) {
    series.push({
      name: "Coverage",
      data: data(source.coverage).map(([x, y]) => [
        x,
        y == null ? null : y * 100,
      ]),
      color: p.charts[0],
      dashStyle: "Dash",
    });
    series.push({
      name: "Unknown / score withheld",
      type: "scatter",
      data: data(source.unknown)
        .filter(([, y]) => y)
        .map(([x]) => [x, 50]),
      color: p.Unknown,
      marker: { enabled: true, symbol: "square", radius: 2 },
    });
  }
  return (
    <AnomalyChart
      title={equipment ? `${equipment} health trend` : "Overall health trend"}
      series={series}
      height={height}
      episodes={episodes}
      yAxis={{
        min: 0,
        max: 100,
        tickPositions: [0, 50, 75, 90, 100],
        plotLines: [50, 75, 90].map((value) => ({
          value,
          color: p.line,
          dashStyle: "Dash",
          width: 1,
        })),
      }}
    />
  );
}
