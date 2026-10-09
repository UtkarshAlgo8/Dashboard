/** Controllers for Quality Product's live Uniformity & Balancing KPI cards. */
import { CACHE_TTL, cached, buildCacheKey } from "../../utils/cache.js";
import { runQuery } from "../datasource/index.js";
import { resolveGranularity } from "../normalize.js";
import {
  isAllowedProductDrillKpi,
  productChildrenQuery,
  productSummaryQuery,
} from "../queries/product.queries.js";
import {
  toProductChildren,
  toProductSummary,
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
