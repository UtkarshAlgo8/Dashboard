/**
 * Engineering Reliability-tab routes (spec 16/17: Overview + Reliability).
 * Mounted at /api/v1/engineering/reliability by app.js.
 */
import { Router } from "express";

import {
  getSummary,
  getKpiChildren,
  getKpiHistory,
  getLatestDate,
  getLossTree,
  getZeroBreakdownCount,
} from "../controllers/reliability.controller.js";

export const router = Router();

router.get("/summary", getSummary);
router.get("/kpi-children", getKpiChildren);
router.get("/kpi-history", getKpiHistory);
router.get("/latest-date", getLatestDate);
router.get("/loss-tree", getLossTree);
router.get("/zero-breakdown-count", getZeroBreakdownCount);
