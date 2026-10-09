/**
 * Resolve the Engineering header's time-range state into the one reporting
 * period every Engineering section reads.
 *
 *   past month (dropdown)     → that month's published MONTH row
 *   "Today"                   → today's DAY row
 *   custom range, one day     → that DAY row
 *   custom range, whole month → that month's MONTH row (it IS the rollup)
 *   any other custom range    → `kind: "range"` with from/to, DAY grain
 *   default / "This Month" / an incomplete range → the current month
 *
 * A whole-month or single-day range is collapsed onto its published row
 * rather than rebuilt: MTBF/MTTR/Breakdown % are rates, and the published
 * row is the upstream rollup every drill level reconciles against. Only a
 * genuinely arbitrary window takes the range path.
 *
 * Pure, so the page passes the IST clock in rather than reading it here.
 */
import { normalizeDateInput } from "./timeRange.js";

/** "2026-09-01" → "2026-09-30" (last calendar day of that month). */
function lastDayOfMonth(isoDate) {
  const [y, m] = isoDate.split("-").map(Number);
  // Day 0 of the NEXT month is the last day of this one.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${isoDate.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** True when [from, to] covers exactly one whole calendar month. */
function isWholeMonth(from, to) {
  return from.endsWith("-01") && to === lastDayOfMonth(from);
}

/**
 * @param {{ preset?: string|null, month?: string|null, from?: string, to?: string }} timeRange
 * @param {{ today: string, currentMonth: string }} clock ISO dates; `currentMonth` is the 1st.
 * @returns {{ kind: "day"|"month"|"range", date: string, granularity: "DAY"|"MONTH", from?: string, to?: string }}
 */
export function resolveEngineeringPeriod(timeRange, { today, currentMonth }) {
  const preset = timeRange?.preset ?? null;
  const monthKey = timeRange?.month ?? null;

  // A past month picked from the header dropdown. The CURRENT month falls
  // through to the default, so it reads the same however it was reached.
  if (monthKey && `${monthKey.slice(0, 7)}-01` !== currentMonth) {
    return {
      kind: "month",
      date: `${monthKey.slice(0, 7)}-01`,
      granularity: "MONTH",
    };
  }

  if (preset === "today") {
    return { kind: "day", date: today, granularity: "DAY" };
  }

  // Custom range: the header clears `preset` when the dialog applies a range.
  const rawFrom = normalizeDateInput(timeRange?.from);
  const rawTo = normalizeDateInput(timeRange?.to);
  if (!preset && rawFrom && rawTo) {
    // ISO strings sort chronologically; a reversed pick still means a window.
    const [from, to] = rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom];
    if (from === to) {
      return { kind: "day", date: from, granularity: "DAY" };
    }
    if (isWholeMonth(from, to)) {
      return { kind: "month", date: from, granularity: "MONTH" };
    }
    return { kind: "range", date: from, granularity: "DAY", from, to };
  }

  return { kind: "month", date: currentMonth, granularity: "MONTH" };
}

/**
 * The date part of a summary / Loss Tree request for a resolved period:
 * a single published `date` at its grain, or a from/to window. Never both —
 * the window is what tells the backend to rebuild the period.
 *
 * @param {{ kind: string, date: string, granularity: string, from?: string, to?: string }} period
 * @returns {{ date?: string, from?: string, to?: string, granularity: string }}
 */
export function periodRequestParams(period) {
  if (period.kind === "range") {
    return { from: period.from, to: period.to, granularity: "DAY" };
  }
  return { date: period.date, granularity: period.granularity };
}
