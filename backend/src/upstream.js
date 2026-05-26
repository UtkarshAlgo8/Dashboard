import { config } from "./config.js";

/**
 * The ONE place that talks to the upstream gold_dummy data API.
 * Holds the API key. No other module imports the upstream env vars
 * or hits the upstream URL directly.
 *
 * Upstream contract (confirmed via Postman 2026-05-26):
 *   POST <AWS_DATA_URL>
 *     headers: { x-api-key, content-type: application/json }
 *     body:    { sql: "<SELECT or WITH statement>", tables: ["gold_dummy"] }
 *   response (success): { "columns": [...], "rows": [...] }
 *     `rows` may be objects-keyed-by-column-name OR positional arrays;
 *     we zip with `columns` if positional.
 *   response (error):   { status: "ERROR", type, message }
 *
 * `runQuery(sql)` returns an array of row-objects or throws an
 * UpstreamError that the route layer converts to a 502/504 envelope.
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
 * Run one read query against the upstream.
 *
 * @param {string} sql - Must start with SELECT or WITH.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function runQuery(sql) {
  // Read-only guard. SELECT or WITH (CTE) at the top is OK; anything
  // else gets rejected here before we hit the wire. Defence-in-depth:
  // the upstream Lambda has the same check.
  if (typeof sql !== "string" || !/^\s*(SELECT|WITH)\b/i.test(sql)) {
    throw new UpstreamError("Only SELECT / WITH queries are allowed.", {
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

  // Some integrations nest the real payload inside `body` (Lambda proxy
  // integration default). Unwrap if present.
  if (
    payload &&
    typeof payload === "object" &&
    typeof payload.body === "string"
  ) {
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

  const rawRows =
    payload?.rows ??
    payload?.data ??
    (Array.isArray(payload) ? payload : null);

  if (!Array.isArray(rawRows)) {
    throw new UpstreamError(
      "Upstream response had no recognisable `rows` array",
      { type: "UPSTREAM_SHAPE", status: 502 },
    );
  }

  // If rows are positional arrays AND we have a columns list, zip
  // into row-objects so downstream transformers see one consistent
  // shape regardless of which encoding the Lambda picked.
  if (
    Array.isArray(payload?.columns) &&
    rawRows.length > 0 &&
    Array.isArray(rawRows[0])
  ) {
    return rawRows.map((row) => {
      const obj = {};
      for (let i = 0; i < payload.columns.length; i++) {
        obj[payload.columns[i]] = row[i];
      }
      return obj;
    });
  }

  return rawRows;
}
