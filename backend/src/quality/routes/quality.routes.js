/**
 * Quality cross-family routes (Backend FRD §A). Mounted at /api/v1/quality
 * by app.js. These endpoints are family-agnostic — they don't belong to a
 * single tab (Process / SPC / …).
 */
import { Router } from "express";

import { getQualityAsOf } from "../controllers/quality.controller.js";

export const router = Router();

router.get("/as-of", getQualityAsOf);