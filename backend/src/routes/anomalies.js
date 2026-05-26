import { Router } from "express";

export const router = Router({ mergeParams: true });

/**
 * Anomalies strip — disabled in Phase 1.
 *
 * Original plan was to filter `status = 'Red'` rows from gold_bi
 * and surface those as anomalies. The 2026-05-26 PM call took
 * `status` out of scope, so this endpoint has no upstream signal
 * to work from.
 *
 * Returning an empty array keeps the frontend's anomalies strip
 * happy (it renders nothing when the array is empty). When you
 * tell us how to spot an anomaly in gold_bi (a dedicated kpi_name?
 * a column we haven't seen yet?), wire it here.
 */
router.get("/", (_req, res) => {
  res.json({ data: [] });
});
