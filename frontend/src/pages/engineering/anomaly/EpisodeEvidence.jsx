import { useReducer } from "react";
import {
  Alert,
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import useAnomaly from "@/hooks/useAnomaly.js";
import { MINUTE } from "@/lib/anomaly/constants.js";
import {
  conditionMet,
  decodedWindow,
  fmt,
  parseTime,
  thresholdText,
} from "@/lib/anomaly/model.js";
import {
  AnomalyPanel,
  AnomalyTable,
  CoverageMeter,
  EvidenceCallout,
} from "./AnomalyParts.jsx";
import AnomalyChart from "./AnomalyChart.jsx";

export default function EpisodeEvidence({ episode, mode }) {
  const { model } = useAnomaly();
  const p = useTheme().custom.anomaly;
  const [settings, update] = useReducer(
    (state, action) => ({ ...state, ...action }),
    { padding: 60, layout: "stack", off: [] },
  );
  const raw = model.windows.find(
    (window) =>
      window.se === mode.se &&
      parseTime(window.t0) <= episode.start &&
      parseTime(window.t0) + window.n * MINUTE > episode.start,
  );
  const window = decodedWindow(raw);
  if (!window)
    return (
      <Alert severity="info" sx={{ my: 2 }}>
        No 1-minute raw-data window was exported for this episode.
      </Alert>
    );
  const from = Math.max(
    window.start,
    episode.start - settings.padding * MINUTE,
  );
  const to = Math.min(
    window.start + (window.n - 1) * MINUTE,
    episode.end + settings.padding * MINUTE,
  );
  const i0 = Math.max(0, Math.floor((from - window.start) / MINUTE));
  const i1 = Math.min(window.n - 1, Math.ceil((to - window.start) / MINUTE));
  const slice = (values) =>
    Array.from({ length: Math.max(0, i1 - i0 + 1) }, (_, offset) => [
      window.start + (i0 + offset) * MINUTE,
      values?.[i0 + offset] ?? null,
    ]);
  const evidence = mode.evidence.filter((item) => window.indicators[item.ind]);
  const count = evidence.length + (window.modes[mode.id] ? 1 : 0);
  const axes = [],
    series = [];
  const evidenceRows = evidence.map((item, index) => {
    const values = window.indicators[item.ind];
    const data = slice(values.v);
    const limits = Array.isArray(item.thr_u)
      ? item.thr_u
      : item.thr_u != null
        ? item.op === "abs>"
          ? [-item.thr_u, item.thr_u]
          : [item.thr_u]
        : [];
    axes.push({
      top: `${(100 * index) / count}%`,
      height: `${80 / count}%`,
      offset: 0,
      title: { text: `${item.role} · ${item.ind}` },
      plotLines: limits.map((value) => ({
        value,
        color: p.accent,
        width: 1,
        dashStyle: "Dash",
      })),
    });
    series.push({ name: item.ind, data, yAxis: index, color: p.muted });
    series.push({
      name: `${item.ind} condition met`,
      type: "scatter",
      data: data.filter(([, value]) => conditionMet(item, value)),
      color: p.accent,
      yAxis: index,
      marker: { enabled: true, radius: 2 },
      showInLegend: false,
    });
    const declaration = Math.round(
      ((episode.declaredAt ?? episode.start) - window.start) / MINUTE,
    );
    const peak = values.v
      .slice(
        Math.max(0, Math.floor((episode.start - window.start) / MINUTE)),
        Math.ceil((episode.end - window.start) / MINUTE),
      )
      .filter((value) => value != null)
      .sort((a, b) => Math.abs(b) - Math.abs(a))[0];
    const at = episode.declaredAt ? values.v[declaration] : peak;
    return {
      ...item,
      value: at,
      trust: values.trust[declaration],
      met: conditionMet(item, at),
    };
  });
  if (window.modes[mode.id]) {
    axes.push({
      top: `${(100 * evidence.length) / count}%`,
      height: `${80 / count}%`,
      min: 0,
      max: 1,
      offset: 0,
      title: { text: "Confidence" },
    });
    series.push({
      name: "Confidence while declared",
      data: slice(window.modes[mode.id].conf),
      color: p.accent,
      yAxis: evidence.length,
      step: "left",
    });
  }
  const evidenceTags = new Set(mode.evidence.flatMap((item) => item.tags));
  const tagIds = Object.keys(window.tags)
    .filter((tag) => model.tags[tag] && model.tags[tag].role !== "counter")
    .sort(
      (a, b) =>
        Number(evidenceTags.has(b)) - Number(evidenceTags.has(a)) ||
        a.localeCompare(b),
    );
  const on = tagIds.filter((tag) => !settings.off.includes(tag));
  const rawAxes = [],
    rawSeries = [];
  on.forEach((tag, index) => {
    const values = window.tags[tag],
      color = p.charts[index % p.charts.length],
      stack = settings.layout === "stack";
    const axis = stack ? index : 0;
    const lows = slice(values.min),
      highs = slice(values.max),
      clean = slice(values.clean),
      average = slice(values.avg);
    const finite = [...lows, ...highs]
      .map(([, value]) => value)
      .filter((value) => value != null);
    const min = Math.min(...finite),
      spread = Math.max(...finite) - min || 1;
    const normalize = (value) =>
      value == null ? null : stack ? value : (value - min) / spread;
    const normalized = (data) =>
      data.map(([time, value]) => [time, normalize(value)]);
    if (!rawAxes[axis])
      rawAxes[axis] = stack
        ? {
            top: `${(100 * index) / on.length}%`,
            height: `${80 / on.length}%`,
            offset: 0,
            title: {
              text: `${tag.slice(0, 35)} · ${model.tags[tag].unit.split(" (")[0]}`,
            },
            plotLines:
              model.tags[tag].cfg.op_min != null
                ? [model.tags[tag].cfg.op_min, model.tags[tag].cfg.op_max].map(
                    (value) => ({ value, color, width: 1, dashStyle: "Dash" }),
                  )
                : [],
          }
        : { title: { text: "Normalised 0–1 over window" }, min: 0, max: 1 };
    rawSeries.push({
      name: `${tag} min–max`,
      type: "arearange",
      data: lows.map(([time, value], k) => [
        time,
        normalize(value),
        normalize(highs[k]?.[1]),
      ]),
      yAxis: axis,
      color,
      showInLegend: false,
    });
    rawSeries.push({
      name: `${tag} raw`,
      data: normalized(average),
      yAxis: axis,
      color,
      dashStyle: "ShortDot",
      opacity: 0.45,
      showInLegend: false,
    });
    rawSeries.push({
      name: `${tag} cleaned`,
      data: normalized(clean),
      yAxis: axis,
      color,
    });
    rawSeries.push({
      name: `${tag} EXCLUDED`,
      type: "scatter",
      yAxis: axis,
      color: p.Critical,
      marker: { enabled: true, symbol: "square", radius: 3 },
      data: normalized(
        average.filter(
          ([time]) =>
            values.action[Math.round((time - window.start) / MINUTE)] === 2,
        ),
      ),
      showInLegend: false,
    });
    rawSeries.push({
      name: `${tag} spike removed`,
      type: "scatter",
      yAxis: axis,
      color: p.Critical,
      marker: { enabled: true, symbol: "diamond", radius: 4 },
      data: normalized(
        highs.filter(
          ([time]) =>
            values.spikes[Math.round((time - window.start) / MINUTE)] > 0,
        ),
      ),
      showInLegend: false,
    });
  });
  return (
    <AnomalyPanel
      title={`${episode.transient ? "Transient · not declared" : episode.outcome ? "v1 episode · v2 outcome" : "Episode drill-down"} · ${episode.onset}`}
      action={
        <Stack direction="row" gap={1} flexWrap="wrap">
          <ToggleButtonGroup
            exclusive
            size="small"
            value={settings.padding}
            onChange={(_, padding) => {
              if (padding) update({ padding });
            }}
            aria-label="Episode window padding"
          >
            {[15, 30, 60].map((value) => (
              <ToggleButton value={value} key={value}>
                ±{value}m
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={settings.layout}
            onChange={(_, layout) => {
              if (layout) update({ layout });
            }}
            aria-label="Episode raw chart layout"
          >
            <ToggleButton value="stack">Stacked</ToggleButton>
            <ToggleButton value="overlay">Overlay</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      }
    >
      {episode.outcome && (
        <EvidenceCallout critical={episode.outcome.includes("sensor")}>
          <b>{episode.outcome}.</b> {episode.reason}
        </EvidenceCallout>
      )}
      <Typography variant="body2">
        Onset {episode.onset} · end{" "}
        {episode.transient
          ? "transient"
          : episode.end
            ? new Date(episode.end).toLocaleString("en-GB", {
                timeZone: "Asia/Kolkata",
              })
            : "—"}{" "}
        · {episode.min} min
        {episode.declared ? ` · declared ${episode.declared}` : ""}
      </Typography>
      {episode.conf != null && (
        <CoverageMeter value={episode.conf} label="Episode confidence" />
      )}
      <Typography
        component="h4"
        sx={{ fontSize: 13, fontWeight: 600, my: 1.5 }}
      >
        Evidence indicators · accent = condition met · dashed = exported
        threshold
      </Typography>
      {series.length > 0 && (
        <AnomalyChart
          title="Episode evidence indicators"
          series={series}
          yAxis={axes}
          height={Math.max(250, count * 105)}
          range={[from, to]}
          episodes={[episode]}
          interactive={false}
          legend={false}
          hideStops={false}
        />
      )}
      <AnomalyTable
        maxHeight={400}
        rows={evidenceRows}
        columns={[
          { id: "role", label: "Role" },
          { id: "ind", label: "Indicator", mono: true },
          {
            id: "threshold",
            label: "Condition",
            mono: true,
            render: thresholdText,
          },
          {
            id: "value",
            label: episode.declaredAt ? "At declaration" : "Peak in episode",
            mono: true,
            render: (row) => fmt(row.value, 3),
          },
          {
            id: "met",
            label: "Met",
            render: (row) => (row.met ? "Yes" : "No"),
          },
          {
            id: "trust",
            label: "Trust",
            mono: true,
            render: (row) => fmt(row.trust, 2),
          },
        ]}
      />
      <Typography component="h4" sx={{ fontSize: 13, fontWeight: 600, mt: 2 }}>
        Raw tags · 1-minute exported window
      </Typography>
      <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ my: 1 }}>
        {tagIds.map((tag) => (
          <FormControlLabel
            key={tag}
            sx={{ m: 0 }}
            control={
              <Checkbox
                size="small"
                checked={!settings.off.includes(tag)}
                onChange={(_, checked) =>
                  update({
                    off: checked
                      ? settings.off.filter((id) => id !== tag)
                      : [...settings.off, tag],
                  })
                }
              />
            }
            label={
              <Typography variant="caption" title={tag}>
                {tag.slice(0, 35)}
                {tag.length > 35 ? "…" : ""}
                {evidenceTags.has(tag) ? " ★" : ""}
              </Typography>
            }
          />
        ))}
      </Stack>
      {on.length ? (
        <AnomalyChart
          title="Episode raw and cleaned PLC values"
          series={rawSeries}
          yAxis={rawAxes}
          height={
            settings.layout === "stack" ? Math.max(300, on.length * 110) : 380
          }
          range={[from, to]}
          episodes={[episode]}
          interactive={false}
          legend={settings.layout !== "stack"}
          hideStops={false}
        />
      ) : (
        <Alert severity="info">Select tags to inspect raw evidence.</Alert>
      )}
      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          ★ = used by evidence · solid = cleaned value · dotted = raw mean ·
          band = min–max · red squares = excluded · diamonds = spikes removed.
        </Typography>
      </Box>
    </AnomalyPanel>
  );
}
