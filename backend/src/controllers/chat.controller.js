import { sendChatQuery, downloadChatResult } from "../utils/chatUpstream.js";

/**
 * POST /api/v1/chat — proxies a query to the JK KPI Assistant.
 * Returns the upstream ChatResponse as `{ data: ... }`.
 */
export async function postChat(req, res, next) {
  try {
    const { query, session_id } = req.body ?? {};

    if (typeof query !== "string" || !query.trim()) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "query is required" },
      });
      return;
    }
    if (typeof session_id !== "string" || !session_id.trim()) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "session_id is required" },
      });
      return;
    }

    const data = await sendChatQuery({ query, session_id });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/chat/download/:resultId — proxies a cached result fetch so
 * the frontend can build an Excel file from the full row set.
 * Returns the upstream DownloadResponse as `{ data: ... }`.
 */
export async function getDownload(req, res, next) {
  try {
    const { resultId } = req.params;
    if (typeof resultId !== "string" || !resultId.trim()) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "resultId is required" },
      });
      return;
    }

    const data = await downloadChatResult(resultId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
