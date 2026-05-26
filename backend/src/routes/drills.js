import { Router } from "express";
import { cached, buildCacheKey } from "../cache.js";
import { runQuery } from "../upstream.js";
import {
  oeeDrillQuery,
  productionDrillQuery,
  downtimeDrillQuery,
  planComplianceDrillQuery,
  scrapTraceQuery,
} from "../queries.js";
import {
  toOeeDrill,
  toProductionDrill,
  toDowntimeDrill,
  toPlanComplianceDrill,
  toScrapTrace,
} from "../transformers.js";

export const router = Router({ mergeParams: true });

const required = (res, params, names) => {
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
};

router.get("/oee", async (req, res, next) => {
  if (!required(res, req.query, ["section"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/oee`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = oeeDrillQuery({
        plant: "Banmore",
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
});

router.get("/production", async (req, res, next) => {
  if (!required(res, req.query, ["section"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/production`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = productionDrillQuery({
        plant: "Banmore",
        section: req.query.section,
        granularity: req.query.granularity,
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
      });
      const rows = await runQuery(sql);

      // Section → bucket key. Confirmed from filter screenshots:
      //   Mixing  → product_type = "Compound"  (master/final lives inside the row)
      //   TBM     → product_type = "Green Tyre"
      //   Curing  → product_type = "Cured Tyre"
      //   Stock   → product_type = "Stock Component"
      //
      // Frontend's ProductionDrillPanel toggles between master/final
      // (Mixing) or tyre family (TBM/Cur/Stock) using its category
      // sub-selector. Until that mapping is concrete in the data,
      // bucket by product_type so each section sees one bucket.
      const keyOf = (r) =>
        (r.product_type ?? "default").toLowerCase().replaceAll(/\s+/g, "-");
      return toProductionDrill(rows, { keyOf });
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get("/downtime", async (req, res, next) => {
  if (!required(res, req.query, ["section"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/downtime`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = downtimeDrillQuery({
        plant: "Banmore",
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
});

router.get("/plan-compliance", async (req, res, next) => {
  if (!required(res, req.query, ["section"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/production/drills/plan-compliance`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = planComplianceDrillQuery({
        plant: "Banmore",
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
});

router.get("/scrap-traceability", async (req, res, next) => {
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
    const data = await cached(key, async () => {
      const sql = scrapTraceQuery({
        plant: "Banmore",
        section: req.query.section,
        machine: req.query.machine,
        itemcode,
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
      });
      const rows = await runQuery(sql);
      return toScrapTrace(rows);
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
