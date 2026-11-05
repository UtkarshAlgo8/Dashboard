/** Quality Product tab routes. Mounted at /api/v1/quality/product. */
import { Router } from "express";

import {
  getProductChildren,
  getProductHistory,
  getProductSummary,
  getUniformityTrend,
} from "../controllers/product.controller.js";

import { uniformityHandler } from "../uniformity/controller.js";

export const router = Router();

// BTP-only, selected-level reads. The existing Product mount supplies JWT auth.
router.get("/uniformity/gold", uniformityHandler("gold"));
router.get("/uniformity/barcodes", uniformityHandler("barcodes"));
router.get("/uniformity/points", uniformityHandler("points"));

router.get("/summary", getProductSummary);
router.get("/children", getProductChildren);
router.get("/history", getProductHistory);
router.get("/uniformity-trend", getUniformityTrend);
