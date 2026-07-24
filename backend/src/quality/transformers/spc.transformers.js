/**
 * Row → response transformers for the Quality SPC module (Backend FRD §2–§13).
 *
 * Assembly steps (§5): group the snapshot into combos, resolve headline
 * statuses, and — only for non-Insufficient combos — parse plot_data once,
 * run the Nelson engine on the X and R series, derive alerts, and package the
 * self-contained per-visualization datasets. Nothing statistical is
 * recomputed; capability, limits, bins and curve are read as stored.
 */
import {
  groupCombos,
  parsePlotData,
  sampleSize,
  evaluateNelson,
  deriveAlerts,
} from "../spc/engine.js";

const METRIC_ORDER = ["Cp", "Cpk", "Pp", "Ppk"];

/**
 * spc-summary (§2.2): count combos by headline status. Reconciles to the
 * combo total (out_of_specification + not_capable + capable + insufficient).
 */
export function toSpcSummary(rows) {
  const combos = groupCombos(rows);
  let critical = 0;
  let warning = 0;
  let healthy = 0;
  let insufficient = 0;
  for (const c of combos.values()) {
    if (c.headline_status === "Critical") critical++;
    else if (c.headline_status === "Warning") warning++;
    else if (c.headline_status === "Healthy") healthy++;
    else insufficient++;
  }
  return {
    total_parameters: combos.size,
    out_of_specification: critical, // headline Critical
    not_capable: warning, // headline Warning
    capable: healthy, // headline Healthy
    insufficient_data: insufficient, // all four Insufficient
  };
}

/** spc-filter-options (§3): distinct value lists, sentinels already excluded. */
export function toSpcFilterOptions({ machines, recipes, productTypes }) {
  return {
    machines: machines.map((r) => r.machine),
    recipes: recipes.map((r) => r.itemcode),
    product_types: productTypes.map((r) => r.product_type),
  };
}

/** Ordering: headline severity worst-first, then ascending Cpk (§3). */
const HEADLINE_RANK = {
  Critical: 0,
  Warning: 1,
  Healthy: 2,
  "Insufficient Data": 3,
};

/**
 * spc-widgets (§3/§4): one widget object per combo. Insufficient combos get
 * `insufficient:{sample_size}` instead of a chart; the control chart IS the
 * small X chart (§4). Sorted worst-first.
 */
export function toSpcWidgets(rows) {
  const combos = [...groupCombos(rows).values()];
  const widgets = combos.map((c) => {
    const cp = c.metrics.Cp?.value ?? null;
    const cpk = c.metrics.Cpk?.value ?? null;
    const base = {
      parameter: c.parameter,
      machine: c.machine,
      recipe: c.recipe,
      headline_status: c.headline_status,
      cp,
      cpk,
    };
    if (c.headline_status === "Insufficient Data") {
      const plot = parsePlotData(c.plotRow?.plot_data);
      return { ...base, insufficient: { sample_size: sampleSize(plot) } };
    }
    const plot = parsePlotData(c.plotRow?.plot_data);
    const x = plot?.x_chart ?? {};
    return {
      ...base,
      control_chart: {
        ucl: x.ucl ?? null,
        cl: x.cl ?? null,
        lcl: x.lcl ?? null,
        values: Array.isArray(x.values) ? x.values : [],
        time: Array.isArray(x.time) ? x.time : [],
      },
    };
  });
  widgets.sort((a, b) => {
    const r = HEADLINE_RANK[a.headline_status] - HEADLINE_RANK[b.headline_status];
    if (r !== 0) return r;
    return (a.cpk ?? Infinity) - (b.cpk ?? Infinity); // ascending Cpk
  });
  return { count: widgets.length, widgets };
}

/** Build the capability block (§9): value+status per metric, read as stored. */
function buildCapability(combo, sample) {
  const capability = {};
  for (const m of METRIC_ORDER) {
    const cell = combo.metrics[m] ?? { value: null, status: "Insufficient Data" };
    capability[m.toLowerCase()] = { value: cell.value ?? null, status: cell.status ?? null };
  }
  capability.headline_status = combo.headline_status;
  capability.sample_size = sample;
  return capability;
}

/**
 * Build one control-chart dataset (§6/§7/§13.1/§13.2) from a chart payload:
 * per-point metadata (index, time, value, z, rules, alert_ids), limits +
 * derived sigma, the 8-rule nelson summary, and the chart's alerts.
 */
function buildChartDataset(chart, { chartTag, machine, recipe, parameter, snapshot }) {
  const values = Array.isArray(chart?.values) ? chart.values : [];
  const times = Array.isArray(chart?.time) ? chart.time : [];
  const cl = chart?.cl ?? 0;
  const ucl = chart?.ucl ?? 0;
  const lcl = chart?.lcl ?? 0;
  const { sigma, z, rules, pointRules } = evaluateNelson(values, cl, ucl);
  const alerts = deriveAlerts(rules, {
    machine,
    recipe,
    parameter,
    chart: chartTag,
    snapshot,
    times,
  });
  // Reverse index: which alert ids cover each 1-based point.
  const alertsByPoint = new Map();
  for (const a of alerts) {
    for (let p = a.points.first; p <= a.points.last; p++) {
      if (!alertsByPoint.has(p)) alertsByPoint.set(p, []);
      alertsByPoint.get(p).push(a.alert_id);
    }
  }
  const points = values.map((v, i) => {
    const idx = i + 1;
    return {
      index: idx,
      time: times[i] ?? null,
      value: v,
      z: Math.round(z[i] * 100) / 100,
      rules: pointRules.get(idx) ?? [],
      alert_ids: alertsByPoint.get(idx) ?? [],
    };
  });
  return {
    unit: null, // reserved (§2.1): engineering unit absent from the gold layer
    points,
    cl,
    ucl,
    lcl,
    sigma,
    nelson: rules,
    alerts,
  };
}

/** Build the capability histogram dataset (§8/§13.3). */
function buildHistogram(plot, capability) {
  const h = plot?.histogram ?? {};
  const centers = Array.isArray(h.bin_centers) ? h.bin_centers : [];
  const counts = Array.isArray(h.counts) ? h.counts : [];
  const width =
    centers.length >= 2 ? Math.round((centers[1] - centers[0]) * 1e4) / 1e4 : null;
  const half = width != null ? width / 2 : 0;
  const lsl = h.lsl ?? null;
  const usl = h.usl ?? null;
  const bins = centers.map((c, i) => {
    const from = width != null ? Math.round((c - half) * 1e4) / 1e4 : c;
    const to = width != null ? Math.round((c + half) * 1e4) / 1e4 : c;
    // A bin is out_of_spec when it lies WHOLLY outside [LSL, USL] (§8).
    const oos =
      (usl != null && from >= usl) || (lsl != null && to <= lsl);
    return { center: c, from, to, count: counts[i] ?? 0, out_of_spec: oos };
  });
  const oosIndexes = bins.map((b, i) => (b.out_of_spec ? i : -1)).filter((i) => i >= 0);
  const out = {
    unit: null,
    sample_size: sampleSize(plot),
    bins,
    bin_width: width,
    curve: {
      x: Array.isArray(h.curve_x) ? h.curve_x : [],
      y: Array.isArray(h.curve_y) ? h.curve_y : [],
    },
    mean: h.mean ?? null,
    usl,
    lsl,
    std: h.std ?? null,
    sigma_minus_3: h.sigma_minus_3 ?? null,
    sigma_plus_3: h.sigma_plus_3 ?? null,
    out_of_spec: {
      count: oosIndexes.reduce((a, i) => a + (bins[i].count ?? 0), 0),
      bin_indexes: oosIndexes,
      observations_available: false, // raw readings not stored (§8)
    },
    capability,
  };
  // `target` omitted when stored as null (§8), never sent as 0.
  if (h.target != null) out.target = h.target;
  return out;
}

/**
 * spc-detail (§4/§5/§13): assemble the full detail response from a combo's 4
 * rows. Insufficient headline → capability with null values + sample_size and
 * NO chart datasets (§5 step 2).
 *
 * @returns {object} the body (controller adds context + snapshot_date)
 */
export function toSpcDetail(rows, { snapshot }) {
  const combos = [...groupCombos(rows).values()];
  const combo = combos[0];
  if (!combo) {
    return { available: "not_found" };
  }
  const plot = parsePlotData(combo.plotRow?.plot_data);
  const sample = sampleSize(plot);
  const capability = buildCapability(combo, sample);

  if (combo.headline_status === "Insufficient Data") {
    return {
      capability,
      insufficient: { sample_size: sample },
    };
  }

  const ctx = {
    machine: combo.machine,
    recipe: combo.recipe,
    parameter: combo.parameter,
    snapshot,
  };
  const xData = buildChartDataset(plot?.x_chart, { ...ctx, chartTag: "X" });
  const rData = buildChartDataset(plot?.r_chart, { ...ctx, chartTag: "R" });
  const histogram = buildHistogram(plot, capability);
  // Both charts' alerts merged into one feed, tagged by chart (§5/§12).
  const alerts = [...xData.alerts, ...rData.alerts];
  return {
    capability,
    x_chart: xData,
    r_chart: rData,
    histogram,
    alerts,
  };
}
