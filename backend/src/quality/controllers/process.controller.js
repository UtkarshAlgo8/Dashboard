/**
 * Quality Process-tab controllers (Backend FRD §1).
 *
 * Same shape as Production's controllers: validate → build SQL → runQuery →
 * transform → `{ data }` envelope, with the TTL cache in front. The only
 * difference is `runQuery` comes from the Quality data-source switch, so
 * these endpoints are unchanged when Excel is swapped for the DB.
 *
 * Every response echoes the `context` object (FRD §0.9) — the frontend
 * resends what it last received plus one new selection, and we hand it back.
 */
import { CACHE_TTL, cached, buildCacheKey } from "../../utils/cache.js";
import { runQuery } from "../datasource/index.js";
import { resolveGranularity } from "../normalize.js";
import {
  kpiValueQuery,
  kpiValueBatchQuery,
  kpiChildrenQuery,
  kpiHistoryQuery,
} from "../queries/process.queries.js";
import {
  toKpiValue,
  toKpiValueBatch,
  toKpiChildren,
  toKpiHistory,
} from "../transformers/process.transformers.js";

function badRequest(res, message) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

/** Build the echoed context object from the request (FRD §0.9). */
function contextOf(query, extra = {}) {
  const keys = [
    "plant",
    "date",
    "date_from",
    "date_to",
    "granularity",
    "shift",
    "section",
    "machine",
    "recipe",
    "parameter",
    "kpi_name",
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

const PROCESS_SUMMARY_VALUE_KPIS = [
  "Plant_quality_rating_o",
  "Plan_Compliance_o",
  "Total_Violations_o",
];

const PROCESS_SUMMARY_CHILDREN = {
  pqr: ["Plant_quality_rating_s", "Total_Violations_s"],
  audit: ["Plan_Compliance_s"],
  mqv: [
    "Total_Violations_s",
    "Open_Violations_s",
    "Closed_Violation_s",
    "Violation_Closure_Rate_s",
  ],
};

/**
 * GET /quality/process/summary
 *   ?date= &granularity=|shift=
 *
 * One cached round-trip for the Quality Process landing cards and their first
 * section drill layer. Machine rows remain on-demand because they depend on a
 * selected section.
 */
export async function getProcessSummary(req, res, next) {
  try {
    const { date } = req.query;
    if (!date) return badRequest(res, "`date` is required.");
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }

    const key = buildCacheKey("/quality/process/summary", req.query);
    const summary = await cached(key, async () => {
      const [valueRows, ...childGroups] = await Promise.all([
        runQuery(
          kpiValueBatchQuery({
            kpiNames: PROCESS_SUMMARY_VALUE_KPIS,
            date,
            granularity,
          }),
        ),
        ...Object.entries(PROCESS_SUMMARY_CHILDREN).map(([id, kpiNames]) =>
          runQuery(kpiChildrenQuery({ kpiNames, date, granularity })).then(
            (rows) => [
              id,
              toKpiChildren(rows, { kpiNames, groupBy: "section" }),
            ],
          ),
        ),
      ]);

      return {
        values: toKpiValueBatch(valueRows, PROCESS_SUMMARY_VALUE_KPIS),
        children: Object.fromEntries(childGroups),
      };
    }, CACHE_TTL.QUALITY_PROCESS);

    res.json({ context: contextOf(req.query, { granularity }), ...summary });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/process/kpi-value
 *   ?kpi_name= &date= &granularity=|shift= [&section= &machine= &plant=]
 */
export async function getKpiValue(req, res, next) {
  try {
    const { kpi_name: kpiName, date, section, machine } = req.query;
    if (!kpiName || !date) {
      return badRequest(res, "`kpi_name` and `date` are required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }
    const key = buildCacheKey("/quality/process/kpi-value", req.query);
    const body = await cached(key, async () => {
      const rows = await runQuery(
        kpiValueQuery({ kpiName, date, granularity, section, machine }),
      );
      return toKpiValue(rows);
    }, CACHE_TTL.QUALITY_PROCESS);
    res.json({ context: contextOf(req.query, { granularity }), ...body });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/process/kpi-value-batch
 *   ?kpi_names=a,b,c &date= &granularity=|shift= [&section= &machine=]
 */
export async function getKpiValueBatch(req, res, next) {
  try {
    const kpiNames = parseNameList(req.query.kpi_names);
    const { date, section, machine } = req.query;
    if (kpiNames.length === 0 || !date) {
      return badRequest(res, "`kpi_names` and `date` are required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }
    const key = buildCacheKey("/quality/process/kpi-value-batch", req.query);
    const values = await cached(key, async () => {
      const rows = await runQuery(
        kpiValueBatchQuery({ kpiNames, date, granularity, section, machine }),
      );
      return toKpiValueBatch(rows, kpiNames);
    }, CACHE_TTL.QUALITY_PROCESS);
    res.json({ context: contextOf(req.query, { granularity }), values });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/process/kpi-children
 *   ?kpi_names=a,b &date= &granularity=|shift= [&section=]
 * Group dimension is machine when `section` is present, else section.
 */
export async function getKpiChildren(req, res, next) {
  try {
    const kpiNames = parseNameList(req.query.kpi_names);
    const { date, section } = req.query;
    if (kpiNames.length === 0 || !date) {
      return badRequest(res, "`kpi_names` and `date` are required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }
    const groupBy = section ? "machine" : "section";
    const key = buildCacheKey("/quality/process/kpi-children", req.query);
    const body = await cached(key, async () => {
      const rows = await runQuery(
        kpiChildrenQuery({ kpiNames, date, granularity, section }),
      );
      return toKpiChildren(rows, { kpiNames, groupBy });
    }, CACHE_TTL.QUALITY_PROCESS);
    res.json({ context: contextOf(req.query, { granularity }), ...body });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/process/kpi-history
 *   ?kpi_name= &date_from= &date_to= &granularity=|shift= [&section= &machine=]
 */
export async function getKpiHistory(req, res, next) {
  try {
    const {
      kpi_name: kpiName,
      date_from: from,
      date_to: to,
      section,
      machine,
    } = req.query;
    if (!kpiName || !from || !to) {
      return badRequest(res, "`kpi_name`, `date_from`, `date_to` are required.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }
    const key = buildCacheKey("/quality/process/kpi-history", req.query);
    const body = await cached(key, async () => {
      const rows = await runQuery(
        kpiHistoryQuery({ kpiName, from, to, granularity, section, machine }),
      );
      return toKpiHistory(rows);
    }, CACHE_TTL.QUALITY_PROCESS);
    res.json({ context: contextOf(req.query, { granularity }), ...body });
  } catch (err) {
    next(err);
  }
}
