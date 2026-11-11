/** Published CTP values are authoritative. Only chart annotations are derived. */
import {
  deriveAlerts,
  evaluateNelson,
  headlineStatus,
  parsePlotData,
  toNumber,
} from "../spc/engine.js";

const SUFFIXES = [
  "OOC Points",
  "Shift Stats",
  "Mean",
  "Cpk",
  "Cp",
  "Ppk",
  "Pp",
];
const METRICS = ["Cp", "Cpk", "Pp", "Ppk"];
const text = (value) => {
  const s = String(value ?? "").trim();
  return !s || s.toLowerCase() === "null" ? null : s;
};
const number = (value) => (text(value) === null ? null : toNumber(value));
const plotOf = (row) => {
  const plot = parsePlotData(row?.plot_data);
  return plot && typeof plot === "object" && !Array.isArray(plot) ? plot : {};
};

function parseName(name) {
  const s = text(name) ?? "";
  const metric = SUFFIXES.find((suffix) => s.endsWith(` ${suffix}`));
  return metric ? { metric, parameter: s.slice(0, -metric.length - 1) } : null;
}

/** Evaluate contiguous valid segments; missing readings must not join runs. */
function annotate(points, limits, context) {
  const { cl, ucl, lcl } = limits;
  const hasLimits =
    [cl, ucl, lcl].every((v) => v !== null) && lcl <= cl && cl <= ucl;
  const symmetric =
    hasLimits &&
    ucl > cl &&
    Math.abs(ucl - cl - (cl - lcl)) <= Math.max(1, Math.abs(ucl - cl)) * 1e-6;
  let consecutive = 0,
    longest = 0;
  for (const point of points) {
    consecutive = point.value === null ? 0 : consecutive + 1;
    longest = Math.max(longest, consecutive);
  }
  const required = [1, 9, 6, 14, 3, 5, 15, 8];
  const rules = Array.from({ length: 8 }, (_, i) => ({
    rule: i + 1,
    evaluated: (i === 0 ? hasLimits : symmetric) && longest >= required[i],
    hit: false,
    point_indexes: [],
  }));
  if (symmetric) {
    let segment = [];
    const flush = () => {
      if (!segment.length) return;
      const result = evaluateNelson(
        segment.map((p) => p.value),
        cl,
        ucl,
      );
      for (const r of result.rules) {
        rules[r.rule - 1].point_indexes.push(
          ...r.point_indexes.map((index) => segment[index - 1].index),
        );
      }
      segment = [];
    };
    for (const point of points) {
      if (point.value === null) flush();
      else segment.push(point);
    }
    flush();
  }
  // Direct bounds also handle asymmetric / zero-width published baselines.
  rules[0].point_indexes = hasLimits
    ? points
        .filter((p) => p.value !== null && (p.value < lcl || p.value > ucl))
        .map((p) => p.index)
    : [];
  for (const r of rules) r.hit = r.point_indexes.length > 0;
  for (const p of points) {
    p.rules = rules
      .filter((r) => r.point_indexes.includes(p.index))
      .map((r) => r.rule);
    p.out_of_control =
      hasLimits && p.value !== null ? p.value < lcl || p.value > ucl : null;
  }
  return {
    rules,
    diagnostics_status: !points.some((p) => p.value !== null)
      ? "No valid readings for this selection."
      : !hasLimits
        ? "Published control limits are unavailable; Nelson rules were not evaluated."
        : !symmetric
          ? "Only the published bounds check is available; other Nelson rules require a non-zero symmetric baseline."
          : null,
    chart_ooc:
      hasLimits && points.some((p) => p.value !== null)
        ? points.filter((p) => p.out_of_control).length
        : null,
    alerts: deriveAlerts(rules, {
      ...context,
      chart: "X",
      times: points.map((p) => p.time),
    }),
  };
}

function chartOf(row, shift, context) {
  const plot = plotOf(row);
  const raw = Array.isArray(plot.points) ? plot.points : [];
  const points = raw
    .map((p) => (p && typeof p === "object" ? p : {}))
    .filter((p) => shift === "All" || text(p.shift)?.toUpperCase() === shift)
    .map((p, i) => ({
      index: i + 1,
      time: text(p.t),
      shift: text(p.shift),
      value: number(p.x_bar),
      range: number(p.r),
      published_ooc: typeof p.ooc === "boolean" ? p.ooc : null,
    }));
  const limits = {
    cl: number(plot.CL),
    ucl: number(plot.UCL),
    lcl: number(plot.LCL),
    usl: number(plot.USL),
    lsl: number(plot.LSL),
  };
  return { ...limits, points, ...annotate(points, limits, context) };
}

/** Transform one day's rows. No averaging, new limits or synthetic observations.
 * SQL supplies deterministic record_id order: last published duplicate wins,
 * with an explicit warning rather than summing indices or joining chart arrays.
 */
export function toSpcWorkspace(rows, request) {
  const date =
    request.date ?? rows.find((r) => r.granularity === "Day")?.date ?? null;
  const groups = new Map();
  for (const row of rows) {
    if (row.date !== date) continue;
    if (!["PCR", "TBR"].includes(row.tyre_type)) continue;
    if (request.tyre !== "All" && row.tyre_type !== request.tyre) continue;
    if (
      row.granularity !== "Day" &&
      row.granularity !== `SHIFT ${request.shift}`
    )
      continue;
    const name = parseName(row.kpi_name);
    if (!name || !text(row.machine)) continue;
    const id = JSON.stringify([
      row.tyre_type,
      row.machine,
      text(row.itemcode),
      name.parameter,
    ]);
    if (!groups.has(id))
      groups.set(id, { id, row, cells: {}, duplicates: false });
    const group = groups.get(id);
    const cellKey = `${row.granularity}:${name.metric}`;
    if (group.cells[cellKey]) group.duplicates = true;
    group.cells[cellKey] = row;
  }
  const processes = [];
  for (const { id, row, cells, duplicates } of groups.values()) {
    // Shift-only metadata must not manufacture a daily capability process.
    if (!Object.keys(cells).some((key) => key.startsWith("Day:"))) continue;
    const metrics = Object.fromEntries(
      METRICS.map((metric) => {
        const cell = cells[`Day:${metric}`];
        return [
          metric,
          {
            value: number(cell?.actual_value),
            status: text(cell?.status),
            window_days: number(plotOf(cell).window_days),
          },
        ];
      }),
    );
    const meanRow = cells["Day:Mean"];
    const oocRow = cells["Day:OOC Points"];
    const shiftRow = cells[`SHIFT ${request.shift}:Shift Stats`];
    const chart = chartOf(oocRow, request.shift, {
      machine: row.machine,
      parameter: parseName(row.kpi_name).parameter,
      recipe: text(row.itemcode),
      snapshot: date,
    });
    const meanPlot = plotOf(meanRow);
    const unit = text(meanRow?.unit_of_measurement);
    const warnings = [];
    if (duplicates)
      warnings.push(
        "Duplicate published metric rows: the last record_id is displayed.",
      );
    if (request.shift !== "All")
      warnings.push(
        "Capability indices and published mean/OOC count are daily snapshots. Only chart readings and shift sample count use the selected shift.",
      );
    if (request.shift !== "All" && !shiftRow)
      warnings.push("No published shift statistics for this selection.");
    if (chart.diagnostics_status) warnings.push(chart.diagnostics_status);
    processes.push({
      id,
      tyre: row.tyre_type,
      machine: row.machine,
      parameter: parseName(row.kpi_name).parameter,
      recipe: text(row.itemcode),
      section: text(row.section),
      sub_section: text(row.sub_section),
      unit,
      metrics,
      headline_status: headlineStatus(
        METRICS.map((m) => metrics[m].status ?? "Insufficient Data"),
      ),
      mean: {
        value: number(meanRow?.actual_value),
        status: text(meanRow?.status),
        sample_count: number(meanPlot.n),
      },
      published_ooc: {
        value: number(oocRow?.actual_value),
        status: text(oocRow?.status),
      },
      shift_sample_count: number(shiftRow?.actual_value),
      target: number(meanPlot.target),
      chart,
      warnings,
    });
  }
  processes.sort(
    (a, b) =>
      a.tyre.localeCompare(b.tyre) ||
      a.machine.localeCompare(b.machine) ||
      a.parameter.localeCompare(b.parameter) ||
      String(a.recipe).localeCompare(String(b.recipe)),
  );
  return {
    context: {
      plant: "CTP",
      category: "SPC",
      tyre: request.tyre,
      shift: request.shift,
      date,
      data_date: processes.length ? date : null,
      date_mode: request.date === null ? "latest" : "selected",
      capability_scope: "daily_snapshot",
      chart_scope: request.shift,
    },
    processes,
  };
}
