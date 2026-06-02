import { Router } from "express";
import {
  getOeeDrill,
  getProductionDrill,
  getDowntimeDrill,
  getPlanComplianceDrill,
  getScrapTraceability,
} from "../controllers/drills.controller.js";

/** GET /plants/:plantId/production/drills/* */
export const router = Router({ mergeParams: true });

router.get("/oee", getOeeDrill);
router.get("/production", getProductionDrill);
router.get("/downtime", getDowntimeDrill);
router.get("/plan-compliance", getPlanComplianceDrill);
router.get("/scrap-traceability", getScrapTraceability);
