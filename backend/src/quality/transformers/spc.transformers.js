/**
 * Row → response transformers for the Quality SPC module.
 *
 * Assembly (Gold_to_Silver_Mapping):
 *
 *   capability   GOLD   Cp/Cpk/Pp/Ppk + status, served verbatim.
 *   X-chart line GOLD   baseline UCL/LCL; CL = (UCL + LCL) / 2.
 *   X-chart dots SILVER subgroup means of 5 consecutive readings.
 *   R-chart      SILVER subgroup ranges; limits D3·R̄ / D4·R̄ (derived, and
 *                labelled as such — gold publishes no R limits).
 *   histogram    SILVER individual readings; spec window from the parameter
 *                tolerance, target from the modal setpoint.
 *   nelson/alerts computed here from the X and R series.
 *
 * Nothing gold publishes is ever recomputed.
 */
import {
  groupCombos,
  evaluateNelson,
  deriveAlerts,
  subgroups,
  rChartLimits,
  modeSetpoint,
  buildDistribution,
  validateLimits,
  toNumber,
  SUBGROUP_SIZE,
} from "../spc/engine.js";
import { resolveSilver } from "../spc/mapping.js";

const METRIC_ORDER = ["Cp", "Cpk", "Pp", "Ppk"];

/** Ordering: headline severity worst-first, then ascending Cpk (§3). */
const HEADLINE_RANK = {
  Critical: 0,
  Major: 1,
  Warning: 2,
  Healthy: 3,
  "Insufficient Data": 4,
};

/**
 * spc-summary: count combos by headline status. Reconciles to the combo
 * total (out_of_specification + marginal + not_capable + capable +
 * insufficient).
 */
export function toSpcSummary(rows) {
  const combos = groupCombos(rows);
  const counts = { Critical: 0, Major: 0, Warning: 0, Healthy: 0, "Insufficient Data": 0 };
  for (const c of combos.values()) {
    if (counts[c.headline_status] === undefined) counts[c.headline_status] = 0;
    counts[c.headline_status] += 1;
  }
  return {
    total_parameters: combos.size,
    out_of_specification: counts.Critical, // headline Critical
    marginal: counts.Major, // headline Major
    not_capable: counts.Warning, // headline Warning
    capable: counts.Healthy, // headline Healthy
    insufficient_data: counts["Insufficient Data"],
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

/** Build the capability block: value + status per metric, read as stored. */
function buildCapability(combo, sample) {
  const capability = {};
  for (const m of METRIC_ORDER) {
    const cell = combo.metrics[m] ?? { value: null, status: "Insufficient Data" };
    capability[m.toLowerCase()] = {
      value: cell.value ?? null,
      status: cell.status ?? null,
    };
  }
  capability.headline_status = combo.headline_status;
  capability.sample_size = sample;
  return capability;
}

/**
 * Resolve one combo's X-chart limits from the baseline index.
 * @param {Map<string, {ucl:*, lcl:*, baseline_date:string, on_or_before:boolean}>} index
 */
function limitsFor(index, machine, parameter) {
  const entry = index?.get(`${String(machine).toUpperCase()}|||${parameter}`);
  const v = validateLimits(entry?.ucl, entry?.lcl);
  return {
    ...v,
    baseline_date: entry?.baseline_date ?? null,
    baseline_on_or_before: entry?.on_or_before ?? null,
  };
}

/**
 * spc-widgets: one widget per combo — capability from gold, a subgroup-mean
 * sparkline from the batched silver board query, and the gold limits.
 *
 * @param {Array} rows                gold capability rows
 * @param {Map}   limitsIndex         machine|||parameter → baseline pair
 * @param {Map}   seriesIndex         machine|||recipe|||parameter → {means,times}
 */
export function toSpcWidgets(rows, { limitsIndex, seriesIndex } = {}) {
  const combos = [...groupCombos(rows).values()];
  const widgets = combos.map((c) => {
    const cp = c.metrics.Cp?.value ?? null;
    const cpk = c.metrics.Cpk?.value ?? null;
    const series = seriesIndex?.get(`${String(c.machine).toUpperCase()}|||${c.recipe}|||${c.parameter}`);
    const values = series?.means ?? [];
    const base = {
      parameter: c.parameter,
      machine: c.machine,
      recipe: c.recipe,
      product_type: c.product_type ?? null,
      headline_status: c.headline_status,
      cp,
      cpk,
      cp_status: c.metrics.Cp?.status ?? "Insufficient Data",
      cpk_status: c.metrics.Cpk?.status ?? "Insufficient Data",
      // Readings that actually back the chart (whole subgroups only). The
      // sparkline itself is thinned for transport, so `subgroups` reports
      // how many were computed, not how many are drawn.
      sample_size: series?.readings ?? 0,
      readings_used: series?.readings ?? 0,
      subgroups: series?.subgroups_total ?? (series?.means?.length ?? 0),
    };
    if (values.length === 0) {
      // No silver history for this combo: say so rather than drawing an empty
      // axis. `insufficient` keeps the existing widget contract.
      return {
        ...base,
        insufficient: {
          sample_size: series?.readings ?? 0,
          reason:
            c.headline_status === "Insufficient Data"
              ? "gold reports insufficient data for this combination"
              : "no silver measurements for this combination",
        },
      };
    }
    const lim = limitsFor(limitsIndex, c.machine, c.parameter);
    return {
      ...base,
      control_chart: {
        ucl: lim.ucl,
        cl: lim.cl,
        lcl: lim.lcl,
        limits_valid: lim.valid,
        values,
        time: series?.times ?? [],
      },
    };
  });
  widgets.sort((a, b) => {
    const r =
      (HEADLINE_RANK[a.headline_status] ?? 9) - (HEADLINE_RANK[b.headline_status] ?? 9);
    if (r !== 0) return r;
    return (a.cpk ?? Infinity) - (b.cpk ?? Infinity); // ascending Cpk
  });
  return { count: widgets.length, widgets };
}

/**
 * Build one control-chart dataset: per-point metadata (index, time, value,
 * z, rules, alert_ids), the limits, the 8-rule nelson summary and the
 * chart's alerts.
 *
 * Nelson needs a centre and a sigma. With no valid limit pair there is no
 * defensible centre, so the rules are skipped rather than run against a
 * made-up one — the points still plot.
 */
function buildChartDataset({ values, times, limits, chartTag, ctx, limitsSource }) {
  const usable = limits.valid && values.length > 0;
  const { sigma, z, rules, pointRules } = usable
    ? evaluateNelson(values, limits.cl, limits.ucl)
    : { sigma: null, z: values.map(() => null), rules: [], pointRules: new Map() };
  const alerts = usable
    ? deriveAlerts(rules, { ...ctx, chart: chartTag, times })
    : [];
  // Reverse index: which alert ids cover each 1-based point.
  const alertsByPoint = new Map();
  for (const a of alerts) {
    for (let p = a.points.first; p <= a.points.last; p += 1) {
      if (!alertsByPoint.has(p)) alertsByPoint.set(p, []);
      alertsByPoint.get(p).push(a.alert_id);
    }
  }
  const points = values.map((v, i) => {
    const idx = i + 1;
    return {
      index: idx,
      time: times[i] ?? null,
      value: Math.round(v * 1e4) / 1e4,
      z: z[i] == null ? null : Math.round(z[i] * 100) / 100,
      rules: pointRules.get(idx) ?? [],
      alert_ids: alertsByPoint.get(idx) ?? [],
    };
  });
  return {
    unit: ctx.unit ?? null,
    points,
    cl: limits.cl,
    ucl: limits.ucl,
    lcl: limits.lcl,
    sigma: sigma == null ? null : Math.round(sigma * 1e4) / 1e4,
    limits_valid: limits.valid,
    limits_source: limitsSource,
    limits_note: limits.reason,
    baseline_date: limits.baseline_date ?? null,
    baseline_on_or_before: limits.baseline_on_or_before ?? null,
    subgroup_size: SUBGROUP_SIZE,
    nelson: rules,
    alerts,
  };
}

/**
 * spc-detail: assemble the full detail response for ONE combo from its gold
 * capability rows, its gold baseline limits and its silver readings.
 *
 * @param {Array}  rows          gold capability rows for the combo
 * @param {object} deps
 * @param {Array}  deps.points   silver rows [{event_time, value, setpoint?}]
 * @param {object} deps.limits   limitsFor() result
 * @param {string} deps.snapshot capability snapshot date
 * @param {object} deps.scope    {dates:"all", shift} what the silver dots cover
 * @param {object} deps.selection {machine, recipe, parameter}
 */
export function toSpcDetail(rows, { points = [], limits, snapshot, scope, selection }) {
  const combo = [...groupCombos(rows).values()][0] ?? {
    machine: selection.machine,
    recipe: selection.recipe,
    parameter: selection.parameter,
    metrics: {},
    headline_status: "Insufficient Data",
  };
  const src = resolveSilver(selection.machine, selection.parameter);
  const clean = points
    .map((p) => ({ event_time: p.event_time, value: toNumber(p.value), setpoint: p.setpoint }))
    .filter((p) => p.value != null);

  const capability = buildCapability(combo, clean.length);
  const measurement = {
    source: src ? src.table : null,
    value_column: src ? src.valueColumn : null,
    readings: clean.length,
    scope,
    // Silver is authoritative for the dots; gold for the indices. Saying so
    // in the payload stops the two being confused when they disagree.
    note: src
      ? "Points from silver; capability and control limits from gold."
      : "No silver source mapped for this machine and parameter.",
  };

  if (clean.length === 0) {
    return {
      capability,
      measurement,
      insufficient: {
        sample_size: 0,
        reason: src
          ? "no silver measurements for this combination"
          : "machine or parameter is not mapped to a silver source",
      },
    };
  }

  const sg = subgroups(clean, SUBGROUP_SIZE);
  const ctx = {
    machine: combo.machine,
    recipe: combo.recipe,
    parameter: combo.parameter,
    snapshot,
    unit: src?.unit ?? null,
  };

  const xData = buildChartDataset({
    values: sg.means,
    times: sg.times,
    limits,
    chartTag: "X",
    ctx,
    limitsSource: "gold baseline",
  });

  const rLimitsRaw = rChartLimits(sg.ranges, SUBGROUP_SIZE);
  const rData = buildChartDataset({
    values: sg.ranges,
    times: sg.times,
    limits: {
      valid: rLimitsRaw.cl != null,
      ucl: rLimitsRaw.ucl,
      cl: rLimitsRaw.cl,
      lcl: rLimitsRaw.lcl,
      reason: null,
      baseline_date: null,
      baseline_on_or_before: null,
    },
    chartTag: "R",
    ctx,
    // Gold publishes no R limits; D3·R̄ / D4·R̄ is the definition of an
    // R chart's limits, not a fit to these points — but it does move with
    // the data, so it is labelled.
    limitsSource: "derived (D3/D4 from R-bar)",
  });

  const values = clean.map((p) => p.value);
  const target = src?.setpointColumn ? modeSetpoint(clean.map((p) => p.setpoint)) : null;
  const tol = src?.tolerance ?? null;
  const usl = target != null && tol != null ? target + tol : null;
  const lsl = target != null && tol != null ? target - tol : null;
  const histogram = {
    unit: src?.unit ?? null,
    ...buildDistribution(values, { target, usl, lsl }),
    spec_limits_available: usl != null && lsl != null,
    spec_source:
      usl != null
        ? `modal setpoint ± ${tol} ${src.unit ?? ""}`.trim()
        : null,
    // "assumed" tolerances are extended from a documented sibling; the UI
    // shows that so nobody treats an assumption as a plant spec.
    tolerance_provenance: src?.provenance ?? null,
    spec_note:
      usl != null
        ? null
        : src?.setpointColumn
          ? "no tolerance defined for this parameter — spec limits not drawn"
          : "parameter has no setpoint in silver and no fixed spec window — spec limits not drawn",
    capability,
  };

  return {
    capability,
    measurement: { ...measurement, subgroups: sg.means.length, subgroup_size: sg.size, readings_used: sg.used },
    x_chart: xData,
    r_chart: rData,
    histogram,
    alerts: [...xData.alerts, ...rData.alerts],
  };
}
