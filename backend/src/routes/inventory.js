import { Router } from "express";
import { getInventory, getCtpInventoryMaster } from "../controllers/inventory.controller.js";

/**
 * GET /plants/:plantId/inventory          legacy groups/history payload
 * GET /plants/:plantId/inventory/master   CTP sections/.../lots payload
 */
export const router = Router({ mergeParams: true });

router.get("/", getInventory);
router.get("/master", getCtpInventoryMaster);
