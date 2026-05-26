import { Router } from "express";

export const router = Router({ mergeParams: true });

/**
 * Inventory endpoint — stubbed to [] in Phase 1.
 *
 * gold_dummy doesn't carry an Inventory category yet (PM, 2026-05-27 —
 * "Inventory data I will tell later, not added yet"). The Inventory
 * tab in the category bar is also disabled in static.js. Wire this
 * up when the data lands by replicating the kpis.js pattern with
 * `category = 'Inventory'`.
 */
router.get("/", (_req, res) => {
  res.json({ data: [] });
});
