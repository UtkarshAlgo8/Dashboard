import { Router } from "express";
import {
  postChat,
  getDownload,
  getReportPdf,
} from "../controllers/chat.controller.js";

/** Mount at /api/v1/chat. Proxies the JK KPI Assistant (chatbot) service. */
export const router = Router();

router.post("/", postChat);
router.get("/download/:resultId", getDownload);
router.get("/report/:reportId/pdf", getReportPdf);
