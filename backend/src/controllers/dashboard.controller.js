import { CACHE_TTL, cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import {
  lookupLanding,
  lookupDrill,
  lookupDrillAggregate,
} from "../utils/materializer.js";
import {
  normalizePlantId,
  plantDepartmentPredicate,
  plantSqlTable,
  canonicalizeSubSection,
} from "../utils/normalize.js";
import {
  buildDrillAggregateQuery,
  buildFetchQuery,
  buildLatestDateQuery,
  buildProductOptionsQuery,
  buildShiftComparisonQuery,
  buildShiftCoverageQuery,
  previousWindow,
  resolveDatePredicate,
  resolveGranularity,
  QueryValidationError,
} from "../queries/dashboard-query.js";

/**
 * POST /api/v1/dashboard/kpi-data — universal dashboard KPI + drill fetch.
 * Returns raw gold_dummy rows as `{ data: [...] }`.
 */
export async function postFetch(req, res, next) {
  try {
    const {
      context = {},
      date,
      from,
      to,
      drillKpis = null,
      // The kpi_names the landing grid renders. Lets the query return only
      // the rows that end up on screen instead of every top-level KPI in the
      // section/category, most of which the transformer discards.
      landingKpis = null,
      parentFilters = {},
      limit,
      offset,
      drillOnly,
      // new_change.md C15: ask for the preceding comparison window alongside
      // the current one, so the spike % has a real baseline instead of
      // "whatever row came second".
      withBaseline = false,
      plantId = "banmore",
    } = req.body ?? {};

    if (typeof context !== "object" || context === null) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "context must be an object" },
      });
      return;
    }

    // new_change.md C10 — a wide range blows past the row cap and the OLDEST
    // days are dropped silently (Curing 1-17 Jul unfiltered = 55,385 rows; a
    // 5,000 cap keeps only 07-16 and 07-17). The response looks successful and
    // the range total is simply far too low. Fetch cap+1 so we can detect the
    // overflow and tell the client, which must not present a partial total as
    // if it were complete.
    // Clamped to 9999 so the cap+1 probe below stays inside buildFetchQuery's
    // own 10000 ceiling — at 10000 the +1 would be rejected and silently fall
    // back to the 5000 default, reintroducing the truncation this guards.
    const effectiveLimit = Math.min(
      Number.isInteger(limit) && limit > 0 && limit <= 10000 ? limit : 5000,
      9999,
    );

    let sql;
    try {
      sql = buildFetchQuery({
        plantId,
        context,
        date,
        from,
        to,
        drillKpis,
        landingKpis,
        parentFilters,
        limit: effectiveLimit + 1,
        offset,
        drillOnly,
      });
    } catch (err) {
      const status = err instanceof QueryValidationError ? 400 : 500;
      res.status(status).json({
        error: {
          code:
            err.name === "QueryValidationError"
              ? "VALIDATION_ERROR"
              : "INTERNAL_ERROR",
          message: err.message,
        },
      });
      return;

    }

    // Key on the NORMALIZED limit, not the raw one. `effectiveLimit` clamps
    // and defaults the caller's value, so two requests that run byte-identical
    // SQL (limit omitted vs limit: 5000, or 10000 vs 9999) landed on different
    // keys and each paid its own upstream round-trip.
    const cacheKey = buildCacheKey("/dashboard/kpi-data", {
      context,
      plantId,
      date,
      from,
      to,
      drillKpis,
      landingKpis,
      parentFilters,
      limit: effectiveLimit,
      offset,
      drillOnly,
    });
    // Materializer-first read. The materializer holds level-1+2 deduped
    // rows for the trailing window and serves any filter combination
    // out of memory. Falls through to the warmed cache + Athena when
    // the materializer has no data (e.g. plant not warmed, window
    // outside range, or materializer disabled). On a hit, we still go
    // through the cache to preserve the existing 2-min TTL semantics
    // for any other reader and to avoid a refetch on the next call.
    const matRows = drillOnly
      ? lookupDrill(req.body)
      : lookupLanding(req.body);
    const rows =
      matRows != null
        ? matRows
        : await cached(
            cacheKey,
            () => runQuery(sql),
            CACHE_TTL.KPI_ROWS,
          );

    // C10: we asked for one row beyond the cap. If it came back, the result is
    // incomplete — trim the probe row and flag it so the UI can refuse to show
    // the total as final rather than quietly under-reporting the range.
    const truncated = rows.length > effectiveLimit;
    if (truncated) {
      console.warn(
        `[dashboard] row cap ${effectiveLimit} reached — result truncated`,
      );
    }
    const payload = {
      data: truncated ? rows.slice(0, effectiveLimit) : rows,
      truncated,
    };

    // C15/C16 — the baseline query differs from the current one in the DATE
    // WINDOW ONLY. Everything else (kpi_name, section, sub_section, machine,
    // product_type, unit_of_measurement, category, granularity) is reused
    // verbatim, which is what makes the comparison meaningful: grouping by
    // kpi_name alone let the "previous" value come from a different series.
    // A null window (open-ended range, or a snapshot with no predecessor)
    // means the UI renders blank — never 0%, never -100%.
    if (withBaseline) {
      const timeScope = resolveDatePredicate({ date, from, to });
      const granularity = resolveGranularity(
        context.granularity,
        timeScope.mode === "RANGE",
      );
      const window =
        typeof granularity === "string"
          ? previousWindow(timeScope, granularity)
          : null;

      if (window) {
        const baselineSql = buildFetchQuery({
          plantId,
          context,
          ...window,
          drillKpis,
          landingKpis,
          parentFilters,
          limit: effectiveLimit + 1,
          offset,
          drillOnly,
        });
        const baselineRows = await cached(
          buildCacheKey("/dashboard/kpi-data:baseline", { context, plantId, window, drillKpis, landingKpis, parentFilters, limit: effectiveLimit, offset, drillOnly }),
          () => runQuery(baselineSql),
          CACHE_TTL.KPI_ROWS,
        );
        payload.baseline = baselineRows.slice(0, effectiveLimit);
        payload.baselineWindow = window;
      } else {
        payload.baseline = null;
        payload.baselineWindow = null;
      }
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export async function postProductOptions(req, res, next) {
  try {
    const {
      context = {},
      date,
      from,
      to,
      limit,
      plantId = "banmore",
    } = req.body ?? {};

    const sql = buildProductOptionsQuery({
      plantId,
      context,
      date,
      from,
      to,
      limit,
    });
    const rows = await cached(
      buildCacheKey("/dashboard/product-options", {
        context,
        plantId,
        date,
        from,
        to,
        limit,
      }),
      () => runQuery(sql),
      CACHE_TTL.PRODUCT_OPTIONS,
    );

    res.json({
      data: rows.map((row) => ({
        productType: row.product_type ?? null,
        unit: row.unit_of_measurement ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof QueryValidationError) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
      return;
    }
    next(err);
  }
}

/**
 * POST /api/v1/dashboard/drill-aggregate — one page of a drill lens, rolled
 * up per grouping key server-side.
 *
 * The paginated drill tables need one result row per DISPLAYED row. Paging the
 * raw rows instead slices (machine, day) records, which splits a machine's
 * days across pages and shows a partial total on each. Returns
 * `{ data: [...] }` where every row is `{ ...groupKeys, actual_value,
 * threshold_value, unit_of_measurement }`.
 */
export async function postDrillAggregate(req, res, next) {
  try {
    const {
      context = {},
      parentFilters = {},
      date,
      from,
      to,
      kpiName,
      groupBy = [],
      limit,
      offset,
      plantId = "banmore",
    } = req.body ?? {};

    const sql = buildDrillAggregateQuery({
      plantId,
      context,
      parentFilters,
      date,
      from,
      to,
      kpiName,
      groupBy,
      limit,
      offset,
    });
    // Materializer-first read for the additive drill-aggregate. The
    // materializer's lookupDrillAggregate does the SUM rollup in JS;
    // when it answers, we still cache the SQL-shaped response so other
    // readers don't re-aggregate.
    const matRows = lookupDrillAggregate(req.body);
    const rows =
      matRows != null
        ? matRows
        : await cached(
            buildCacheKey("/dashboard/drill-aggregate", {
              plantId,
              context,
              parentFilters,
              date,
              from,
              to,
              kpiName,
              groupBy,
              limit,
              offset,
            }),
            () => runQuery(sql),
            CACHE_TTL.KPI_ROWS,
          );

    res.json({ data: rows });
  } catch (err) {
    if (err instanceof QueryValidationError) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
      return;
    }
    next(err);
  }
}

export async function postShiftComparison(req, res, next) {
  try {
    const {
      section,
      subSection = null,
      category,
      date,
      from,
      to,
      extraKpis = null,
      limit,
      plantId = "banmore",
    } = req.body ?? {};

    const sql = buildShiftComparisonQuery({
      plantId,
      section,
      subSection,
      category,
      date,
      from,
      to,
      extraKpis,
      limit,
    });
    const rows = await cached(
      buildCacheKey("/dashboard/shift-comparison", {
        plantId,
        section,
        subSection,
        category,
        date,
        from,
        to,
        extraKpis,
        limit,
      }),
      () => runQuery(sql),
      CACHE_TTL.KPI_ROWS,
    );

    res.json({ data: rows });
  } catch (err) {
    if (err instanceof QueryValidationError) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
      return;
    }
    next(err);
  }
}

/**
 * GET /api/v1/dashboard/anchors — new_change.md C6.
 *
 * One row per (section, kpi_name) carrying that KPI's own newest DAY date.
 * The frontend anchors each card to its own latest date instead of applying
 * one global "latest" (which comes from Production and blanks every OEE card,
 * since OEE lags by one to four days depending on section).
 */
export async function getAnchors(req, res, next) {
  try {
    const plantId = req.query.plantId ?? "banmore";
    const payload = await cached(`dashboard:anchors:${plantId}`, async () => {
      const toIso = (raw) => {
        const s = String(raw ?? "");
        return /^\d{8}$/.test(s)
          ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
          : null;
      };

      const [anchorRows, coverageRows] = await Promise.all([
        runQuery(buildLatestDateQuery({ plantId })),
        runQuery(buildShiftCoverageQuery({ plantId })),
      ]);

      // Keyed "section|kpi_name" for O(1) lookup by the card renderer.
      const anchors = {};
      for (const row of anchorRows) {
        const iso = toIso(row.latest_date);
        if (iso) anchors[`${row.section ?? ""}|${row.kpi_name ?? ""}`] = iso;
      }

      // C14 — the LATEST day of each section, when its shifts are incomplete.
      //
      // Scoped to the latest day deliberately. Incomplete shift coverage on an
      // older date means the data is missing, which is a different thing from
      // the day still running: Stock has such gaps going back to 2024, and
      // labelling those "in progress" would be wrong. Only the newest day can
      // legitimately still be filling up.
      const partialDays = {};
      for (const row of coverageRows) {
        const iso = toIso(row.day);
        const section = row.section ?? "";
        if (!iso || Number(row.shift_count) >= 3) continue;
        if (anchors[`${section}|Production`] !== iso) continue;
        partialDays[`${section}|${iso}`] = Number(row.shift_count);
      }

      return { anchors, partialDays };
    }, CACHE_TTL.ANCHORS);
    res.json({ data: payload });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/dashboard/vocab?plantId= — distinct vocabulary values for the
 * frontend picker allow-lists. Cached aggressively.
 *
 * Plant-scoped: every plant runs its own sections/sub-sections (CTP's Stock
 * has EBR / TDA / Super Assembly and no 4 Roll or Slitter; Banmore is the
 * reverse), so a picker built from one plant's list matches nothing at the
 * other and the section renders empty. `subSections` maps each section to the
 * sub-sections that plant actually records, which is what the Stock selector
 * is built from.
 */
export async function getVocab(req, res, next) {
  try {
    const plantId = normalizePlantId(req.query.plantId) ?? "banmore";
    const vocab = await cached(`dashboard:vocab:${plantId}`, async () => {
      const grab = (sql) =>
        runQuery(sql).then((rows) => rows.map((r) => Object.values(r)[0]));
      const table = plantSqlTable(plantId);
      const scope = plantDepartmentPredicate(plantId);
      const present = (col) =>
        `${col} IS NOT NULL AND ${col} != 'nan' AND ${col} != 'null' AND ${col} != ''`;

      const [sections, categories, granularities, tyreTypes, subSectionRows] =
        await Promise.all([
          grab(`SELECT DISTINCT section FROM ${table} WHERE ${scope} AND ${present("section")} ORDER BY section`),
          grab(`SELECT DISTINCT category FROM ${table} WHERE ${scope} AND ${present("category")} ORDER BY category`),
          grab(`SELECT DISTINCT granularity FROM ${table} WHERE ${scope} AND ${present("granularity")} ORDER BY granularity`),
          grab(`SELECT DISTINCT tyre_type FROM ${table} WHERE ${scope} AND ${present("tyre_type")} ORDER BY tyre_type`),
          runQuery(
            `SELECT DISTINCT section, sub_section FROM ${table} WHERE ${scope} AND ${present("section")} AND ${present("sub_section")} ORDER BY section, sub_section`,
          ),
        ]);

      const subSections = {};
      for (const row of subSectionRows) {
        const sub = canonicalizeSubSection(row.sub_section);
        const list = (subSections[row.section] ??= []);
        if (!list.includes(sub)) list.push(sub);
      }

      return { sections, categories, granularities, tyreTypes, subSections };
    }, CACHE_TTL.STATIC_LOOKUPS);
    res.json({ data: vocab });
  } catch (err) {
    next(err);
  }
}
