import {
  sendChatQuery,
  downloadChatResult,
  downloadReportPdf,
} from "../utils/chatUpstream.js";
import {
  CHAT_INTENTS,
  DEFAULT_CHAT_INTENT,
  isChatIntent,
} from "../utils/chatIntents.js";

/**
 * POST /api/v1/chat — proxies a query to the JK KPI Assistant.
 * Returns the upstream ChatResponse as `{ data: ... }`.
 *
 * `intent` is optional and defaults to "query"; anything outside the known
 * values is rejected here rather than forwarded, so a typo surfaces
 * as a readable 400 instead of the upstream's 422 validation envelope.
 */
export async function postChat(req, res, next) {
  try {
    const { query, session_id, intent } = req.body ?? {};

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
    if (intent !== undefined && intent !== null && !isChatIntent(intent)) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `intent must be one of: ${CHAT_INTENTS.join(", ")}`,
        },
      });
      return;
    }

    const data = await sendChatQuery({
      query,
      session_id,
      intent: intent ?? DEFAULT_CHAT_INTENT,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/chat/download/:resultId — proxies a cached result fetch so
 * the frontend can build a CSV file from the full row set.
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

/**
 * GET /api/v1/chat/report/:reportId/pdf — streams a generated report PDF.
 *
 * This is the one chat endpoint that does not answer with the `{ data }`
 * envelope: the body is the PDF itself. The route stays behind the same
 * auth gate as the rest, which is why the browser fetches it through the
 * API client as a blob instead of pointing an <a href> at it — a plain
 * link would carry no Authorization header.
 */
export async function getReportPdf(req, res, next) {
  try {
    const { reportId } = req.params;
    if (typeof reportId !== "string" || !reportId.trim()) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "reportId is required" },
      });
      return;
    }

    const { buffer, contentType } = await downloadReportPdf(reportId);
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="jk-agent-report-${reportId}.pdf"`,
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}
