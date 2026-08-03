/**
 * Quality Process-tab routes (Backend FRD §1). Mounted at
 * /api/v1/quality/process by app.js.
 */
import { Router } from "express";

import {
  getKpiValue,
  getKpiValueBatch,
  getKpiChildren,
  getKpiHistory,
  getProcessSummary,
} from "../controllers/process.controller.js";

export const router = Router();

router.get("/kpi-value", getKpiValue);
router.get("/kpi-value-batch", getKpiValueBatch);
router.get("/kpi-children", getKpiChildren);
router.get("/kpi-history", getKpiHistory);
router.get("/summary", getProcessSummary);
