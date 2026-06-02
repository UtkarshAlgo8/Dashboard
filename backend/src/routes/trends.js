import { Router } from "express";
import { getTrends } from "../controllers/trends.controller.js";

/** GET /plants/:plantId/production/trends */
export const router = Router({ mergeParams: true });

router.get("/", getTrends);
