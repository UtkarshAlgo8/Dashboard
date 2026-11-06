import { formatCompliancePeriod } from "./compliance.js";

export const SAFETY_PERIOD_HELP =
  "Safety supports a stored month, day, day shift, or a custom DAY range up to 366 days. Month/range shift combinations and YEAR are not supported; select All Shifts or a day.";

/** Independent of compliance's rate restrictions: custom counts are additive. */
export function safetyPeriod(selected, shift = "all") {
  if (!selected) return null;
  const letter = String(shift).toUpperCase();
  if (!["ALL", "A", "B", "C"].includes(letter)) return null;
  if (selected.from || selected.to) {
    if (
      !selected.from ||
      !selected.to ||
      selected.from > selected.to ||
      letter !== "ALL"
    )
      return null;
    const span =
      (Date.parse(selected.to) - Date.parse(selected.from)) / 86400000;
    if (!Number.isFinite(span) || span < 0 || span > 365) return null;
    return { from: selected.from, to: selected.to, granularity: "DAY" };
  }
  const { date, granularity = "DAY" } = selected;
  if (
    !date ||
    !["DAY", "MONTH", "SHIFT A", "SHIFT B", "SHIFT C"].includes(granularity)
  )
    return null;
  if (granularity === "MONTH")
    return letter === "ALL" && date.endsWith("-01")
      ? { date, granularity }
      : null;
  return {
    date,
    granularity: letter === "ALL" ? granularity : `SHIFT ${letter}`,
  };
}

/** A response must belong to exactly the requested period/type/page, never a prior selection. */
export function matchesSafetyContext(input, context) {
  if (context?.plant !== "Banmore") return false;
  const expected = {
    ...input,
    level: input.level ?? "overall",
    offset: input.offset ?? 0,
    limit: input.limit ?? 25,
  };
  return [
    "date",
    "from",
    "to",
    "granularity",
    "level",
    "type",
    "offset",
    "limit",
  ].every((key) => (expected[key] ?? null) === (context[key] ?? null));
}

export function safetyPeriodLabel(period) {
  return period?.from
    ? `${period.from} – ${period.to} · DAY`
    : formatCompliancePeriod(period);
}

/** Neutral count card: no target, threshold, progress/RAG or trend claims. */
export function safetyCard(result, { period, error, isLoading } = {}) {
  return {
    id: "safety",
    n: "Safety Observations",
    v: result?.value == null ? "—" : String(result.value),
    u: "NOS",
    status: null,
    target: null,
    presentationTone: "neutral",
    showProgress: false,
    showPeriodWhenEmpty: true,
    isLoading,
    drill: period ? "safety" : null,
    trendApi: false,
    periodLabel: safetyPeriodLabel(period),
    emptyReason: !period
      ? SAFETY_PERIOD_HELP
      : error
        ? "Safety source unavailable"
        : isLoading
          ? "Loading…"
          : "No published data for this period",
  };
}
