import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import {
  oeeDrillQuery,
  productionDrillQuery,
  downtimeDrillQuery,
  planComplianceDrillQuery,
  scrapTraceQuery,
} from "../queries/queries.js";
import {
  toOeeDrill,
  toProductionDrill,
  toDowntimeDrill,
  toPlanComplianceDrill,
  toScrapTrace,
} from "../utils/transformers.js";

// Parse a query-string integer, clamping to [min, max]; returns `fallback`
// when the value is missing or not a finite integer.
function clampInt(raw, fallback, min, max) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Send a 400 + return false when any required query param is missing.
function requireParams(res, params, names) {
  for (const n of names) {
    if (!params[n]) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Missing required query param: ${n}`,
        },
      });
      return false;
    }
  }
  return true;
}

export async function getOeeDrill(req, res, next) {
  if (!requireParams(res, req.query, ["section"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/oee`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = oeeDrillQuery({
        plant: req.params.plantId,
        section: req.query.section,
        granularity: req.query.granularity,
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
      });
      const rows = await runQuery(sql);
      return toOeeDrill(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getProductionDrill(req, res, next) {
  if (!requireParams(res, req.query, ["section"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/production`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = productionDrillQuery({
        plant: req.params.plantId,
        section: req.query.section,
        granularity: req.query.granularity,
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
      });
      const rows = await runQuery(sql);
      // Bucket by product_type so each section sees one bucket.
      const keyOf = (r) =>
        (r.product_type ?? "default").toLowerCase().replaceAll(/\s+/g, "-");
      return toProductionDrill(rows, { keyOf });
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getDowntimeDrill(req, res, next) {
  if (!requireParams(res, req.query, ["section"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/downtime`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = downtimeDrillQuery({
        plant: req.params.plantId,
        section: req.query.section,
        granularity: req.query.granularity,
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
      });
      const rows = await runQuery(sql);
      return toDowntimeDrill(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getPlanComplianceDrill(req, res, next) {
  if (!requireParams(res, req.query, ["section"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/plan-compliance`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = planComplianceDrillQuery({
        plant: req.params.plantId,
        section: req.query.section,
        granularity: req.query.granularity,
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
      });
      const rows = await runQuery(sql);
      return toPlanComplianceDrill(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getScrapTraceability(req, res, next) {
  const itemcode = req.query.itemCode ?? req.query.itemcode;
  if (!req.query.section || !req.query.machine || !itemcode) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message:
          "`section`, `machine`, and `itemCode` query params are required.",
      },
    });
    return;
  }
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/scrap-traceability`,
      { ...req.query, itemcode },
    );
    // Pagination: the UI requests one page of raw production-ID rows at a
    // time ("Load more"). Clamp limit to [1, 100] and offset to >= 0; bad or
    // missing values fall back to the first 100. limit/offset are part of
    // req.query, so they already vary the cache key above.
    const limit = clampInt(req.query.limit, 100, 1, 100);
    const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const data = await cached(key, async () => {
      const sql = scrapTraceQuery({
        plant: req.params.plantId,
        section: req.query.section,
        machine: req.query.machine,
        itemcode,
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
        limit,
        offset,
      });
      const rows = await runQuery(sql);
      return toScrapTrace(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
