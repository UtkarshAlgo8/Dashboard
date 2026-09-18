/**
 * Engineering Reliability-tab controllers (spec 16/17: Overview +
 * Reliability tabs).
 *
 * Same shape as Quality's controllers: validate → build SQL → runQuery →
 * transform → `{ context, ... }` envelope, with the TTL cache in front.
 * `runQuery` comes from the Engineering data-source switch, so these
 * endpoints are unchanged when Excel is swapped for the DB.
 */
import { CACHE_TTL, cached, buildCacheKey } from "../../utils/cache.js";
import { runQuery } from "../datasource/index.js";
import { resolveGranularity } from "../normalize.js";
import {
  kpiValueBatchQuery,
  kpiChildrenQuery,
  kpiHistoryQuery,
  latestDateQuery,
  latestCompleteDateQuery,
  componentAggregateQuery,
  lossTreeRangeQuery,
} from "../queries/reliability.queries.js";
import {
  toKpiValueBatch,
  toKpiChildren,
  toLossTree,
  toKpiHistory,
  toLatestDate,
  toAggregatedSummary,
} from "../transformers/reliability.transformers.js";

function badRequest(res, message) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

/** Build the echoed context object from the request. */
function contextOf(query, extra = {}) {
  const keys = [
    "plant",
    "date",
    "date_from",
    "date_to",
    "granularity",
    "status",
    "section",
    "machine",
    "sub_section",
    "product_type",
    "kpi_name",
    "kpi_names",
    "group_by",
  ];
  const ctx = {};
  for (const k of keys) {
    if (query[k] != null && query[k] !== "") ctx[k] = query[k];
  }
  return { ...ctx, ...extra };
}

/** Parse a comma-separated `kpi_names` list into a trimmed array. */
function parseNameList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Overview/Reliability summary cards: Breakdown %, Breakdown Minutes, MTBF,
// MTTR at the Overall (no-dim) level, in one round trip.
const SUMMARY_KPIS = [
  "Breakdown_Pct_Overall",
  "BreakdownMin_Overall",
  "MTBF_Overall",
  "MTTR_Overall",
];

// Loss Tree L1 (pie): the 5 loss categories, summed across ALL status +
// section rows and grouped by product_type (the category name lives there,
// not in `remarks`, at this level — confirmed against the real workbook).
const LOSS_TREE_L1_KPIS = ["LostTime_LossCategory", "Occurrences_LossCategory"];

/**
 * GET /engineering/reliability/summary
 *   ?date= &granularity=(MONTH|DAY, default MONTH)
 *
 * One cached round-trip for the 4 Overview/Reliability summary cards.
 */
export async function getSummary(req, res, next) {
  try {
    const { date, date_from: from, date_to: to } = req.query;
    const isRange = Boolean(from && to);
    if (!date && !isRange) {
      return badRequest(res, "`date`, or `date_from` + `date_to`, is required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }

    const key = buildCacheKey("/engineering/reliability/summary", req.query);
    const values = await cached(
      key,
      async () => {
        // A period is REBUILT from the machine-level components: MTBF/MTTR/
        // Breakdown % are rates, so the stored daily `_Overall` values cannot
        // be summed or averaged into a month. A single date keeps reading the
        // published `_Overall` row, which is what the drill levels reconcile
        // against.
        if (isRange) {
          const rows = await runQuery(componentAggregateQuery({ from, to }));
          return toAggregatedSummary(rows);
        }
        const rows = await runQuery(
          kpiValueBatchQuery({ kpiNames: SUMMARY_KPIS, date, granularity }),
        );
        return toKpiValueBatch(rows, SUMMARY_KPIS);
      },
      CACHE_TTL.ENGINEERING_RELIABILITY,
    );

    res.json({ context: contextOf(req.query, { granularity }), values });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /engineering/reliability/kpi-children
 *   ?kpi_names=a,b &date= &granularity= &group_by=
 *   [&date_from= &date_to=]
 *   [&status= &section= &machine= &sub_section= &product_type=]
 *   [&sort= &order=asc|desc &limit=] [&agg=sum]
 *
 * `group_by` is one dimension, or a comma-separated tuple ("remarks,date")
 * for a level keyed by more than one — with `date_from`/`date_to` and
 * `granularity=DAY`, that is the date-wise Failure level.
 *
 * The ONE generic drill endpoint — every level of Breakdown %/Min, MTBF,
 * MTTR, Top Machine Breakdowns, Zero Breakdown Machines, and Loss Tree
 * (levels 2-4) goes through this, varying only kpi_names/scope/group_by.
 * `agg=sum` switches from the default JOIN-by-group transform to Loss
 * Tree's SUM-by-group transform (status/section are never pinned there).
 */
export async function getKpiChildren(req, res, next) {
  try {
    const kpiNames = parseNameList(req.query.kpi_names);
    const {
      date,
      date_from: from,
      date_to: to,
      status,
      section,
      machine,
      sub_section: subSection,
      product_type: productType,
      group_by: groupBy,
      sort,
      order,
      limit,
      agg,
    } = req.query;
    if (kpiNames.length === 0 || !date || !groupBy) {
      return badRequest(res, "`kpi_names`, `date`, and `group_by` are required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }

    const key = buildCacheKey("/engineering/reliability/kpi-children", req.query);
    const body = await cached(
      key,
      async () => {
        const rows = await runQuery(
          kpiChildrenQuery({
            kpiNames,
            date,
            // Optional window: `date_from`/`date_to` widen the level from one
            // published date to every published date in the range — the
            // date-wise Failure level's `granularity=DAY` over a month.
            from,
            to,
            granularity,
            status,
            section,
            machine,
            subSection,
            productType,
          }),
        );
        const result =
          agg === "sum"
            ? toLossTree(rows, { kpiNames, groupBy })
            : toKpiChildren(rows, { kpiNames, groupBy });

        if (sort) {
          const dir = order === "asc" ? 1 : -1;
          result.rows = [...result.rows].sort((a, b) => {
            const av = a[sort];
            const bv = b[sort];
            if (av == null && bv == null) return 0;
            if (av == null) return 1; // nulls last regardless of direction
            if (bv == null) return -1;
            return (av - bv) * dir;
          });
        }
        if (limit) {
          result.rows = result.rows.slice(0, Number(limit));
        }
        return result;
      },
      CACHE_TTL.ENGINEERING_RELIABILITY,
    );

    res.json({ context: contextOf(req.query, { granularity }), ...body });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /engineering/reliability/kpi-history
 *   ?kpi_name= &date_from= &date_to= &granularity=
 *   [&status= &section= &machine= &sub_section=]
 */
export async function getKpiHistory(req, res, next) {
  try {
    const {
      kpi_name: kpiName,
      date_from: from,
      date_to: to,
      status,
      section,
      machine,
      sub_section: subSection,
    } = req.query;
    if (!kpiName || !from || !to) {
      return badRequest(res, "`kpi_name`, `date_from`, `date_to` are required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }

    const key = buildCacheKey("/engineering/reliability/kpi-history", req.query);
    const body = await cached(
      key,
      async () => {
        const rows = await runQuery(
          kpiHistoryQuery({
            kpiName,
            from,
            to,
            granularity,
            status,
            section,
            machine,
            subSection,
          }),
        );
        return toKpiHistory(rows);
      },
      CACHE_TTL.ENGINEERING_RELIABILITY,
    );

    res.json({ context: contextOf(req.query, { granularity }), ...body });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /engineering/reliability/latest-date
 *   ?kpi_name= &granularity= (defaults per resolveGranularity's mode-aware
 *   default when omitted — DAY under db, MONTH under excel)
 */
export async function getLatestDate(req, res, next) {
  try {
    const { kpi_name: kpiName } = req.query;
    // `kpi_names` (plural) asks for the latest date on which EVERY listed KPI
    // has a value — the page's default report period, which must not land on
    // a partially-published day. `kpi_name` (singular) keeps the one-KPI
    // lookup the Zero-Breakdown panels use.
    const kpiNames = parseNameList(req.query.kpi_names);
    if (!kpiName && kpiNames.length === 0) {
      return badRequest(res, "`kpi_name` or `kpi_names` is required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }

    const key = buildCacheKey("/engineering/reliability/latest-date", req.query);
    const body = await cached(
      key,
      async () => {
        const rows = await runQuery(
          kpiNames.length > 0
            ? latestCompleteDateQuery({ kpiNames, granularity })
            : latestDateQuery({ kpiName, granularity }),
        );
        return toLatestDate(rows);
      },
      CACHE_TTL.ENGINEERING_RELIABILITY,
    );

    res.json({ context: contextOf(req.query, { granularity }), ...body });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /engineering/reliability/loss-tree
 *   ?date= &granularity=
 *
 * Loss Tree L1 (pie): the 5 loss categories in one call, summed across ALL
 * status/section rows and grouped by product_type.
 */
export async function getLossTree(req, res, next) {
  try {
    const { date, date_from: from, date_to: to } = req.query;
    const isRange = Boolean(from && to);
    if (!date && !isRange) {
      return badRequest(res, "`date`, or `date_from` + `date_to`, is required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }

    const key = buildCacheKey("/engineering/reliability/loss-tree", req.query);
    const body = await cached(
      key,
      async () => {
        // Lost time and occurrences are additive, so a period needs no
        // recomputation — the same SUM-by-group transform covers both the
        // single-day and the multi-day row set.
        const rows = await runQuery(
          isRange
            ? lossTreeRangeQuery({ kpiNames: LOSS_TREE_L1_KPIS, from, to })
            : kpiChildrenQuery({ kpiNames: LOSS_TREE_L1_KPIS, date, granularity }),
        );
        return toLossTree(rows, {
          kpiNames: LOSS_TREE_L1_KPIS,
          groupBy: "product_type",
        });
      },
      CACHE_TTL.ENGINEERING_RELIABILITY,
    );

    res.json({ context: contextOf(req.query, { granularity }), ...body });
  } catch (err) {
    next(err);
  }
}
