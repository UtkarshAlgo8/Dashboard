import { config } from "../config.js";

/**
 * The ONE place that talks to the JK KPI Assistant (chatbot) service.
 * No other module imports `config.chatUpstream` or hits its URL directly.
 *
 * Upstream contract (confirmed via its live /openapi.json):
 *   POST {url}/api/v1/chat
 *     body: { query: string, session_id: string }
 *     response: ChatResponse — session_id, final_answer, execution_error,
 *       current_kpi_family, generated_sql, result_id, row_count, columns,
 *       preview_rows, is_large_result, download_available, wants_plot,
 *       plot_spec. Any field may be null.
 *   GET {url}/api/v1/download/{result_id}
 *     response: DownloadResponse — { result_id, row_count, columns, rows }
 *
 * Both calls return the upstream JSON body verbatim on success; failures
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

async function callUpstream(path, options) {
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
 * @param {{ query: string, session_id: string }} params
 * @returns {Promise<object>} ChatResponse
 */
export function sendChatQuery({ query, session_id }) {
  return callUpstream("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, session_id }),
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
