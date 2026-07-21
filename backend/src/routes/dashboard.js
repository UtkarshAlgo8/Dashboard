import { Router } from "express";
import { postFetch, getVocab } from "../controllers/dashboard.controller.js";

/** Mount at /api/v1/dashboard. */
export const router = Router();

// KPI + drill data for the dashboard. Named `kpi-data` (not the opaque
// `fetch`) so the endpoint is self-describing in the browser network tab.
router.post("/kpi-data", postFetch);
router.get("/vocab", getVocab);
