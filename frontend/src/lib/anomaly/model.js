import { MINUTE } from "./constants.js";

const IST_OFFSET = 330 * MINUTE;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const fmt = (value, digits = 0) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : Number(value).toFixed(digits);
export const decode = (value) =>
  Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",").map((v) => (v === "" ? null : Number(v)))
      : [];

/** Export labels explicitly say IST. Do not parse them in the browser's timezone. */
export function parseTime(value) {
  if (typeof value === "number") return value;
  if (!value) return NaN;
  const text = value.replace(" ", "T");
  const local = text.length === 16 ? `${text}:00` : text;
  return Date.parse(
    /[zZ]$|[+-]\d\d:\d\d$/.test(text) ? text : `${local}+05:30`,
  );
}
export function formatTime(value, short = false) {
  if (!Number.isFinite(value)) return "—";
  const text = new Date(value + IST_OFFSET)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  return short ? text.slice(5) : text;
}
export const healthBand = (value) =>
  value == null
    ? "Unknown"
    : value >= 90
      ? "Normal"
      : value >= 75
        ? "Advisory"
        : value >= 50
          ? "Degraded"
          : "Critical";
export const overlaps = (episode, from, to) =>
  episode.start <= to && episode.end >= from;
const decodeFields = (object) =>
  Object.fromEntries(
    Object.entries(object).map(([key, value]) => [key, decode(value)]),
  );

/** Decode the export once; components never depend on its compressed CSV strings. */
export function normalizeDemo(raw) {
  if (!raw?.ses || !raw.tags || !raw.overall || !raw.ts10)
    throw new Error("The demo export is missing required workspace data.");
  const start = parseTime(raw.t0);
  const step = 5 * MINUTE;
  let last = raw.n - 1;
  while (last > 0 && raw.state[last] === "-") last--;
  const equipment = Object.fromEntries(
    Object.entries(raw.ses).map(([id, se]) => [
      id,
      {
        ...se,
        id,
        health: decode(se.fm),
        isolation: decode(se.if),
        coverage: decode(se.cov),
        unknown: decode(se.unk),
        dominant: se.dom.flatMap(([value, count]) => Array(count).fill(value)),
      },
    ]),
  );
  const episodes = (raw.episodes ?? []).map((ep) => ({
    ...ep,
    start: parseTime(ep.onset),
    end: parseTime(ep.end) + MINUTE,
    declaredAt: parseTime(ep.declared),
  }));
  const baselineEpisodes = (raw.v1 ?? []).map((ep) => ({
    ...ep,
    start: parseTime(ep.onset),
    end: parseTime(ep.end) + MINUTE,
  }));
  const transients = (raw.transients ?? []).map(
    ([fm, onset, duration, confidence, needs], index) => ({
      k: `transient-${index}`,
      fm,
      se: raw.fms[fm]?.se,
      start: parseTime(onset),
      end: parseTime(onset) + duration * MINUTE,
      min: duration,
      conf: confidence,
      needs,
      onset,
      transient: true,
    }),
  );
  return {
    source: {
      type: "demo",
      label: "Demo data · PLC export",
      asset: "CTP 5X QUINTOPLEX · JK TYRE",
      timezone: "Asia/Kolkata",
      stale: false,
      asOf: start + last * step,
    },
    start,
    end: start + last * step,
    step,
    tagStart: parseTime(raw.t10),
    tagStep: 10 * MINUTE,
    state: raw.state,
    equipment,
    equipmentIds: Object.keys(equipment).sort(),
    modes: raw.fms,
    tags: raw.tags,
    tagIds: Object.keys(raw.tags),
    series: {},
    // Lazy decoding avoids allocating all tag-series arrays before the first screen.
    getTagSeries(tag) {
      if (!this.series[tag])
        this.series[tag] = decodeFields(raw.ts10[tag] ?? {});
      return this.series[tag];
    },
    overall: {
      health: decode(raw.overall.fm),
      isolation: decode(raw.overall.if),
      unknownCount: decode(raw.overall.nunk),
    },
    episodes,
    baselineEpisodes,
    transients,
    edges: raw.edges ?? [],
    hierarchy: raw.hier ?? [],
    windows: raw.windows ?? [],
    summary: raw.summary,
    rules: raw.rules,
    penalties: raw.pen,
    sensorConfig: raw.sh,
    unrecognised: raw.unrec ?? [],
    undetectable: raw.not_detectable ?? [],
    trainingEnd: raw.train_end,
    plantRows: raw.plant_rows,
  };
}
export const indexAt = (model, time) =>
  clamp(
    Math.floor((time - model.start) / model.step),
    0,
    model.state.length - 1,
  );
export const producingAt = (model, time) =>
  model.state[indexAt(model, time)] === "P";
export const valueAt = (model, values, time) =>
  values?.[indexAt(model, time)] ?? null;
export function equipmentAt(model, id, time) {
  const se = model.equipment[id];
  if (!se) return { value: null, band: "Unknown", coverage: null };
  const unavailable =
    se.blind || valueAt(model, se.unknown, time) || !producingAt(model, time);
  const value = unavailable ? null : valueAt(model, se.health, time);
  return {
    value,
    band: healthBand(value),
    coverage: valueAt(model, se.coverage, time),
    dominant: se.dominant?.[indexAt(model, time)],
  };
}
export function tagAt(model, tag, time) {
  const s = model.getTagSeries(tag);
  const i = Math.max(0, Math.floor((time - model.tagStart) / model.tagStep));
  const health = s.h?.[i] ?? null;
  return {
    health,
    status:
      health == null
        ? "NO DATA"
        : health >= 80
          ? "GOOD"
          : health >= 50
            ? "SUSPECT"
            : "BAD",
    action: ["USE", "DOWNWEIGHT", "EXCLUDE"][s.x?.[i]] ?? "NO DATA",
    rule: model.rules[s.d?.[i]] ?? "",
    index: i,
  };
}
export function tagStats(model, tag, from, to) {
  const s = model.getTagSeries(tag);
  const i0 = Math.max(0, Math.floor((from - model.tagStart) / model.tagStep));
  const i1 = Math.min(
    s.h?.length ?? 0,
    Math.floor((to - model.tagStart) / model.tagStep) + 1,
  );
  let sum = 0,
    count = 0,
    excluded = 0;
  const hits = {};
  for (let i = i0; i < i1; i++) {
    if (s.h[i] == null) continue;
    sum += s.h[i];
    count++;
    if (s.x[i] === 2) excluded++;
    const rule = model.rules[s.d[i]];
    if (rule && s.h[i] < 100) hits[rule] = (hits[rule] ?? 0) + 1;
  }
  return {
    mean: count ? sum / count : null,
    excluded: count ? (100 * excluded) / count : null,
    hits,
    dominant: Object.keys(hits).sort((a, b) => hits[b] - hits[a])[0] ?? "",
  };
}
export function diagnosisAt(model, time) {
  const current = model.episodes.filter(
    (e) => e.start <= time && e.end + 5 * MINUTE >= time,
  );
  if (current.length) return { episodes: current, recent: false };
  const previous = model.episodes.filter(
    (e) => e.end <= time && time - e.end < 360 * MINUTE,
  );
  const latest = previous.at(-1);
  return {
    episodes: latest
      ? previous.filter((e) => Math.abs(e.start - latest.start) < 30 * MINUTE)
      : [],
    recent: true,
  };
}

/** Chart presentation only: never derive sensor/detection scores in the UI. */
export function points(
  model,
  values,
  from,
  to,
  { tag = false, hideStops = false } = {},
) {
  const start = tag ? model.tagStart : model.start;
  const step = tag ? model.tagStep : model.step;
  const i0 = Math.max(0, Math.floor((from - start) / step));
  const i1 = Math.min(values?.length - 1, Math.ceil((to - start) / step));
  const result = [];
  for (let i = i0; i <= i1; i++) {
    const time = start + i * step;
    if (hideStops && !producingAt(model, time)) continue;
    result.push([time, values[i] ?? null]);
  }
  return result;
}
export function decodedWindow(window) {
  if (!window) return null;
  return {
    ...window,
    start: parseTime(window.t0),
    coverage: decode(window.coverage),
    tags: Object.fromEntries(
      Object.entries(window.tags).map(([key, value]) => [
        key,
        decodeFields(value),
      ]),
    ),
    indicators: Object.fromEntries(
      Object.entries(window.ind).map(([key, value]) => [
        key,
        decodeFields(value),
      ]),
    ),
    modes: Object.fromEntries(
      Object.entries(window.fm).map(([key, value]) => [
        key,
        decodeFields(value),
      ]),
    ),
  };
}
export function thresholdText(evidence) {
  const value = evidence.thr_u;
  if (value == null) return "Not configured";
  return Array.isArray(value)
    ? `outside ${fmt(value[0], 3)} … ${fmt(value[1], 3)}`
    : `${evidence.op === "abs>" ? "|x| >" : evidence.op} ${fmt(value, 3)}`;
}
export function conditionMet(evidence, value) {
  if (value == null || evidence.thr_u == null) return false;
  const threshold = evidence.thr_u;
  if (Array.isArray(threshold))
    return value < threshold[0] || value > threshold[1];
  return evidence.op === "abs>"
    ? Math.abs(value) > threshold
    : evidence.op === ">"
      ? value > threshold
      : value < threshold;
}
