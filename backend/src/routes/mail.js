import { Router } from "express";
import { getPreview, postSend } from "../controllers/mail.controller.js";

/** Mount at /api/v1/mail. Report mail sent from the dashboard navbar. */
export const router = Router();

router.get("/scheduler-adherence/preview", getPreview);
router.post("/scheduler-adherence/send", postSend);
