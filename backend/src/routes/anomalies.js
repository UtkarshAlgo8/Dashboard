import { Router } from "express";

export const router = Router({ mergeParams: true });

/**
 * Anomalies strip — stubbed to [] in Phase 1.
 *
 * The original CR-06 plan was to filter `status = 'Red'` rows. PM
 * scope call (2026-05-26) took `status` out of scope; without it
 * there's no upstream signal. Returning [] keeps the frontend's
 * empty state happy.
 */
router.get("/", (_req, res) => {
  res.json({ data: [] });
});
