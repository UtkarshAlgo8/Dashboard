import { Router } from "express";
import { getLiveRunningSkus } from "../controllers/live-running-skus.controller.js";
import {
  postDrillAggregate,
  postFetch,
  postProductOptions,
  postShiftComparison,
  getVocab,
  getAnchors,
} from "../controllers/dashboard.controller.js";

/** Mount at /api/v1/dashboard. */
export const router = Router();

// KPI + drill data for the dashboard. Named `kpi-data` (not the opaque
// `fetch`) so the endpoint is self-describing in the browser network tab.
router.post("/kpi-data", postFetch);
router.post("/product-options", postProductOptions);
// One page of a drill lens, grouped server-side so a page of N rows is N
// machines/SKUs with complete totals — not N raw (machine, day) records.
router.post("/drill-aggregate", postDrillAggregate);
router.post("/shift-comparison", postShiftComparison);
router.get("/vocab", getVocab);
// new_change.md C6: per-KPI latest DAY date, so each card anchors to its own
// newest data instead of one global date that blanks the lagging OEE cards.
router.get("/anchors", getAnchors);
// Live Silver data uses its own rolling window, independent of header dates.
router.get("/live-running-skus", getLiveRunningSkus);
