import { cached, buildCacheKey } from "../utils/cache.js";
import { config } from "../config.js";
import { runQuery } from "../utils/upstream.js";
import {
  buildFetchQuery,
  buildLatestDateQuery,
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

    const cacheKey = buildCacheKey("/dashboard/kpi-data", {
      context,
      plantId,
      date,
      from,
      to,
      drillKpis,
      parentFilters,
      limit,
      offset,
      drillOnly,
    });
    const rows = await cached(cacheKey, () => runQuery(sql));

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
          parentFilters,
          limit: effectiveLimit + 1,
          offset,
          drillOnly,
        });
        const baselineRows = await cached(
          buildCacheKey("/dashboard/kpi-data:baseline", { context, plantId, window, drillKpis, parentFilters, limit, offset, drillOnly }),
          () => runQuery(baselineSql),
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
    });
    res.json({ data: payload });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/dashboard/vocab — distinct vocabulary values for the
 * frontend picker allow-lists. Cached aggressively.
 */
export async function getVocab(_req, res, next) {
  try {
    const vocab = await cached("dashboard:vocab", async () => {
      const grab = (sql) =>
        runQuery(sql).then((rows) => rows.map((r) => Object.values(r)[0]));
      const table = config.upstream.sqlTable;

      const [sections, categories, granularities, tyreTypes] = await Promise.all([
        grab(`SELECT DISTINCT section FROM ${table} WHERE section IS NOT NULL AND section != 'nan' AND section != '' ORDER BY section`),
        grab(`SELECT DISTINCT category FROM ${table} WHERE category IS NOT NULL AND category != 'nan' AND category != '' ORDER BY category`),
        grab(`SELECT DISTINCT granularity FROM ${table} WHERE granularity IS NOT NULL AND granularity != 'nan' AND granularity != '' ORDER BY granularity`),
        grab(`SELECT DISTINCT tyre_type FROM ${table} WHERE tyre_type IS NOT NULL AND tyre_type != 'nan' AND tyre_type != '' ORDER BY tyre_type`),
      ]);

      return { sections, categories, granularities, tyreTypes };
    });
    res.json({ data: vocab });
  } catch (err) {
    next(err);
  }
}
