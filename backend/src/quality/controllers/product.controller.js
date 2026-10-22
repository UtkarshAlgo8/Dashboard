/** Controllers for Quality Product's live Uniformity & Balancing KPI cards. */
import { CACHE_TTL, cached, buildCacheKey } from "../../utils/cache.js";
import { runQuery } from "../datasource/index.js";
import { resolveGranularity } from "../normalize.js";
import {
  isAllowedProductDrillKpi,
  isProductCardKpi,
  isUniformityTrendKpi,
  productChildrenQuery,
  productHistoryQuery,
  productSummaryQuery,
  uniformityTrendQuery,
} from "../queries/product.queries.js";
import {
  toProductChildren,
  toProductHistory,
  toProductSummary,
  toUniformityTrend,
} from "../transformers/product.transformers.js";

function badRequest(res, message) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function contextOf(query, granularity) {
  const context = { granularity };
  for (const key of ["plant", "date", "shift", "kpi_names"]) {
    if (query[key] != null && query[key] !== "") context[key] = query[key];
  }
  return context;
}

function parseNameList(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  return String(raw || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/** GET /quality/product/summary?date=&granularity=|shift= */
export async function getProductSummary(req, res, next) {
  try {
    const { date } = req.query;
    if (!date) return badRequest(res, "`date` is required.");
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }
    const key = buildCacheKey("/quality/product/summary", req.query);
    const body = await cached(
      key,
      async () => toProductSummary(await runQuery(productSummaryQuery({ date, granularity }))),
      CACHE_TTL.QUALITY_PROCESS,
    );
    res.json({ context: contextOf(req.query, granularity), ...body });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /quality/product/children?kpi_names=a,b&date=&granularity=|shift=
 *
 * The requested names are restricted to the canonical Product drill tree;
 * arbitrary Quality-family data cannot leak through this navigation endpoint.
 */
export async function getProductChildren(req, res, next) {
  try {
    const { date } = req.query;
    const kpiNames = parseNameList(req.query.kpi_names);
    if (!date || !kpiNames.length) {
      return badRequest(res, "`kpi_names` and `date` are required.");
    }
    if (kpiNames.some((name) => !isAllowedProductDrillKpi(name))) {
      return badRequest(res, "`kpi_names` contains a KPI outside the Product drill tree.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }
    const key = buildCacheKey("/quality/product/children", req.query);
    const body = await cached(
      key,
      async () =>
        toProductChildren(
          await runQuery(productChildrenQuery({ kpiNames, date, granularity })),
        ),
      CACHE_TTL.QUALITY_PROCESS,
    );
    res.json({ context: contextOf(req.query, granularity), ...body });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /quality/product/history?kpi_names=a,b&date_from=&date_to=&granularity=|shift=
 *
 * Card-level series feeding the Product sparklines and trend modal. Only the
 * canonical card KPIs are accepted, so drill rows cannot be read through it.
 */
export async function getProductHistory(req, res, next) {
  try {
    const { date_from: from, date_to: to } = req.query;
    const kpiNames = parseNameList(req.query.kpi_names);
    if (!from || !to || !kpiNames.length) {
      return badRequest(res, "`kpi_names`, `date_from` and `date_to` are required.");
    }
    if (kpiNames.some((name) => !isProductCardKpi(name))) {
      return badRequest(res, "`kpi_names` contains a KPI outside the Product cards.");
    }
    const granularity = resolveGranularity(req.query);
    if (!granularity) {
      return badRequest(res, `Unsupported granularity: ${req.query.granularity}`);
    }
    const key = buildCacheKey("/quality/product/history", req.query);
    const body = await cached(
      key,
      async () =>
        toProductHistory(
          await runQuery(productHistoryQuery({ kpiNames, from, to, granularity })),
          kpiNames,
        ),
      CACHE_TTL.QUALITY_PROCESS,
    );
    res.json({ context: contextOf(req.query, granularity), ...body });
  } catch (error) {
    next(error);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /quality/product/uniformity-trend
 *   ?kpi_names=a,b&rows=plant|machine&granularities=SHIFT A,SHIFT B
 *   &date_from=&date_to=
 *
 * Unaggregated rows for the Uniformity & Balancing trend modal. Only the
 * Uniformity trend KPIs are accepted.
 */
export async function getUniformityTrend(req, res, next) {
  try {
    const { date_from: from, date_to: to } = req.query;
    const kpiNames = parseNameList(req.query.kpi_names);
    const rowScope = req.query.rows === "machine" ? "machine" : "plant";
    if (!kpiNames.length || !ISO_DATE.test(from ?? "") || !ISO_DATE.test(to ?? "")) {
      return badRequest(res, "`kpi_names`, `date_from` and `date_to` (yyyy-mm-dd) are required.");
    }
    if (kpiNames.some((name) => !isUniformityTrendKpi(name))) {
      return badRequest(res, "`kpi_names` contains a KPI outside the Uniformity trend.");
    }
    const granularities = [];
    for (const raw of parseNameList(req.query.granularities)) {
      const g = resolveGranularity({ granularity: raw });
      if (!g) return badRequest(res, `Unsupported granularity: ${raw}`);
      if (!granularities.includes(g)) granularities.push(g);
    }
    if (!granularities.length) {
      return badRequest(res, "`granularities` is required.");
    }
    const key = buildCacheKey("/quality/product/uniformity-trend", req.query);
    const body = await cached(
      key,
      async () =>
        toUniformityTrend(
          await runQuery(
            uniformityTrendQuery({ kpiNames, rowScope, granularities, from, to }),
          ),
        ),
      CACHE_TTL.QUALITY_PROCESS,
    );
    res.json({
      context: { kpi_names: kpiNames, rows: rowScope, granularities, from, to },
      ...body,
    });
  } catch (error) {
    next(error);
  }
}
