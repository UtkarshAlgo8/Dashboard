import { Router } from "express";
import { postSnapshot } from "../controllers/snapshot.controller.js";

/** Mount at /api/v1/dashboard alongside the existing dashboard router. */
export const router = Router();

router.post("/snapshot", postSnapshot);