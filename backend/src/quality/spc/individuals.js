/** Individuals / moving-range charts for deviation readings; never subgroup-of-five. */
import {
  evaluateNelson,
  deriveAlerts,
  alertSlug,
  headlineStatus,
} from "./engine.js";

const mean = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function individualSeries(readings) {
  const points = readings.map((r, i) => ({
    index: i + 1,
    time: r.event_time,
    segment: r.segment,
    value: r.actual_value - r.setpoint,
    actual_value: r.actual_value,
    setpoint: r.setpoint,
    sample_no: r.sample_no,
    break_before: i === 0 || readings[i - 1].segment !== r.segment,
    rules: [],
    alert_ids: [],
    z: null,
  }));
  const ranges = points.map((p, i) => ({
    ...p,
    rules: [],
    alert_ids: [],
    value: p.break_before ? null : Math.abs(p.value - points[i - 1].value),
  }));
  const mrbar = mean(ranges.filter((p) => p.value != null).map((p) => p.value));
  return {
    points,
    ranges,
    mean: mean(points.map((p) => p.value)),
    mrbar,
    sigma: mrbar == null ? null : mrbar / 1.128,
    segments: points.filter((p) => p.break_before).length,
  };
}

/** Preserve exact bin edges for observation drill-downs; no boundary rounding. */
export function deviationHistogram(values, { lsl, usl }, centre, sigma) {
  if (!values.length)
    return { bins: [], sample_size: 0, curve: { x: [], y: [] } };
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  const span = sorted.at(-1) - sorted[0];
  const width =
    span > 0 ? span / 20 : Math.max(Math.abs(sorted[0]) * 1e-6, 1e-6);
  const start = span > 0 ? sorted[0] : sorted[0] - width / 2;
  const binCount = span > 0 ? 20 : 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: start + i * width,
    to:
      i === binCount - 1
        ? span > 0
          ? sorted.at(-1)
          : start + width
        : start + (i + 1) * width,
    center: start + (i + 0.5) * width,
    count: 0,
  }));
  // Use the very same boundaries the observation endpoint uses (including float ties).
  for (const value of values) {
    const index = bins.findIndex(
      (b, i) =>
        value >= b.from && (i === binCount - 1 ? value <= b.to : value < b.to),
    );
    if (index < 0)
      throw new Error("Deviation did not fit histogram boundaries");
    bins[index].count++;
  }
  for (const b of bins) b.out_of_spec = b.to < lsl || b.from > usl;
  const curve = { x: [], y: [] };
  if (sigma > 0) {
    const lo = Math.min(start, centre - 3 * sigma);
    const hi = Math.max(bins.at(-1).to, centre + 3 * sigma);
    for (let i = 0; i < 100; i++) {
      const x = lo + ((hi - lo) * i) / 99;
      curve.x.push(x);
      curve.y.push(
        ((n * width) / (sigma * Math.sqrt(2 * Math.PI))) *
          Math.exp(-0.5 * ((x - centre) / sigma) ** 2),
      );
    }
  }
  const overall =
    n > 1
      ? Math.sqrt(
          values.reduce((sum, v) => sum + (v - centre) ** 2, 0) / (n - 1),
        )
      : 0;
  return {
    unit: null,
    value_basis: "deviation",
    sample_size: n,
    bins,
    bin_width: width,
    curve,
    mean: centre,
    median:
      n % 2
        ? sorted[Math.floor(n / 2)]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    std: overall,
    sigma_within: sigma,
    curve_sigma_source: "mean moving range / 1.128",
    lsl,
    usl,
    target: 0,
    sigma_minus_3: sigma == null ? null : centre - 3 * sigma,
    sigma_plus_3: sigma == null ? null : centre + 3 * sigma,
    spec_limits_available: true,
    spec_source: "LSL / USL on deviation",
    tolerance_provenance: "documented",
    out_of_spec: {
      count: values.filter((v) => v < lsl || v > usl).length,
      bin_indexes: bins.flatMap((b, i) => (b.out_of_spec ? [i] : [])),
      observations_available: true,
    },
  };
}

export function toIndividualDetail(combo, provenance) {
  const series = individualSeries(combo.readings);
  const { points, ranges, sigma } = series;
  const rules = Array.from({ length: 8 }, (_, i) => ({
    rule: i + 1,
    hit: false,
    point_indexes: [],
  }));
  const alerts = [];
  // Evaluate each contiguous run independently; global centre/sigma match the report.
  if (sigma > 0 && Number.isFinite(sigma)) {
    for (let start = 0; start < points.length; ) {
      let end = start + 1;
      while (end < points.length && !points[end].break_before) end++;
      const run = points.slice(start, end);
      const result = evaluateNelson(
        run.map((p) => p.value),
        series.mean,
        series.mean + 3 * sigma,
      );
      result.rules.forEach((r, j) => {
        rules[j].point_indexes.push(...r.point_indexes.map((i) => i + start));
        rules[j].hit ||= r.hit;
      });
      for (const [i, p] of run.entries()) {
        p.z = result.z[i];
        p.rules = result.pointRules.get(i + 1) ?? [];
      }
      for (const a of deriveAlerts(result.rules, {
        machine: combo.machine,
        recipe: combo.recipe,
        parameter: combo.parameter,
        snapshot: combo.snapshot_date,
        chart: "X",
        times: run.map((p) => p.time),
      })) {
        const alert = {
          ...a,
          alert_id: `${a.alert_id}-${alertSlug(combo.recipe)}-RUN${start + 1}`,
          segment: run[0].segment,
          points: {
            first: a.points.first + start,
            last: a.points.last + start,
          },
        };
        alerts.push(alert);
        for (let i = alert.points.first - 1; i < alert.points.last; i++)
          points[i].alert_ids.push(alert.alert_id);
      }
      start = end;
    }
  }
  for (const p of points)
    p.out_of_spec = p.value < combo.spec.lsl || p.value > combo.spec.usl;
  const capability = Object.fromEntries(
    Object.entries(combo.metrics).map(([m, cell]) => [
      m.toLowerCase(),
      { ...cell },
    ]),
  );
  capability.headline_status = headlineStatus(
    Object.values(combo.metrics).map((m) => m.status),
  );
  capability.sample_size = points.length;
  const common = {
    unit: null,
    chart_method: "individuals_moving_range",
    value_basis: "deviation",
    subgroup_size: 1,
  };
  return {
    source: provenance,
    capability,
    measurement: {
      source: "static_excel",
      value_basis: "deviation",
      readings: points.length,
      readings_used: points.length,
      segments: series.segments,
      subgroup_size: 1,
      coverage: combo.coverage,
      scope: { shift: "All", snapshot_date: combo.snapshot_date },
      note: "Temporary Excel snapshot; all supporting readings, all shifts. Deviation = actual value - setpoint.",
    },
    x_chart: {
      ...common,
      points,
      cl: series.mean,
      lsl: combo.spec.lsl,
      usl: combo.spec.usl,
      sigma,
      nelson: rules,
      alerts,
      nelson_evaluated: sigma > 0,
      nelson_note:
        sigma > 0
          ? null
          : "Nelson rules not evaluated: no positive within-run moving-range sigma.",
      limits_source:
        "LSL / USL (specification); Nelson zones use mean ± sigma",
      zones:
        sigma > 0
          ? [1, 2, 3].flatMap((n) => [
              { value: series.mean - n * sigma, label: `−${n}σ` },
              { value: series.mean + n * sigma, label: `+${n}σ` },
            ])
          : [],
    },
    r_chart: {
      ...common,
      value_basis: "moving_range_of_deviation",
      points: ranges,
      cl: series.mrbar,
      nelson: [],
      alerts: [],
      nelson_note: "Nelson rules apply to the X chart only.",
      limits_source:
        "Moving range within each segment; first reading has no range",
    },
    histogram: {
      ...deviationHistogram(
        points.map((p) => p.value),
        combo.spec,
        series.mean,
        sigma,
      ),
      capability,
    },
    alerts,
  };
}

export function toIndividualWidget(combo, provenance) {
  const series = individualSeries(combo.readings);
  return {
    machine: combo.machine,
    recipe: combo.recipe,
    parameter: combo.parameter,
    product_type: null,
    source: provenance,
    headline_status: headlineStatus(
      Object.values(combo.metrics).map((m) => m.status),
    ),
    cp: combo.metrics.Cp.value,
    cpk: combo.metrics.Cpk.value,
    cp_status: combo.metrics.Cp.status,
    cpk_status: combo.metrics.Cpk.status,
    sample_size: combo.readings.length,
    readings_used: combo.readings.length,
    segments: series.segments,
    chart_method: "individuals_moving_range",
    control_chart: {
      values: series.points.map((p) => p.value),
      time: series.points.map((p) => p.time),
      segments: series.points.map((p) => p.segment),
      lsl: combo.spec.lsl,
      usl: combo.spec.usl,
      cl: series.mean,
      value_basis: "deviation",
    },
  };
}
