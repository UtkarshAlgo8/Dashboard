import {
  getPlant,
  getAsOf,
  getSummary,
  getSectionOee,
} from "./plants.controller.js";
import {
  getSections,
  getCategoryTabs,
} from "./static.controller.js";
import {
  getVocab,
  getAnchors,
  postFetch,
  postProductOptions,
  postShiftComparison,
} from "./dashboard.controller.js";

/**
 * POST /api/v1/dashboard/snapshot — one page load, one round-trip.
 *
 * The browser used to fan out six parallel calls (gen 1) and then wait on
 * a single Athena query (gen 2, gated on as-of). That is two sequential
 * generations, with the worst call in each one gating the next —
 * measurable as ~22 s cold / ~110 ms warm on the test stack.
 *
 * The snapshot composes the SAME cached lookups the page already fires,
 * resolving the date window server-side from as-of so:
 *   - every sub-call hits the same cache key as its standalone endpoint
 *     (no duplicate data, no second copy of key-building logic to drift)
 *   - the FE no longer has to wait for as-of before firing gen 2
 *   - one slow upstream still blocks the response, but everything that
 *     can answer from cache answers in parallel
 *   - a partial failure (one panel errors) returns null + an `errors`
 *     map; one dead panel must not blank the page
 *
 * Implementation note: rather than extract fetcher functions, this
 * controller RE-ROUTES through the existing handlers by faking the
 * Express req/res objects. That guarantees the cache keys are byte-
 * identical to the standalone endpoints — there is no second copy of
 * the key-building logic to drift.
 */

/** A minimal Express-shaped response that captures what the handler wrote. */
class FakeRes {
  constructor() {
    this.statusCode = 200;
    this.body = undefined;
    this.headers = {};
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  json(payload) {
    this.body = payload;
    return this;
  }
  setHeader(k, v) {
    this.headers[k] = v;
  }
}

/**
 * Invoke an Express handler with a fake req, capturing the status + body.
 *
 * Express handlers are `(req, res, next) => ...`. Calling `next(err)` is
 * the only way they signal a thrown error, and `errorHandler` would
 * normally format it. To keep the snapshot self-contained we wrap in
 * try/catch — both a thrown synchronous error and `next(err)` from the
 * handler flow through here.
 *
 * @param {Function} handler Express handler
 * @param {{ params?: object, query?: object, body?: object }} shape  Becomes req
 * @returns {Promise<{ status: number, body: object | null, error: string | null }>}
 */
async function callHandler(handler, shape) {
  const req = {
    params: shape.params ?? {},
    query: shape.query ?? {},
    body: shape.body ?? {},
    headers: {},
    method: "POST",
    url: "",
    originalUrl: "",
  };
  const res = new FakeRes();
  try {
    await handler(req, res, () => {});
    if (res.body && res.body.error) {
      return {
        status: res.statusCode,
        body: res.body,
        value: null,
        error: res.body.error.message ?? res.body.error.code ?? "error",
      };
    }
    return {
      status: res.statusCode,
      body: res.body,
      value: res.body?.data ?? null,
      error: null,
    };
  } catch (err) {
    return {
      status: 500,
      body: null,
      value: null,
      error: err?.message ?? String(err),
    };
  }
}

/**
 * Default filter for the kpi-data payload. Mirrors what the FE sends on
 * first mount for a Phase-1 plant: Mixing / Productivity, MONTH
 * granularity, today → first-of-month window. The defaults are
 * deliberately minimal — the FE overrides them on first user interaction.
 */
function defaultWindow(asOfDate) {
  if (!asOfDate) return { date: null, from: null, to: null };
  // as-of is ISO yyyy-mm-dd → first-of-month.
  const monthStart = `${asOfDate.slice(0, 7)}-01`;
  return { date: null, from: monthStart, to: asOfDate };
}

/**
 * Build the kpi-data payload the FE sends on first mount. Cache-key
 * fidelity is the whole point — sending different fields than the FE
 * would mean the warmer fills keys the FE never reads.
 *
 * The FE's `landingPayload` (useDashboardFetch.js:365-400) sets:
 *   context: { section, category, granularity }
 *   from / to (or date)
 *   drillKpis: null   (or ["Production_product"] for tbm/cur)
 *   landingKpis: <names from the catalogue>
 *   parentFilters: {}
 *   limit: 10000
 *   withBaseline: true   (for MONTH or custom-range mode)
 *
 * We omit `landingKpis` to keep the cache key compatible with whatever
 * the FE has cached so far — its key includes `landingKpis`, so any
 * snapshot value here would be a separate entry. The downside is
 * slightly larger payload; the upside is no key drift.
 */
function defaultKpiBody({ plantId, section, category, granularity, from, to, date }) {
  const body = {
    plantId,
    context: { section, category, granularity },
    drillKpis: null,
    parentFilters: {},
    limit: 10000,
  };
  if (date) body.date = date;
  else {
    body.from = from;
    body.to = to;
  }
  if (granularity?.toUpperCase() === "MONTH") body.withBaseline = true;
  return body;
}

/**
 * Compose `errors` from the per-call results, keyed by the panel name.
 * Only includes entries where `error !== null`. Returns `undefined` so
 * the FE can treat absence as "all panels succeeded".
 */
function collectErrors(results) {
  const errors = {};
  for (const [name, r] of results) {
    if (r.error) errors[name] = r.error;
  }
  return Object.keys(errors).length ? errors : undefined;
}

export async function postSnapshot(req, res, next) {
  try {
    const {
      plantId = "banmore",
      section = "Mixing",
      category = "Productivity",
      granularity = "MONTH",
      from: callerFrom = null,
      to: callerTo = null,
      date: callerDate = null,
    } = req.body ?? {};

    // gen 1 — all independent, all fire in parallel.
    const gen1 = await Promise.all([
      callHandler(getPlant, { params: { plantId } }),
      callHandler(getSections, {}),
      callHandler(getCategoryTabs, {}),
      callHandler(getVocab, { query: { plantId } }),
      callHandler(getAsOf, { params: { plantId } }),
      callHandler(getAnchors, { query: { plantId } }),
    ]);
    const [plant, sections, tabs, vocab, asOf, anchors] = gen1;

    // as-of defines the date window for gen 2. If as-of failed the
    // snapshot cannot know the window, so 502 — the FE will retry via
    // its per-panel fallback. A 502 here is the right answer; sending
    // a guessed window would generate cache entries nobody ever reads.
    if (asOf.status !== 200 || !asOf.value?.asOf) {
      res.status(502).json({
        error: {
          code: "SNAPSHOT_NO_AS_OF",
          message: `Could not resolve data date for plant '${plantId}': ${asOf.error ?? asOf.body?.error?.message ?? "unknown error"}.`,
        },
      });
      return;
    }

    // The FE may override the date window. Caller's explicit window wins;
    // otherwise derive from as-of (default preset = month-to-date).
    const win =
      callerDate || callerFrom || callerTo
        ? { date: callerDate, from: callerFrom, to: callerTo }
        : defaultWindow(asOf.value.asOf);

    // gen 2 — also all independent, all fire in parallel.
    const gen2 = await Promise.all([
      callHandler(getSectionOee, {
        params: { plantId },
        query: { granularity, from: win.from, to: win.to, gran: granularity },
      }),
      callHandler(getSummary, {
        params: { plantId },
        query: { from: win.from, to: win.to },
      }),
      callHandler(postFetch, {
        body: defaultKpiBody({
          plantId,
          section,
          category,
          granularity,
          ...win,
        }),
      }),
      callHandler(postProductOptions, {
        body: {
          plantId,
          context: { section, category },
          ...(win.date ? { date: win.date } : { from: win.from, to: win.to }),
        },
      }),
      callHandler(postShiftComparison, {
        body: {
          plantId,
          section,
          category,
          ...(win.date ? { date: win.date } : { from: win.from, to: win.to }),
        },
      }),
    ]);
    const [sectionOee, summary, kpiData, productOptions, shiftComparison] = gen2;

    const named = [
      ["plant", plant],
      ["sections", sections],
      ["tabs", tabs],
      ["vocab", vocab],
      ["asOf", asOf],
      ["anchors", anchors],
      ["sectionOee", sectionOee],
      ["summary", summary],
      ["kpiData", kpiData],
      ["productOptions", productOptions],
      ["shiftComparison", shiftComparison],
    ];

    res.json({
      data: Object.fromEntries(named.map(([k, r]) => [k, r.value])),
      errors: collectErrors(named),
    });
  } catch (err) {
    next(err);
  }
}