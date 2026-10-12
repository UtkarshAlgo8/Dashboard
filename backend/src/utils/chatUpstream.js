import { config } from "../config.js";

/**
 * The ONE place that talks to the JK KPI Assistant (chatbot) service.
 * No other module imports `config.chatUpstream` or hits its URL directly.
 *
 * Upstream contract (confirmed via its live /openapi.json):
 *   POST {url}/api/v1/chat
 *     body: { session_id: string, intent?: ChatIntent, query: string }
 *       `intent` is one of query|plot|analyze|report|spc — see chatIntents.js
 *       for why the American spelling of "analyze" is load-bearing. The
 *       upstream defaults it to "query" when omitted, so older clients
 *       keep working unchanged.
 *     response: ChatResponse — session_id, intent, final_answer,
 *       execution_error, current_kpi_family, generated_sql, result_id,
 *       row_count, is_large_result, download_available, wants_plot,
 *       plot_spec, report_id, report_type, report_available. Any field
 *       may be null.
 *
 *       NOTE: this build of the upstream no longer returns `columns` or
 *       `preview_rows` — verified against the live service, not just its
 *       spec. Anything that needs the actual rows, INCLUDING plotting a
 *       `plot_spec`, must fetch them from /download/{result_id}.
 *   GET {url}/api/v1/download/{result_id}
 *     response: DownloadResponse — { result_id, row_count, columns, rows }
 *   GET {url}/api/v1/download/{report_id}/pdf
 *     response: a binary PDF, NOT JSON — see downloadReportPdf below.
 *
 * The JSON calls return the upstream body verbatim on success; failures
 * throw an UpstreamError the route layer converts to a 502/504 envelope.
 */

export class ChatUpstreamError extends Error {
  constructor(message, { type, status } = {}) {
    super(message);
    this.name = "ChatUpstreamError";
    this.type = type ?? "CHAT_UPSTREAM_ERROR";
    this.status = status ?? 502;
  }
}

/**
 * Performs the upstream request and returns the raw Response. Shared by the
 * JSON helpers and the binary PDF fetch, so timeout and network-failure
 * handling stay in exactly one place.
 */
async function fetchUpstream(path, options) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.chatUpstream.timeoutMs,
  );

  let response;
  try {
    response = await fetch(`${config.chatUpstream.url}${path}`, {
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new ChatUpstreamError(
        `JK Agent upstream timed out after ${config.chatUpstream.timeoutMs}ms`,
        { type: "UPSTREAM_TIMEOUT", status: 504 },
      );
    }
    throw new ChatUpstreamError(`JK Agent upstream request failed: ${err.message}`, {
      type: "UPSTREAM_NETWORK",
      status: 502,
    });
  }
  clearTimeout(timeout);
  return response;
}

async function callUpstream(path, options) {
  const response = await fetchUpstream(path, options);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ChatUpstreamError("JK Agent upstream returned non-JSON response", {
      type: "UPSTREAM_INVALID_JSON",
      status: 502,
    });
  }

  if (!response.ok) {
    throw new ChatUpstreamError(
      payload?.detail?.[0]?.msg ?? payload?.message ?? "JK Agent upstream error",
      { type: "UPSTREAM_ERROR", status: response.status },
    );
  }

  return payload;
}

/**
 * @param {{ query: string, session_id: string, intent: string }} params
 * @returns {Promise<object>} ChatResponse
 */
export function sendChatQuery({ query, session_id, intent }) {
  return callUpstream("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, intent, query }),
  });
}

/**
 * @param {string} resultId
 * @returns {Promise<object>} DownloadResponse
 */
export function downloadChatResult(resultId) {
  return callUpstream(`/api/v1/download/${encodeURIComponent(resultId)}`, {
    method: "GET",
  });
}

/**
 * Fetches a generated report PDF. Unlike every other upstream call this one
 * answers with binary, so it cannot go through `callUpstream` — the body is
 * returned as a Buffer for the controller to stream on.
 *
 * A failed request still answers JSON (FastAPI's validation envelope), so
 * the error path decodes text rather than assuming a PDF came back.
 *
 * @param {string} reportId
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function downloadReportPdf(reportId) {
  const response = await fetchUpstream(
    `/api/v1/download/${encodeURIComponent(reportId)}/pdf`,
    { method: "GET" },
  );

  if (!response.ok) {
    let message = "JK Agent report download failed";
    try {
      const body = await response.json();
      message = body?.detail?.[0]?.msg ?? body?.message ?? message;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new ChatUpstreamError(message, {
      type: "UPSTREAM_ERROR",
      status: response.status,
    });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get("content-type") ?? "application/pdf",
  };
}
