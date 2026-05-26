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
    const key = buildCacheKey(`/plants/${req.params.plantId}/drills/oee`, req.query);
    const data = await cached(key, async () => {
      const sql = oeeDrillQuery({
        plant: "Banmore",
        section: req.query.section,
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
    const key = buildCacheKey(`/plants/${req.params.plantId}/drills/production`, req.query);
    const data = await cached(key, async () => {
      const sql = productionDrillQuery({
        plant: "Banmore",
        section: req.query.section,
        tyreType: req.query.tyreType ?? null,
        from: req.query.from,
        to: req.query.to,
      });
      const rows = await runQuery(sql);

      // Group key depends on the section. Mixing groups by compound
      // (master/final, derived from product_type until we have a
      // dedicated column); TBM and Curing group by product_type/family;
      // Stock uses the per-stockSelector category. The frontend's
      // ProductionDrillPanel reads `bucket[selectedKey]`.
      const keyOf =
        req.query.section === "mix"
          ? (r) => (r.product_type ?? "").toLowerCase().includes("master") ? "master" : "final"
          : (r) => (r.product_type ?? "default")
              .toLowerCase()
              .replaceAll(/\s+/g, "-");
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
    const key = buildCacheKey(`/plants/${req.params.plantId}/drills/downtime`, req.query);
    const data = await cached(key, async () => {
      const sql = downtimeDrillQuery({
        plant: "Banmore",
        section: req.query.section,
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
      `/plants/${req.params.plantId}/drills/plan-compliance`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = planComplianceDrillQuery({
        plant: "Banmore",
        section: req.query.section,
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

router.get("/scrap-trace", async (req, res, next) => {
  if (!required(res, req.query, ["section", "machine", "itemcode"])) return;
  try {
    const key = buildCacheKey(
      `/plants/${req.params.plantId}/drills/scrap-trace`,
      req.query,
    );
    const data = await cached(key, async () => {
      const sql = scrapTraceQuery({
        plant: "Banmore",
        section: req.query.section,
        machine: req.query.machine,
        itemcode: req.query.itemcode,
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
