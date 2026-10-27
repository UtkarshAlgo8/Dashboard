/**
 * CTP Quality — Process tab routes. Mounted at /api/v1/quality/ctp/process
 * by app.js.
 */
import { Router } from "express";

import {
  getProcessAsOf,
  getProcessSummary,
  getProcessTrend,
} from "./controller.js";

export const router = Router();

router.get("/summary", getProcessSummary);
router.get("/trend", getProcessTrend);
router.get("/as-of", getProcessAsOf);
