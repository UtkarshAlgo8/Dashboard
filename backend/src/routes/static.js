import { Router } from "express";
import {
  getPlants,
  getFunctions,
  getSections,
  getCategoryTabs,
} from "../controllers/static.controller.js";

/**
 * Static lookup endpoints (unscoped). Mount at /api/v1.
 *   GET /plants /functions /sections /category-tabs
 */
export const router = Router();

router.get("/plants", getPlants);
router.get("/functions", getFunctions);
router.get("/sections", getSections);
router.get("/category-tabs", getCategoryTabs);
