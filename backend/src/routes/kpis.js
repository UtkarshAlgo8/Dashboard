import { Router } from "express";
import { getKpis } from "../controllers/kpis.controller.js";

/** GET /plants/:plantId/production/kpis */
export const router = Router({ mergeParams: true });

router.get("/", getKpis);
