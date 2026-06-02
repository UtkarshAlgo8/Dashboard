import { Router } from "express";
import { postFetch, getVocab } from "../controllers/dashboard.controller.js";

/** Mount at /api/v1/dashboard. */
export const router = Router();

router.post("/fetch", postFetch);
router.get("/vocab", getVocab);
