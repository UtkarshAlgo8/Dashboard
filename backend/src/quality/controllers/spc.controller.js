/**
 * Quality SPC controllers.
 *
 * Each request resolves a gold capability snapshot, pulls the gold baseline
 * limits, pulls the silver readings for the same window, and hands all three
 * to the transformer. Everything is TTL-cached and echoes its context (§0.9).
 *
 * The shift selector now drives BOTH layers: gold capability granularity
 * (Day | Shift A/B/C) and the silver time window (A 07–15, B 15–23,
 * C 23–07 next day), so `shift_supported` is finally true.
 */
import { cached, buildCacheKey } from "../../utils/cache.js";
import { runQuery } from "../datasource/index.js";
import {
  spcSnapshotQuery,
  spcCapabilityRowsQuery,
  spcMachinesQuery,
  spcRecipesQuery,
  spcProductTypesQuery,
  spcDetailRowsQuery,
  spcCapabilityRangeQuery,
  spcDetailRangeQuery,
  spcLimitsQuery,
  spcGranularity,
} from "../queries/spc.queries.js";
import {
  silverPointsQuery,
  silverBoardQuery,
} from "../queries/silver.queries.js";
import {
  toSpcSummary,
  toSpcFilterOptions,
  toSpcWidgets,
  toSpcDetail,
} from "../transformers/spc.transformers.js";
import {
  resolveSilver,
  sourceForMachine,
  SILVER_SOURCES,
  paramsForSource,
  dayWindow,
  addDays,
} from "../spc/mapping.js";
import {
  pickBaseline,
  subgroups,
  toNumber,
  validateLimits,
  statusForValue,
  parseKpiName,
  buildDistribution,
  normalizeTime,
  SUBGROUP_SIZE,
} from "../spc/engine.js";

function badRequest(res, message) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function hasQueryValue(query, key) {
  return Object.prototype.hasOwnProperty.call(query, key) && query[key] != null;
}

/** Latest capability date ≤ requested date for this granularity, or null. */
async function resolveSnapshot(date, granularity) {
  const rows = await runQuery(spcSnapshotQuery(date, granularity));
  const raw = rows[0]?.snapshot_date ?? null;
  return raw ? String(raw).slice(0, 10) : null;
}

/**
 * Grade averaged capability rows. The range queries return no status — it is
 * published per day and a month's average has none — so each row is graded
 * from its own averaged value, in the same bands gold uses.
 */
function gradeRangeRows(rows) {
  return rows.map((r) => ({
    ...r,
    status: statusForValue(parseKpiName(r.kpi_name).metric, r.actual_value),
  }));
}

/**
 * Whole-range window (e.g. a calendar month), inclusive of both `from` and
 * `to` dates — as opposed to `shiftWindow`, which windows a single day/shift.
 * Used when the caller passes an explicit `from`/`to` instead of one `date`.
 */
function rangeWindow(from, to) {
  return { from: `${from} 00:00:00`, to: `${addDays(to, 1)} 00:00:00` };
}

/**
 * Baseline UCL/LCL index: `MACHINE|||Parameter` → {ucl, lcl, baseline_date}.
 *
 * One query for every machine in scope, then the newest baseline on or
 * before the chart date is chosen per machine+parameter in JS (see
 * pickBaseline — SQL QUALIFY is not portable to the alasql source).
 */
async function loadLimitsIndex({ machine, parameter, isoDate }) {
  const rows = await runQuery(spcLimitsQuery({ machine, parameter }));
  const byKey = new Map();
  for (const r of rows) {
    const { parameter: param } = splitLimitName(r.kpi_name);
    if (!param) continue;
    const key = `${String(r.machine).toUpperCase()}|||${param}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }
  const index = new Map();
  for (const [key, group] of byKey) {
    const picked = pickBaseline(group, isoDate);
    const entry = { ucl: null, lcl: null, baseline_date: picked.baseline_date, on_or_before: picked.on_or_before };
    for (const r of picked.rows) {
      const { bound } = splitLimitName(r.kpi_name);
      if (bound === "UCL") entry.ucl = r.actual_value;
      if (bound === "LCL") entry.lcl = r.actual_value;
    }
    index.set(key, entry);
  }
  return index;
}

/** "Belt 1 Length UCL" → { parameter: "Belt 1 Length", bound: "UCL" }. */
function splitLimitName(kpiName) {
  const s = String(kpiName ?? "").trim();
  const i = s.lastIndexOf(" ");
  if (i === -1) return { parameter: null, bound: null };
  const bound = s.slice(i + 1).toUpperCase();
  if (bound !== "UCL" && bound !== "LCL") return { parameter: null, bound: null };
  return { parameter: s.slice(0, i).trim(), bound };
}

/**
 * Subgroup-mean series for every combo on the board, from ONE silver query
 * per table rather than one per widget (~100 widgets would otherwise be
 * ~100 Athena scans).
 *
 * All parameters of a machine are columns of the same measurement row (one
 * tyre = one row), so "5 consecutive rows" is the natural subgroup for all
 * of them simultaneously — the board query groups once and averages each
 * parameter column within that grouping.
 *
 * The query returns an already-thinned series (a month of untouched
 * subgroups for one table exceeds the upstream response ceiling and the
 * whole board comes back empty), plus the true per-parameter totals.
 *
 * @returns {Map<string, {means:number[], times:string[], readings:number,
 *          subgroups_total:number}>} keyed `MACHINE|||recipe|||Parameter`
 */
async function loadBoardSeries({ machine, recipe, from, to }) {
  const sources = machine
    ? [sourceForMachine(machine)].filter(Boolean)
    : SILVER_SOURCES;
  const index = new Map();
  const results = await Promise.all(
    sources.map(async (src) => {
      const params = paramsForSource(src);
      try {
        const rows = await runQuery(
          silverBoardQuery(src, params, {
            machine,
            recipe,
            from,
            to,
            size: SUBGROUP_SIZE,
            points: BOARD_SPARK_POINTS,
          }),
        );
        return { src, params, rows };
      } catch (err) {
        // One unavailable silver table must not blank the whole board; the
        // affected widgets fall back to "no measurements in window". Log it:
        // silently swallowed, an upstream failure is indistinguishable from
        // a genuinely empty window, and the board just looks like no data.
        console.warn(`[spc] board series ${src.table}: ${err.message}`);
        return { src, params, rows: [] };
      }
    }),
  );
  for (const { params, rows } of results) {
    for (const row of rows) {
      for (const [parameter, p] of Object.entries(params)) {
        const v = toNumber(row[p.valueColumn]);
        if (v == null) continue;
        const key = `${String(row.machine).toUpperCase()}|||${row.recipe}|||${parameter}`;
        let series = index.get(key);
        if (!series) {
          // Counts are window-wide and identical on every row of the group,
          // so they are read once, from the first row that creates it.
          const total = toNumber(row[`n_${p.valueColumn}`]) ?? 0;
          series = {
            means: [],
            times: [],
            subgroups_total: total,
            readings: total * SUBGROUP_SIZE,
          };
          index.set(key, series);
        }
        series.means.push(Math.round(v * 1e4) / 1e4);
        series.times.push(normalizeTime(row.event_time));
      }
    }
  }
  return index;
}

/** Points kept in a widget sparkline. The detail chart is never thinned. */
const BOARD_SPARK_POINTS = 60;

/** GET /quality/spc/summary  ?date= [&shift= &machine=] */
export async function getSpcSummary(req, res, next) {
  try {
    const { date, machine, plant, shift } = req.query;
    const granularity = spcGranularity(shift);
    const key = buildCacheKey("/quality/spc/summary", req.query);
    const body = await cached(key, async () => {
      const snapshot = await resolveSnapshot(date, granularity);
      if (!snapshot) return { snapshot: null, summary: null };
      const rows = await runQuery(
        spcCapabilityRowsQuery({ snapshot, granularity, machine }),
      );
      return { snapshot, summary: toSpcSummary(rows) };
    });
    if (!body.snapshot) {
      return res.json({
        context: { plant, snapshot_date: null, granularity },
        total_parameters: 0,
      });
    }
    res.json({
      context: { plant, snapshot_date: body.snapshot, granularity },
      ...body.summary,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /quality/spc/filter-options  ?date= [&shift= &machine=] */
export async function getSpcFilterOptions(req, res, next) {
  try {
    const { date, plant, shift, machine } = req.query;
    const granularity = spcGranularity(shift);
    const key = buildCacheKey("/quality/spc/filter-options", req.query);
    const body = await cached(key, async () => {
      const snapshot = await resolveSnapshot(date, granularity);
      if (!snapshot) return null;
      const [machines, recipes, productTypes] = await Promise.all([
        runQuery(spcMachinesQuery({ snapshot, granularity })),
        runQuery(spcRecipesQuery({ snapshot, granularity, machine })),
        runQuery(spcProductTypesQuery({ snapshot, granularity })),
      ]);
      return {
        snapshot,
        options: toSpcFilterOptions({ machines, recipes, productTypes }),
      };
    });
    if (!body) {
      return res.json({
        context: { plant, snapshot_date: null, granularity },
        machines: [],
        recipes: [],
        product_types: [],
      });
    }
    res.json({
      context: { plant, snapshot_date: body.snapshot, granularity },
      ...body.options,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/spc/widgets  ?date= [&shift= &machine= &recipe= &headline_status=]
 * Or, for a whole-range view (month/year): ?from= &to= instead of &date=.
 * `from`/`to` widen the chart-point window to the whole range instead of a
 * single day/shift; the headline capability snapshot still resolves to the
 * latest one on or before `to` (capability rows are daily, not summable).
 */
export async function getSpcWidgets(req, res, next) {
  try {
    const { date, from, to, machine, recipe, headline_status: headline, plant, shift } = req.query;
    const granularity = spcGranularity(shift);
    const key = buildCacheKey("/quality/spc/widgets", req.query);
    const body = await cached(key, async () => {
      const snapshot = await resolveSnapshot(from && to ? to : date, granularity);
      if (!snapshot) return { snapshot: null };
      const window = from && to ? rangeWindow(from, to) : dayWindow(date, snapshot, shift);
      // Month / date-range views average the days in the range; a single-day
      // view reads that day's published rows.
      const capabilityRows =
        from && to
          ? runQuery(
              spcCapabilityRangeQuery({ from, to, granularity, machine, recipe }),
            ).then(gradeRangeRows)
          : runQuery(spcCapabilityRowsQuery({ snapshot, granularity, machine, recipe }));
      const [rows, limitsIndex, seriesIndex] = await Promise.all([
        capabilityRows,
        loadLimitsIndex({ machine, isoDate: snapshot }),
        loadBoardSeries({ machine, recipe, from: window.from, to: window.to }),
      ]);
      let { count, widgets } = toSpcWidgets(rows, { limitsIndex, seriesIndex });
      if (headline) {
        widgets = widgets.filter((w) => w.headline_status === headline);
        count = widgets.length;
      }
      return { snapshot, window, count, widgets };
    });
    if (!body.snapshot) {
      return res.json({
        context: { plant, snapshot_date: null, machine, recipe, granularity },
        count: 0,
        widgets: [],
      });
    }
    res.json({
      context: {
        plant,
        snapshot_date: body.snapshot,
        machine,
        recipe,
        granularity,
        shift: shift ?? "All",
        window: body.window,
        ...(headline ? { headline_status: headline } : {}),
      },
      count: body.count,
      widgets: body.widgets,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/spc/detail  ?date= &machine= &recipe= &parameter= [&shift=]
 * Or, for a whole-range view (month/year): ?from= &to= instead of &date=.
 * See getSpcWidgets for the from/to vs date semantics.
 */
export async function getSpcDetail(req, res, next) {
  try {
    const { date, from, to, machine, recipe, parameter, shift, plant } = req.query;
    if (
      !hasQueryValue(req.query, "machine") ||
      !hasQueryValue(req.query, "recipe") ||
      !hasQueryValue(req.query, "parameter")
    ) {
      return badRequest(res, "`machine`, `recipe`, and `parameter` are required.");
    }
    const granularity = spcGranularity(shift);
    const key = buildCacheKey("/quality/spc/detail", req.query);
    const body = await cached(key, async () => {
      const snapshot = await resolveSnapshot(from && to ? to : date, granularity);
      if (!snapshot) return { snapshot: null };
      const window = from && to ? rangeWindow(from, to) : dayWindow(date, snapshot, shift);
      const src = resolveSilver(machine, parameter);
      const capabilityRows =
        from && to
          ? runQuery(
              spcDetailRangeQuery({ from, to, granularity, machine, recipe, parameter }),
            ).then(gradeRangeRows)
          : runQuery(
              spcDetailRowsQuery({ snapshot, granularity, machine, recipe, parameter }),
            );
      const [rows, limitsIndex, points] = await Promise.all([
        capabilityRows,
        loadLimitsIndex({ machine, parameter, isoDate: snapshot }),
        src
          ? runQuery(
              silverPointsQuery(src, {
                machine,
                recipe,
                from: window.from,
                to: window.to,
              }),
            ).catch(() => [])
          : Promise.resolve([]),
      ]);
      const limitsEntry = limitsIndex.get(`${String(machine).toUpperCase()}|||${parameter}`);
      const detail = toSpcDetail(rows, {
        points,
        limits: {
          ...validateLimits(limitsEntry?.ucl, limitsEntry?.lcl),
          baseline_date: limitsEntry?.baseline_date ?? null,
          baseline_on_or_before: limitsEntry?.on_or_before ?? null,
        },
        snapshot,
        window,
        selection: { machine, recipe, parameter },
      });
      return { snapshot, window, detail };
    });
    if (!body.snapshot) {
      return res.json({
        context: {
          plant,
          machine,
          recipe,
          parameter,
          snapshot_date: null,
          granularity,
          shift_supported: true,
        },
      });
    }
    res.json({
      context: {
        plant,
        machine,
        recipe,
        parameter,
        shift: shift ?? "All",
        granularity,
        snapshot_date: body.snapshot,
        window: body.window,
        // Shift now narrows both the gold granularity and the silver window.
        shift_supported: true,
      },
      ...body.detail,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/spc/histogram-observations  ?...combo... &bin_index=
 * Individual readings ARE available in silver now, so a bin click returns
 * the actual readings that fell in it, not just the bin's bounds.
 */
export async function getHistogramObservations(req, res, next) {
  try {
    const { machine, recipe, parameter, date, shift } = req.query;
    const binIndex = Number.parseInt(req.query.bin_index, 10);
    if (
      !hasQueryValue(req.query, "machine") ||
      !hasQueryValue(req.query, "recipe") ||
      !hasQueryValue(req.query, "parameter") ||
      !Number.isFinite(binIndex)
    ) {
      return badRequest(res, "`machine`, `recipe`, `parameter`, `bin_index` are required.");
    }
    const granularity = spcGranularity(shift);
    const snapshot = await resolveSnapshot(date, granularity);
    const src = resolveSilver(machine, parameter);
    if (!snapshot || !src) {
      return res.json({ observations_available: false, bin: null });
    }
    const window = dayWindow(date, snapshot, shift);
    const points = await runQuery(
      silverPointsQuery(src, { machine, recipe, from: window.from, to: window.to }),
    ).catch(() => []);
    const values = points.map((p) => toNumber(p.value)).filter((v) => v != null);
    if (values.length === 0) {
      return res.json({ observations_available: false, bin: null });
    }
    const dist = buildDistribution(values, {});
    const bin = dist.bins[binIndex];
    if (!bin) return res.json({ observations_available: false, bin: null });
    const inBin = points
      .map((p) => ({ time: normalizeTime(p.event_time), value: toNumber(p.value) }))
      .filter(
        (p) =>
          p.value != null &&
          p.value >= bin.from &&
          (binIndex === dist.bins.length - 1 ? p.value <= bin.to : p.value < bin.to),
      );
    res.json({
      observations_available: true,
      bin: { from: bin.from, to: bin.to, count: bin.count },
      observations: inBin,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/spc/point-observations  ?...combo... &chart=X|R &point_index=
 * A point is a subgroup mean, so its composition is now knowable: return the
 * individual readings that made it.
 */
export async function getPointObservations(req, res, next) {
  try {
    const { machine, recipe, parameter, date, shift } = req.query;
    const chart = (req.query.chart ?? "X").toUpperCase() === "R" ? "R" : "X";
    const pointIndex = Number.parseInt(req.query.point_index, 10);
    if (
      !hasQueryValue(req.query, "machine") ||
      !hasQueryValue(req.query, "recipe") ||
      !hasQueryValue(req.query, "parameter") ||
      !Number.isFinite(pointIndex)
    ) {
      return badRequest(res, "`machine`, `recipe`, `parameter`, `point_index` are required.");
    }
    const granularity = spcGranularity(shift);
    const snapshot = await resolveSnapshot(date, granularity);
    const src = resolveSilver(machine, parameter);
    if (!snapshot || !src) {
      return res.json({ observations_available: false, point: null });
    }
    const window = dayWindow(date, snapshot, shift);
    const rows = await runQuery(
      silverPointsQuery(src, { machine, recipe, from: window.from, to: window.to }),
    ).catch(() => []);
    const clean = rows
      .map((p) => ({ event_time: p.event_time, value: toNumber(p.value) }))
      .filter((p) => p.value != null);
    const sg = subgroups(clean, SUBGROUP_SIZE);
    const i = pointIndex - 1;
    if (i < 0 || i >= sg.means.length) {
      return res.json({ observations_available: false, point: null });
    }
    const members = clean.slice(i * SUBGROUP_SIZE, i * SUBGROUP_SIZE + SUBGROUP_SIZE);
    res.json({
      observations_available: true,
      point: {
        index: pointIndex,
        chart,
        value: chart === "R" ? sg.ranges[i] : sg.means[i],
        time: sg.times[i],
        subgroup_size: SUBGROUP_SIZE,
      },
      observations: members.map((m) => ({ time: normalizeTime(m.event_time), value: m.value })),
    });
  } catch (err) {
    next(err);
  }
}
