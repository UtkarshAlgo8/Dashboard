/**
 * Quality SPC controllers (Backend FRD §2–§13).
 *
 * Same shape as the Process controllers: resolve snapshot → build SQL →
 * runQuery → transform → JSON, TTL-cached, with the context object echoed
 * (§0.9). Every SPC request resolves to the latest snapshot ≤ the requested
 * date and echoes `snapshot_date` (§2.1).
 */
import { cached, buildCacheKey } from "../../utils/cache.js";
import { runQuery } from "../datasource/index.js";
import {
  spcSnapshotQuery,
  spcSummaryRowsQuery,
  spcMachinesQuery,
  spcRecipesQuery,
  spcProductTypesQuery,
  spcWidgetsRowsQuery,
  spcDetailRowsQuery,
} from "../queries/spc.queries.js";
import {
  toSpcSummary,
  toSpcFilterOptions,
  toSpcWidgets,
  toSpcDetail,
} from "../transformers/spc.transformers.js";
import { parsePlotData, groupCombos } from "../spc/engine.js";

function badRequest(res, message) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function hasQueryValue(query, key) {
  return Object.prototype.hasOwnProperty.call(query, key) && query[key] != null;
}

/** Latest snapshot date ≤ requested date, or null if the family is empty. */
async function resolveSnapshot(date) {
  const rows = await runQuery(spcSnapshotQuery(date));
  return rows[0]?.snapshot_date ?? null;
}

/** GET /quality/spc/summary  ?date= [&machine=] */
export async function getSpcSummary(req, res, next) {
  try {
    const { date, machine, plant } = req.query;
    const key = buildCacheKey("/quality/spc/summary", req.query);
    const body = await cached(key, async () => {
      const snapshot = await resolveSnapshot(date);
      if (!snapshot) return { snapshot: null, summary: null };
      const rows = await runQuery(spcSummaryRowsQuery({ snapshot, machine }));
      return { snapshot, summary: toSpcSummary(rows) };
    });
    if (!body.snapshot) {
      return res.json({ context: { plant, snapshot_date: null }, total_parameters: 0 });
    }
    res.json({
      context: { plant, snapshot_date: body.snapshot },
      ...body.summary,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /quality/spc/filter-options  ?date= */
export async function getSpcFilterOptions(req, res, next) {
  try {
    const { date, plant } = req.query;
    const key = buildCacheKey("/quality/spc/filter-options", req.query);
    const body = await cached(key, async () => {
      const snapshot = await resolveSnapshot(date);
      if (!snapshot) return null;
      const [machines, recipes, productTypes] = await Promise.all([
        runQuery(spcMachinesQuery({ snapshot })),
        runQuery(spcRecipesQuery({ snapshot })),
        runQuery(spcProductTypesQuery({ snapshot })),
      ]);
      return { snapshot, options: toSpcFilterOptions({ machines, recipes, productTypes }) };
    });
    if (!body) {
      return res.json({
        context: { plant, snapshot_date: null },
        machines: [],
        recipes: [],
        product_types: [],
      });
    }
    res.json({ context: { plant, snapshot_date: body.snapshot }, ...body.options });
  } catch (err) {
    next(err);
  }
}

/** GET /quality/spc/widgets  ?date= [&machine= &recipe= &headline_status=] */
export async function getSpcWidgets(req, res, next) {
  try {
    const { date, machine, recipe, headline_status: headline, plant } = req.query;
    const key = buildCacheKey("/quality/spc/widgets", req.query);
    const body = await cached(key, async () => {
      const snapshot = await resolveSnapshot(date);
      if (!snapshot) return { snapshot: null };
      const rows = await runQuery(spcWidgetsRowsQuery({ snapshot, machine, recipe }));
      let { count, widgets } = toSpcWidgets(rows);
      if (headline) {
        widgets = widgets.filter((w) => w.headline_status === headline);
        count = widgets.length;
      }
      return { snapshot, count, widgets };
    });
    if (!body.snapshot) {
      return res.json({
        context: { plant, snapshot_date: null, machine, recipe },
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
        ...(headline ? { headline_status: headline } : {}),
      },
      count: body.count,
      widgets: body.widgets,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /quality/spc/detail  ?date= &machine= &recipe= &parameter= [&shift=] */
export async function getSpcDetail(req, res, next) {
  try {
    const { date, machine, recipe, parameter, shift, plant } = req.query;
    if (!hasQueryValue(req.query, "machine") || !hasQueryValue(req.query, "recipe") || !hasQueryValue(req.query, "parameter")) {
      return badRequest(res, "`machine`, `recipe`, and `parameter` are required.");
    }
    const key = buildCacheKey("/quality/spc/detail", req.query);
    const body = await cached(key, async () => {
      const snapshot = await resolveSnapshot(date);
      if (!snapshot) return { snapshot: null };
      const rows = await runQuery(
        spcDetailRowsQuery({ snapshot, machine, recipe, parameter }),
      );
      return { snapshot, detail: toSpcDetail(rows, { snapshot }) };
    });
    if (!body.snapshot) {
      return res.json({
        context: { plant, machine, recipe, parameter, snapshot_date: null, shift_supported: false },
      });
    }
    res.json({
      // `shift` and `date` are accepted-and-echoed context; no SPC row carries
      // shift yet, so shift_supported:false (§4).
      context: {
        plant,
        machine,
        recipe,
        parameter,
        shift: shift ?? "All",
        snapshot_date: body.snapshot,
        shift_supported: false,
      },
      ...body.detail,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/spc/histogram-observations  ?...combo... &bin_index=
 * v1 contract (§8): individual readings are not stored, so returns the bin's
 * bounds + count with observations_available:false. Shape is final.
 */
export async function getHistogramObservations(req, res, next) {
  try {
    const { machine, recipe, parameter, date } = req.query;
    const binIndex = Number.parseInt(req.query.bin_index, 10);
    if (!hasQueryValue(req.query, "machine") || !hasQueryValue(req.query, "recipe") || !hasQueryValue(req.query, "parameter") || !Number.isFinite(binIndex)) {
      return badRequest(res, "`machine`, `recipe`, `parameter`, `bin_index` are required.");
    }
    const snapshot = await resolveSnapshot(date);
    const rows = snapshot
      ? await runQuery(spcDetailRowsQuery({ snapshot, machine, recipe, parameter }))
      : [];
    const combo = [...groupCombos(rows).values()][0];
    const h = parsePlotData(combo?.plotRow?.plot_data)?.histogram ?? {};
    const centers = Array.isArray(h.bin_centers) ? h.bin_centers : [];
    const counts = Array.isArray(h.counts) ? h.counts : [];
    const width = centers.length >= 2 ? centers[1] - centers[0] : 0;
    const center = centers[binIndex];
    if (center == null) {
      return res.json({ observations_available: false, bin: null });
    }
    res.json({
      observations_available: false,
      bin: {
        from: Math.round((center - width / 2) * 1e4) / 1e4,
        to: Math.round((center + width / 2) * 1e4) / 1e4,
        count: counts[binIndex] ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/spc/point-observations  ?...combo... &chart=X|R &point_index=
 * v1 contract (§12.4): subgroup composition is not stored, so returns the
 * point's own facts with observations_available:false.
 */
export async function getPointObservations(req, res, next) {
  try {
    const { machine, recipe, parameter, date } = req.query;
    const chart = (req.query.chart ?? "X").toUpperCase() === "R" ? "r_chart" : "x_chart";
    const pointIndex = Number.parseInt(req.query.point_index, 10);
    if (!hasQueryValue(req.query, "machine") || !hasQueryValue(req.query, "recipe") || !hasQueryValue(req.query, "parameter") || !Number.isFinite(pointIndex)) {
      return badRequest(res, "`machine`, `recipe`, `parameter`, `point_index` are required.");
    }
    const snapshot = await resolveSnapshot(date);
    const rows = snapshot
      ? await runQuery(spcDetailRowsQuery({ snapshot, machine, recipe, parameter }))
      : [];
    const combo = [...groupCombos(rows).values()][0];
    const c = parsePlotData(combo?.plotRow?.plot_data)?.[chart] ?? {};
    const values = Array.isArray(c.values) ? c.values : [];
    const times = Array.isArray(c.time) ? c.time : [];
    const value = values[pointIndex - 1];
    if (value == null) {
      return res.json({ observations_available: false, point: null });
    }
    res.json({
      observations_available: false,
      point: { index: pointIndex, value, time: times[pointIndex - 1] ?? null },
    });
  } catch (err) {
    next(err);
  }
}
