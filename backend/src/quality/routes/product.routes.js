/** Quality Product tab routes. Mounted at /api/v1/quality/product. */
import { Router } from "express";

import {
  getProductChildren,
  getProductSummary,
} from "../controllers/product.controller.js";

export const router = Router();

router.get("/summary", getProductSummary);
router.get("/children", getProductChildren);
