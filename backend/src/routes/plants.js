import { Router } from "express";
import {
  getPlant,
  getSummary,
  getAsOf,
  getSectionOee,
} from "../controllers/plants.controller.js";

/**
 * Plant-scoped endpoints. Mount at /api/v1/plants.
 *   GET /:id /:id/summary /:id/as-of /:id/section-oee
 */
export const router = Router();

router.get("/:plantId", getPlant);
router.get("/:plantId/summary", getSummary);
router.get("/:plantId/as-of", getAsOf);
router.get("/:plantId/section-oee", getSectionOee);
