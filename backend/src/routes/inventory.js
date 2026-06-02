import { Router } from "express";
import { getInventory } from "../controllers/inventory.controller.js";

/** GET /plants/:plantId/inventory */
export const router = Router({ mergeParams: true });

router.get("/", getInventory);
