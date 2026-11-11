/**
 * CTP Quality routes. app.js mounts `router` at /api/v1/quality/ctp/process
 * and `productRouter` at /api/v1/quality/ctp/product.
 */
import { Router } from "express";

import { getTabSummary, getTrend } from "./controller.js";
import { getSpcWorkspace } from "./spc.controller.js";

export const router = Router();
router.get("/summary", getTabSummary("process"));
router.get("/trend", getTrend);

export const productRouter = Router();
productRouter.get("/summary", getTabSummary("product"));
productRouter.get("/trend", getTrend);

export const spcRouter = Router();
spcRouter.get("/workspace", getSpcWorkspace);
