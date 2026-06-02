import { Router } from "express";
import { getAnomalies } from "../controllers/anomalies.controller.js";

/** GET /plants/:plantId/anomalies */
export const router = Router({ mergeParams: true });

router.get("/", getAnomalies);
