/**
 * The intent enum the JK KPI Assistant accepts on POST /api/v1/chat.
 *
 * Mirrors the upstream ChatRequest schema verbatim (confirmed against its
 * live /openapi.json). Note the American spelling of "analyze" — the
 * upstream rejects "analyse" with a 422, so this list is the single source
 * of truth on the backend and must not be re-spelled for display.
 *
 * TODO(traceability): no FRS/US id exists for the intent selector yet.
 */
export const CHAT_INTENTS = Object.freeze([
  "query",
  "plot",
  "analyze",
  "report",
]);

export const DEFAULT_CHAT_INTENT = "query";

/**
 * @param {unknown} value
 * @returns {boolean} true when `value` is one of the four upstream intents.
 */
export function isChatIntent(value) {
  return typeof value === "string" && CHAT_INTENTS.includes(value);
}
