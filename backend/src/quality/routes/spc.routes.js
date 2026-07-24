/**
 * Quality SPC routes (Backend FRD §2–§13). Mounted at /api/v1/quality/spc.
 */
import { Router } from "express";

import {
  getSpcSummary,
  getSpcFilterOptions,
  getSpcWidgets,
  getSpcDetail,
  getHistogramObservations,
  getPointObservations,
} from "../controllers/spc.controller.js";

export const router = Router();

router.get("/summary", getSpcSummary);
router.get("/filter-options", getSpcFilterOptions);
router.get("/widgets", getSpcWidgets);
router.get("/detail", getSpcDetail);
router.get("/histogram-observations", getHistogramObservations);
router.get("/point-observations", getPointObservations);
