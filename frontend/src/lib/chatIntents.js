import QuestionAnswerRoundedIcon from "@mui/icons-material/QuestionAnswerRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";

/**
 * The JK Agent intent selector.
 *
 * `value` is sent verbatim as ChatRequest.intent, so it must match the
 * upstream enum exactly — in particular "analyze" is the American spelling
 * upstream, and "analyse" is rejected with a 422. The slash command and the
 * wire value are deliberately the same string so there is no mapping layer
 * to keep in sync.
 *
 * "query" is the default and has no slash command: it is what you get by
 * just typing a question, matching the upstream's own default.
 *
 * TODO(traceability): no FRS/US id exists for the intent selector yet.
 *
 * @typedef {"query" | "plot" | "analyze" | "report"} ChatIntent
 */

export const DEFAULT_INTENT = "query";

/** @type {ReadonlyArray<{value: ChatIntent, command: string, label: string, description: string, Icon: unknown}>} */
export const CHAT_INTENTS = Object.freeze([
  {
    value: "query",
    command: "/query",
    label: "Query",
    description: "Answer from the plant data",
    Icon: QuestionAnswerRoundedIcon,
  },
  {
    value: "plot",
    command: "/plot",
    label: "Plot",
    description: "Chart the result",
    Icon: ShowChartRoundedIcon,
  },
  {
    value: "analyze",
    command: "/analyze",
    label: "Analyze",
    description: "Deep-dive analysis of the numbers",
    Icon: InsightsRoundedIcon,
  },
  {
    value: "report",
    command: "/report",
    label: "Report",
    description: "Generate a downloadable PDF report",
    Icon: DescriptionRoundedIcon,
  },
]);

/**
 * @param {string} value
 * @returns {{value: ChatIntent, command: string, label: string, description: string, Icon: unknown} | null}
 */
export function findIntent(value) {
  return CHAT_INTENTS.find((intent) => intent.value === value) ?? null;
}

/**
 * Matches the partial slash command the user has typed so far.
 * `"/"` matches everything; `"/pl"` narrows to /plot. Matching is
 * case-insensitive so "/Plot" still resolves.
 *
 * @param {string} token e.g. "/pl"
 * @returns {ReadonlyArray<object>}
 */
export function matchIntents(token) {
  const needle = token.toLowerCase();
  return CHAT_INTENTS.filter((intent) => intent.command.startsWith(needle));
}

/**
 * True when `text` is a slash command still being typed — i.e. the whole
 * input is a single token starting with "/" and no space has been typed
 * yet. Once the user types a space the command is either resolved into a
 * chip or treated as ordinary text.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isCommandToken(text) {
  return text.startsWith("/") && !/\s/.test(text);
}
