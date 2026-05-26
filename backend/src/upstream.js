import { config } from "./config.js";

/**
 * The ONE place that talks to the upstream gold_bi data API.
 * Holds the API key. No other module imports `process.env.AWS_DATA_API_KEY`
 * or hits the upstream URL directly.
 *
 * Upstream contract (confirmed 2026-05-26):
 *   POST <AWS_DATA_URL>
 *     headers: { x-api-key, content-type: application/json }
 *     body:    { sql: "<SELECT statement>", tables: ["<table-name>"] }
 *   response (success): JSON with either `body` (Lambda wrap) or a
 *                       direct payload. Caller-friendly shape is
 *                       `{ status: "OK"|"ERROR", rows: [...] }`.
 *   response (error):   { status: "ERROR", type, message }
 *
 * `runQuery(sql)` returns an array of rows (objects keyed by column
 * name) or throws an `UpstreamError` the route layer can convert
 * into a 502 envelope.
 */

export class UpstreamError extends Error {
  constructor(message, { type, status } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.type = type ?? "UPSTREAM_ERROR";
    this.status = status ?? 502;
  }
}

/**
 * Run one SQL SELECT against the upstream table.
 *
 * @param {string} sql - SELECT statement. The API rejects anything else.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function runQuery(sql) {
  if (typeof sql !== "string" || !/^\s*SELECT\b/i.test(sql)) {
    throw new UpstreamError("Only SELECT queries are allowed.", {
      type: "VALIDATION_ERROR",
      status: 400,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.upstream.timeoutMs,
  );

  let response;
  try {
    response = await fetch(config.upstream.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": config.upstream.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql,
        tables: [config.upstream.table],
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new UpstreamError(
        `Upstream timed out after ${config.upstream.timeoutMs}ms`,
        { type: "UPSTREAM_TIMEOUT", status: 504 },
      );
    }
    throw new UpstreamError(`Upstream request failed: ${err.message}`, {
      type: "UPSTREAM_NETWORK",
      status: 502,
    });
  }
  clearTimeout(timeout);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new UpstreamError("Upstream returned non-JSON response", {
      type: "UPSTREAM_INVALID_JSON",
      status: 502,
    });
  }

  // Lambda proxy integration sometimes nests the real payload inside `body`.
  if (payload && typeof payload === "object" && typeof payload.body === "string") {
    try {
      payload = JSON.parse(payload.body);
    } catch {
      throw new UpstreamError("Upstream `body` field was not valid JSON", {
        type: "UPSTREAM_INVALID_JSON",
        status: 502,
      });
    }
  }

  if (payload?.status === "ERROR") {
    throw new UpstreamError(payload.message ?? "Upstream error", {
      type: payload.type ?? "UPSTREAM_ERROR",
      status: response.status >= 400 ? response.status : 502,
    });
  }

  // Surface a few possible row containers — `rows`, `data`, or the raw
  // payload if it's an array. Keep this conservative; widen as we
  // learn what the upstream actually returns.
  const rows =
    payload?.rows ??
    payload?.data ??
    (Array.isArray(payload) ? payload : null);

  if (!Array.isArray(rows)) {
    throw new UpstreamError(
      "Upstream response had no recognisable `rows` array",
      { type: "UPSTREAM_SHAPE", status: 502 },
    );
  }

  return rows;
}
