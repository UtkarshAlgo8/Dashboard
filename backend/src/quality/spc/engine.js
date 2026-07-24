/**
 * SPC compute engine (Backend FRD §2, §10–§12).
 *
 * The gold layer stores capability indices, statuses and the plot payload;
 * this module adds ONLY the two backend-computed annotation layers the FRD
 * defines — the Nelson rule evaluation (§11) and the alerts derived from it
 * (§12). Nothing statistical is recomputed: limits, bins, curve, mean and σ
 * are read from `plot_data` (§5).
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
 * Headline (combo-level) status rule (§2.1): ignore Insufficient Data rows;
 * Critical if any remaining is Critical, else Warning if any, else Healthy;
 * Insufficient Data only when ALL four are.
 * @param {string[]} statuses the 4 metric statuses
 */
export function headlineStatus(statuses) {
  const active = statuses.filter((s) => s !== "Insufficient Data");
  if (active.length === 0) return "Insufficient Data";
  if (active.includes("Critical")) return "Critical";
  if (active.includes("Warning")) return "Warning";
  return "Healthy";
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
        metrics: {},
        plotRow: null,
      };
      combos.set(key, combo);
    }
    combo.metrics[metric] = {
      value: r.actual_value ?? null,
      status: r.status ?? null,
    };
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
