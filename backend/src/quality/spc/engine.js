/**
 * SPC compute engine.
 *
 * Division of labour (Gold_to_Silver_Mapping):
 *
 *   GOLD   capability indices (Cp/Cpk/Pp/Ppk), their statuses, and the X-chart
 *          control limits. Read verbatim, NEVER recomputed — they were derived
 *          on cleaned, cluster-sampled data and will not reproduce from the
 *          chart points.
 *   SILVER the individual measurements.
 *   HERE   the transformations the mapping defines on those measurements —
 *          subgrouping (Step 5), the distribution (Step 6) — plus the two
 *          annotation layers the FRD defines: Nelson rules (§11) and the
 *          alerts derived from them (§12).
 *
 * The one rule that governs the whole module: control limits come from the
 * baseline, not from the points they judge. Limits that move with the data
 * make every window look in control.
 */

const METRICS = new Set(["Cp", "Cpk", "Pp", "Ppk"]);

/**
 * kpi_name parse (§2.1): the last whitespace token is the metric
 * {Cp,Cpk,Pp,Ppk}; the remainder is the parameter. Spacing is inconsistent
 * ("Belt 1 Length" vs "PLY1 Length"), so the last-token rule is the only
 * safe parse.
 * @returns {{ parameter: string, metric: string|null }}
 */
export function parseKpiName(kpiName) {
  const s = String(kpiName).trim();
  const i = s.lastIndexOf(" ");
  if (i === -1) return { parameter: s, metric: null };
  const metric = s.slice(i + 1);
  if (!METRICS.has(metric)) return { parameter: s, metric: null };
  return { parameter: s.slice(0, i).trim(), metric };
}

/** Combo identity (§2.1): one widget/chart = machine × recipe × parameter. */
export function comboKey(machine, itemcode, parameter) {
  return `${machine}|||${itemcode}|||${parameter}`;
}

/**
 * Status severity, worst first. The live gold layer emits four graded
 * statuses, not three: measured against capability value the bands are
 * Critical < 1.00, Major 1.00–1.33, Warning ~1.33–1.67, Healthy ≥ 1.5.
 * `Major` is the most common non-Critical status in the export — treating
 * an unknown status as Healthy (the old fallback) reported thousands of
 * marginal processes as capable.
 */
export const STATUS_SEVERITY = ["Critical", "Major", "Warning", "Healthy"];
const INSUFFICIENT = "Insufficient Data";

/**
 * Headline (combo-level) status rule (§2.1): ignore Insufficient Data rows;
 * take the worst of what remains; Insufficient Data only when ALL four are.
 * @param {string[]} statuses the 4 metric statuses
 */
export function headlineStatus(statuses) {
  const active = statuses.filter((s) => s && s !== INSUFFICIENT);
  if (active.length === 0) return INSUFFICIENT;
  for (const s of STATUS_SEVERITY) if (active.includes(s)) return s;
  // Unknown token from upstream: surface it rather than silently upgrading
  // it to Healthy.
  return active[0];
}

/** Parse a stored plot_data cell (JSON string or already-parsed object). */
export function parsePlotData(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * Group a snapshot's SPC rows into combos. Each combo holds its 4 metric
 * rows and parses plot_data ONCE (from the Cp row — the 4 rows carry
 * byte-identical payloads, §2.1/§10).
 *
 * @param {Array} rows rows with {machine,itemcode,kpi_name,status,actual_value,plot_data}
 * @returns {Map<string, object>}
 */
export function groupCombos(rows) {
  const combos = new Map();
  for (const r of rows) {
    const { parameter, metric } = parseKpiName(r.kpi_name);
    if (!metric) continue;
    const key = comboKey(r.machine, r.itemcode, parameter);
    let combo = combos.get(key);
    if (!combo) {
      combo = {
        machine: r.machine,
        recipe: r.itemcode, // recipe always means the itemcode column (§2.1)
        parameter,
        product_type: r.product_type ?? null,
        metrics: {},
        plotRow: null,
      };
      combos.set(key, combo);
    }
    combo.metrics[metric] = {
      value: toNumber(r.actual_value),
      status: r.status ?? null,
    };
    if (r.product_type) combo.product_type = r.product_type;
    if (metric === "Cp") combo.plotRow = r;
    else if (!combo.plotRow) combo.plotRow = r; // fallback if Cp absent
  }
  for (const combo of combos.values()) {
    combo.headline_status = headlineStatus(
      ["Cp", "Cpk", "Pp", "Ppk"].map((m) => combo.metrics[m]?.status ?? "Insufficient Data"),
    );
  }
  return combos;
}

/** Sum of histogram counts = sample size (§4/§2.1). 0 for insufficient. */
export function sampleSize(plot) {
  const counts = plot?.histogram?.counts;
  if (!Array.isArray(counts)) return 0;
  return counts.reduce((a, b) => a + (Number(b) || 0), 0);
}

/* ----------------------------------------------------------------- *
 * Nelson rules (§11) — fixed 8, backend-evaluated                    *
 * ----------------------------------------------------------------- */

const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Evaluate all 8 Nelson rules on a series against its own centre/limit.
 * `values`, `cl`, `ucl` come straight from the chart payload; sigma is the
 * derived helper (ucl-cl)/3. Returns per-rule hit + flagged 1-based point
 * indexes, and a per-point rules map.
 *
 * @param {number[]} values
 * @param {number} cl
 * @param {number} ucl
 * @returns {{ sigma:number, z:number[], rules:Array<{rule:number,hit:boolean,point_indexes:number[]}>, pointRules:Map<number,number[]> }}
 */
export function evaluateNelson(values, cl, ucl) {
  const n = values.length;
  const sigma = (ucl - cl) / 3;
  const z = values.map((v) => (sigma === 0 ? 0 : (v - cl) / sigma));
  const flagged = {}; // rule → Set of 0-based idx
  for (let r = 1; r <= 8; r++) flagged[r] = new Set();

  // Rule 1: one point beyond ±3σ.
  for (let i = 0; i < n; i++) if (Math.abs(z[i]) > 3) flagged[1].add(i);

  // Rule 2: 9 in a row same side of CL.
  markRuns(z, 9, (a, b) => sign(z[a]) !== 0 && sign(z[a]) === sign(z[b]), flagged[2]);

  // Rule 3: 6 in a row steadily rising or falling (strict monotonic).
  markRuns(values, 6, (a, b) => values[b] > values[a], flagged[3]);
  markRuns(values, 6, (a, b) => values[b] < values[a], flagged[3]);

  // Rule 4: 14 in a row alternating up/down.
  markAlternating(values, 14, flagged[4]);

  // Rule 5: 2 of 3 beyond ±2σ, same side — flag the qualifying points.
  markKofM(z, 3, 2, 2, flagged[5]);

  // Rule 6: 4 of 5 beyond ±1σ, same side — flag the qualifying points.
  markKofM(z, 5, 4, 1, flagged[6]);

  // Rule 7: 15 in a row within ±1σ.
  markRuns(z, 15, (_a, b) => Math.abs(z[b]) < 1, flagged[7], (i) => Math.abs(z[i]) < 1);

  // Rule 8: 8 in a row beyond ±1σ (either side).
  markRuns(z, 8, (_a, b) => Math.abs(z[b]) > 1, flagged[8], (i) => Math.abs(z[i]) > 1);

  const rules = [];
  const pointRules = new Map();
  for (let r = 1; r <= 8; r++) {
    const idxs = [...flagged[r]].sort((a, b) => a - b);
    rules.push({
      rule: r,
      hit: idxs.length > 0,
      point_indexes: idxs.map((i) => i + 1), // 1-based (§6)
    });
    for (const i of idxs) {
      const oneBased = i + 1;
      if (!pointRules.has(oneBased)) pointRules.set(oneBased, []);
      pointRules.get(oneBased).push(r);
    }
  }
  for (const arr of pointRules.values()) arr.sort((a, b) => a - b);
  return { sigma, z, rules, pointRules };
}

/**
 * Mark maximal runs where consecutive pairs satisfy `ok(prev,cur)` and the
 * run length ≥ minLen. `pointOk` (optional) gates which individual points
 * count toward and belong in the run (for "within/beyond σ" rules).
 */
function markRuns(arr, minLen, ok, set, pointOk = null) {
  const n = arr.length;
  let start = 0;
  for (let i = 1; i <= n; i++) {
    const cont =
      i < n &&
      (pointOk ? pointOk(i) && pointOk(i - 1) : true) &&
      ok(i - 1, i) &&
      (!pointOk || pointOk(i - 1));
    if (i < n && cont) continue;
    const len = i - start;
    if (len >= minLen) for (let k = start; k < i; k++) set.add(k);
    start = i;
  }
}

/** Mark runs of alternating direction (up/down) of length ≥ minLen. */
function markAlternating(values, minLen, set) {
  const n = values.length;
  let start = 0;
  for (let i = 2; i <= n; i++) {
    const alt =
      i < n && (values[i] - values[i - 1]) * (values[i - 1] - values[i - 2]) < 0;
    if (i < n && alt) continue;
    const len = i - start;
    if (len >= minLen) for (let k = start; k < i; k++) set.add(k);
    start = i - 1;
  }
}

/**
 * "K of M consecutive beyond ±Tσ, same side" (rules 5 & 6). Flags only the
 * qualifying points (those beyond the threshold) inside any window that
 * meets the count, per §11.
 */
function markKofM(z, m, k, t, set) {
  for (let i = 0; i + m <= z.length; i++) {
    for (const s of [1, -1]) {
      const beyond = [];
      for (let j = i; j < i + m; j++) {
        if (s > 0 ? z[j] > t : z[j] < -t) beyond.push(j);
      }
      if (beyond.length >= k) for (const j of beyond) set.add(j);
    }
  }
}

/* ----------------------------------------------------------------- *
 * Alerts (§12)                                                       *
 * ----------------------------------------------------------------- */

const SEVERITY = {
  1: "Out of Control",
  2: "Run/Trend",
  3: "Run/Trend",
  4: "Run/Trend",
  5: "Warning",
  6: "Warning",
  7: "Run/Trend",
  8: "Warning",
};

/** Slug for alert ids: strip non-alphanumerics, uppercase (§12). */
export function alertSlug(s) {
  return String(s).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Group a sorted list of 1-based indexes into contiguous [first,last] runs. */
function contiguousRuns(indexes) {
  const runs = [];
  let start = null;
  let prev = null;
  for (const i of indexes) {
    if (start === null) {
      start = i;
      prev = i;
    } else if (i === prev + 1) {
      prev = i;
    } else {
      runs.push([start, prev]);
      start = i;
      prev = i;
    }
  }
  if (start !== null) runs.push([start, prev]);
  return runs;
}

/**
 * Derive alerts from a chart's Nelson results (§12): ONE alert per (chart,
 * rule, contiguous flagged range). Deterministic ids make the click-linkage
 * stateless.
 *
 * @param {Array} nelsonRules result of evaluateNelson(...).rules
 * @param {{ machine:string, parameter:string, chart:"X"|"R", snapshot:string, times:Array }} ctx
 */
export function deriveAlerts(nelsonRules, ctx) {
  const mSlug = alertSlug(ctx.machine);
  const pSlug = alertSlug(ctx.parameter);
  const snap = String(ctx.snapshot).replace(/-/g, "");
  const alerts = [];
  for (const { rule, point_indexes } of nelsonRules) {
    if (point_indexes.length === 0) continue;
    for (const [first, last] of contiguousRuns(point_indexes)) {
      alerts.push({
        alert_id: `AL-${mSlug}-${pSlug}-R${rule}-${ctx.chart}-${first}-${last}-${snap}`,
        machine: ctx.machine,
        recipe: ctx.recipe,
        parameter: ctx.parameter,
        chart: ctx.chart,
        rule,
        severity: SEVERITY[rule],
        points: { first, last },
        time: {
          first: ctx.times?.[first - 1] ?? null,
          last: ctx.times?.[last - 1] ?? null,
        },
      });
    }
  }
  return alerts;
}


/* ----------------------------------------------------------------- *
 * Silver → chart transformations (Mapping sheet, Steps 5–6)          *
 * ----------------------------------------------------------------- */

/** Coerce an upstream cell to a finite number, or null. Athena hands back
 *  numerics as strings and empty cells as "". */
export function toNumber(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Athena renders a timestamp as "2026-09-01 04:22:14.000 UTC". Trim it to
 * "2026-09-01 04:22:14" — the sub-second part is always .000 in this feed and
 * the suffix repeated on every point is pure payload.
 */
export function normalizeTime(t) {
  if (t == null) return null;
  const s = String(t).trim();
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(s);
  return m ? `${m[1]} ${m[2]}` : s;
}

/** Default X-bar subgroup size (Mapping sheet, Step 5). */
export const SUBGROUP_SIZE = 5;

/**
 * Shewhart constants for the R chart. The X chart's limits come from the
 * gold baseline; gold carries no R limits, and an R chart's limits are
 * *defined* as D3·R̄ / D4·R̄ — so these are a definition, not a fit to the
 * data, and the response labels them as derived.
 */
const D3 = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0.076, 8: 0.136, 9: 0.184, 10: 0.223 };
const D4 = { 2: 3.267, 3: 2.574, 4: 2.282, 5: 2.114, 6: 2.004, 7: 1.924, 8: 1.864, 9: 1.816, 10: 1.777 };

/**
 * Step 5 — group consecutive readings into subgroups of `size`.
 *
 * Each subgroup is plotted at its LAST reading's timestamp. Any trailing
 * partial subgroup is discarded, so every plotted mean averages the same
 * number of readings.
 *
 * @param {Array<{event_time:*, value:number}>} points  time-ordered
 * @param {number} size
 * @returns {{ means:number[], ranges:number[], times:Array, size:number, used:number }}
 */
export function subgroups(points, size = SUBGROUP_SIZE) {
  const means = [];
  const ranges = [];
  const times = [];
  const whole = Math.floor(points.length / size);
  for (let g = 0; g < whole; g += 1) {
    const slice = points.slice(g * size, g * size + size);
    const vals = slice.map((p) => p.value);
    const sum = vals.reduce((a, b) => a + b, 0);
    means.push(sum / size);
    ranges.push(Math.max(...vals) - Math.min(...vals));
    times.push(normalizeTime(slice[slice.length - 1].event_time));
  }
  return { means, ranges, times, size, used: whole * size };
}

/** R-chart limits from R̄ — the textbook definition, flagged as derived. */
export function rChartLimits(ranges, size = SUBGROUP_SIZE) {
  if (ranges.length === 0) return { cl: null, ucl: null, lcl: null };
  const rbar = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const d3 = D3[size] ?? 0;
  const d4 = D4[size] ?? 2.114;
  return { cl: rbar, ucl: d4 * rbar, lcl: d3 * rbar };
}

/**
 * Step 6 target — the most frequent POSITIVE setpoint in the window.
 *
 * Zero and negative setpoints are the "no recipe loaded" marker in silver
 * and would otherwise win the mode on an idle machine.
 */
export function modeSetpoint(setpoints) {
  const tally = new Map();
  for (const raw of setpoints) {
    const v = toNumber(raw);
    if (v == null || v <= 0) continue;
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [v, c] of tally) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function sampleStd(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const ss = values.reduce((a, v) => a + (v - m) * (v - m), 0);
  return Math.sqrt(ss / (values.length - 1));
}

function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Linear-interpolation percentile over already-sorted values (p in [0,1]).
 * Used for the IQR that drives the Freedman-Diaconis bin width below.
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

const round = (v, dp = 4) =>
  v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Step 6 — the capability histogram, built from the INDIVIDUAL readings
 * (not the subgroup means).
 *
 *   bins  = width from the Freedman-Diaconis rule (2 × IQR × N^(-1/3)),
 *           bin_count = ceil((max-min) / width), clamped to [8, 60].
 *           IQR-based, so a handful of outliers stretching [min,max] no
 *           longer starves the bins where the bulk of the data sits (the
 *           failure mode of Sturges, which only looks at N). Falls back to
 *           the Sturges bin count when IQR is 0 (tight/identical readings).
 *   curve = the fitted normal PDF across [min,max], scaled by N × bin_width
 *           so it is directly comparable with the bar heights
 *
 * `usl`/`lsl` are passed in — they come from the parameter's tolerance, and
 * are null when the plant has not given us one. A bin counts as out of spec
 * only when it lies WHOLLY outside the window.
 *
 * @param {number[]} values
 * @param {{target?:number|null, usl?:number|null, lsl?:number|null, points?:number}} spec
 */
export function buildDistribution(values, { target = null, usl = null, lsl = null, points = 100 } = {}) {
  const n = values.length;
  if (n === 0) {
    return {
      sample_size: 0,
      bins: [],
      bin_width: null,
      curve: { x: [], y: [] },
      mean: null,
      median: null,
      std: null,
      target,
      usl,
      lsl,
      sigma_minus_3: null,
      sigma_plus_3: null,
      out_of_spec: { count: 0, bin_indexes: [], observations_available: false },
    };
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A window of zero width (every reading identical) still needs one bin.
  const span = hi - lo || Math.abs(hi) * 1e-6 || 1;
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = percentile(sorted, 0.75) - percentile(sorted, 0.25);
  const sturgesCount = Math.ceil(Math.log2(n) + 1);
  const fdCount = iqr > 0 ? Math.ceil(span / (2 * iqr * Math.pow(n, -1 / 3))) : sturgesCount;
  const binCount = Math.min(60, Math.max(8, fdCount));
  const width = span / binCount;
  const counts = new Array(binCount).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - lo) / width);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    counts[idx] += 1;
  }
  const mu = mean(values);
  const sd = sampleStd(values);

  const bins = counts.map((count, i) => {
    const from = lo + i * width;
    const to = from + width;
    const outOfSpec =
      (usl != null && from >= usl) || (lsl != null && to <= lsl);
    return {
      center: round((from + to) / 2),
      from: round(from),
      to: round(to),
      count,
      out_of_spec: outOfSpec,
    };
  });

  // Fitted normal, scaled to counts so it overlays the bars honestly.
  const curveX = [];
  const curveY = [];
  if (sd > 0) {
    const step = span / (points - 1);
    const k = (n * width) / (sd * Math.sqrt(2 * Math.PI));
    for (let i = 0; i < points; i += 1) {
      const x = lo + i * step;
      const zz = (x - mu) / sd;
      curveX.push(round(x));
      curveY.push(round(k * Math.exp(-0.5 * zz * zz)));
    }
  }

  const oosIndexes = bins.map((b, i) => (b.out_of_spec ? i : -1)).filter((i) => i >= 0);
  // Count readings outside spec directly — a bin straddling the limit
  // contributes only the readings that actually breached it.
  let oosCount = 0;
  for (const v of values) {
    if ((usl != null && v > usl) || (lsl != null && v < lsl)) oosCount += 1;
  }

  return {
    sample_size: n,
    bins,
    bin_width: round(width),
    curve: { x: curveX, y: curveY },
    mean: round(mu),
    median: round(median(values)),
    std: round(sd),
    target: round(target),
    usl: round(usl),
    lsl: round(lsl),
    sigma_minus_3: round(mu - 3 * sd),
    sigma_plus_3: round(mu + 3 * sd),
    out_of_spec: {
      count: oosCount,
      bin_indexes: oosIndexes,
      observations_available: false,
    },
  };
}

/**
 * Control-limit validation (Mapping sheet, Step 3).
 *
 * 29 of the 119 baseline pairs in the current export have UCL ≤ LCL. Drawing
 * those would put the centre line in the wrong place and invert every Nelson
 * z-score, so an invalid pair yields no lines and an explicit reason the UI
 * can show. We do not "fix" it by swapping: which of the two is wrong is not
 * knowable from here.
 *
 * @returns {{valid:boolean, ucl:number|null, cl:number|null, lcl:number|null, reason:string|null}}
 */
export function validateLimits(ucl, lcl) {
  const u = toNumber(ucl);
  const l = toNumber(lcl);
  if (u == null || l == null) {
    return { valid: false, ucl: null, cl: null, lcl: null, reason: "no baseline limits published for this machine and parameter" };
  }
  if (!(u > l)) {
    return {
      valid: false,
      ucl: null,
      cl: null,
      lcl: null,
      reason: `baseline UCL (${round(u, 3)}) is not above LCL (${round(l, 3)}) — limit pair rejected`,
    };
  }
  return { valid: true, ucl: u, cl: (u + l) / 2, lcl: l, reason: null };
}

/**
 * Pick the baseline that governs a chart date: the newest on or before it.
 *
 * The export currently holds a single baseline stamp that post-dates most
 * chart dates, so falling back to the earliest available one is the
 * difference between charts with limits and charts without. The fallback is
 * reported (`on_or_before: false`) rather than hidden.
 *
 * @param {Array<{baseline_date:*, kpi_name:string, actual_value:*}>} rows
 * @param {string} isoDate
 */
export function pickBaseline(rows, isoDate) {
  const dated = rows
    .map((r) => ({ ...r, day: String(r.baseline_date ?? "").slice(0, 10) }))
    .filter((r) => r.day);
  if (dated.length === 0) return { rows: [], baseline_date: null, on_or_before: false };
  const onOrBefore = dated.filter((r) => r.day <= isoDate);
  const pool = onOrBefore.length ? onOrBefore : dated;
  const chosen = onOrBefore.length
    ? pool.reduce((a, b) => (b.day > a.day ? b : a)).day
    : pool.reduce((a, b) => (b.day < a.day ? b : a)).day;
  return {
    rows: pool.filter((r) => r.day === chosen),
    baseline_date: chosen,
    on_or_before: onOrBefore.length > 0,
  };
}
