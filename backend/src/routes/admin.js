import { Router } from "express";
import { getCacheStats, postWarmNow } from "../controllers/admin.controller.js";

/**
 * Operational endpoints. Mount at /api/v1/admin.
 *   GET  /cache/stats — hit rate, driver, last warm cycle
 *   POST /cache/warm  — run a warm cycle now (loopback-only)
 */
export const router = Router();

router.get("/cache/stats", getCacheStats);
router.post("/cache/warm", postWarmNow);
