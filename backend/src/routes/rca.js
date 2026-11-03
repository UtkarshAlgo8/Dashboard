import { Router } from "express";
import { postPdf } from "../controllers/rca.controller.js";

/** Mount at /api/v1/rca. RCA Why-Why form exports. */
export const router = Router();

router.post("/pdf", postPdf);
