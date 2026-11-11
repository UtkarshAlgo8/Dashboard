import { Router } from "express";
import {
  getInventory,
  getCtpInventoryMaster,
  getOverage,
} from "../controllers/inventory.controller.js";

import {
  getLiveOverageSummary,
  getLiveOverageItems,
  getLiveOverageBarcodes,
} from "../controllers/overage-live.controller.js";

/**
 * GET /plants/:plantId/inventory          legacy groups/history payload
 * GET /plants/:plantId/inventory/master   CTP sections/.../lots payload
 * GET /plants/:plantId/inventory/overage  legacy Gold totals + SKUs
 * GET /plants/:plantId/inventory/overage/summary   shared live six-area summary
 * GET /plants/:plantId/inventory/overage/items     lazy section item page
 * GET /plants/:plantId/inventory/overage/barcodes  lazy item barcode page
 */
export const router = Router({ mergeParams: true });

router.get("/", getInventory);
router.get("/master", getCtpInventoryMaster);
router.get("/overage", getOverage); // legacy Gold contract; no longer used by Technical
router.get("/overage/summary", getLiveOverageSummary);
router.get("/overage/items", getLiveOverageItems);
router.get("/overage/barcodes", getLiveOverageBarcodes);
