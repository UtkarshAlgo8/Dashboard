import { Router } from "express";
import {
  getInventory,
  getCtpInventoryMaster,
  getOverage,
} from "../controllers/inventory.controller.js";

/**
 * GET /plants/:plantId/inventory          legacy groups/history payload
 * GET /plants/:plantId/inventory/master   CTP sections/.../lots payload
 * GET /plants/:plantId/inventory/overage  Overage Material totals + SKUs
 */
export const router = Router({ mergeParams: true });

router.get("/", getInventory);
router.get("/master", getCtpInventoryMaster);
router.get("/overage", getOverage);
