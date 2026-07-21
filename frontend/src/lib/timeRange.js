/**
 * Convert a TimeRangeSelect state ({preset, from, to}) into the shape
 * the dashboard fetch expects:
 *   { granularity, from, to, mode }
 *
 * Why granularity + mode:
 *   gold_dummy stores PRE-AGGREGATED rows at Daily / Shift A-C / MTD /
 *   YTD granularity per spec §9. Naïvely summing Daily rows client-side
 *   is wrong because:
 *     (a) the upstream Lambda caps each query at 5000 rows, so for a
 *         multi-month range we silently drop data and undercount SUM
 *         KPIs by 2–3×.
 *     (b) MULT (OEE) and SNAP (NCM_Hold) aren't additive — the
 *         pre-stored MTD/YTD value is the only correct one.
 *
 *   So presets map to "snapshot" mode (take the latest pre-aggregated
 *   row's actual_value verbatim) at the appropriate granularity:
 *
 *     today  → snapshot @ Daily   (latest day's value)
 *     month  → snapshot @ MTD     (latest month-to-date value)
 *     year   → snapshot @ YTD     (latest year-to-date value)
 *     custom → aggregate @ Daily  (let transformer roll Daily per spec)
 *
 *   The trailing 7-day from/to window keeps the fetch under the 5000-row
 *   cap while reliably catching the most recent snapshot.
 *
 * As-of anchoring (BRD §13.5): the window is anchored to the latest
 * AVAILABLE data date (`asOf`, ISO yyyy-mm-dd), NOT the system clock.
 * When the calendar runs ahead of the data (e.g. today is June but the
 * data ends mid-May), a system-clock window would slide past every row
 * and the dashboard would go blank. Callers pass the backend-provided
 * as-of date; we fall back to `new Date()` only when it is unknown.
 */
// realdata.md §3: real granularities are DAY / MONTH / SHIFT A-C. There is
// no YTD data yet, so Year is disabled behind a single flag (mirrors the
// backend ENABLE_YEAR). Flip to true + set YEAR_GRANULARITY when yearly data
// arrives — Year then behaves like Month at the yearly granularity.
export const ENABLE_YEAR = false;
const DAY_GRAN = "DAY";
const MONTH_GRAN = "MONTH";
const YEAR_GRANULARITY = "YTD";

/**
 * new_change.md C1: normalize an incoming date to the ISO `yyyy-mm-dd` the
 * gold `date` column stores. The picker can emit a full ISO timestamp
 * ("2026-07-01T00:00:00.000Z"), which the backend rejects as a bad date
 * format — strip the time component before it ever reaches the payload.
 * Also accepts dd-mm-yyyy. Anything else → null (send no date at all
 * rather than a value that fails validation).
 */
export function normalizeDateInput(value) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  const base = t.includes("T") ? t.slice(0, t.indexOf("T")) : t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return base;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(base);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * new_change.md C1: build the date part of a kpi-data payload. When a
 * range is active the payload carries from/to and MUST NOT also carry a
 * single `date` — the backend gives the single date absolute priority and
 * would silently discard the range. Send one or the other, never both.
 */
export function buildDatePayload({ date = null, from = null, to = null } = {}) {
  const f = normalizeDateInput(from);
  const t = normalizeDateInput(to);
  if (f || t) {
    // Range wins; the stale single date is dropped entirely.
    return { ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) };
  }
  const d = normalizeDateInput(date);
  return d ? { date: d } : {};
}

export function presetToDateRange(timeRange, asOf = null) {
  if (!timeRange) {
    return { granularity: null, from: null, to: null, mode: "snapshot" };
  }
  const { preset, from, to } = timeRange;

  // Explicit custom range wins — aggregate DAY rows per spec.
  if (from && to) {
    const f = normalizeDateInput(from) ?? from;
    const t = normalizeDateInput(to) ?? to;
    // new_change.md C5: from == to is a SINGLE DAY — that day's value
    // verbatim, no aggregation, for every KPI class.
    return {
      granularity: DAY_GRAN,
      from: f,
      to: t,
      mode: f === t ? "snapshot" : "aggregate",
    };
  }

  // Anchor to the as-of date when known; otherwise the system clock.
  const anchor = parseIso(asOf) ?? new Date();
  const today = toIso(anchor);

  if (preset === "today") {
    // A short trailing window so the sparkline still has a few points;
    // the headline reads the latest DAY row (the as-of day).
    return {
      granularity: DAY_GRAN,
      from: shift(anchor, -7),
      to: today,
      mode: "snapshot",
    };
  }

  if (preset === "month") {
    // The window IS the month-to-date period: 1st of the as-of month → as-of.
    return {
      granularity: MONTH_GRAN,
      from: toIso(startOfMonth(anchor)),
      to: today,
      mode: "snapshot",
    };
  }

  if (preset === "year") {
    // Year/YTD is disabled (realdata.md §3) — no yearly data yet. When
    // ENABLE_YEAR is on it behaves like Month at the yearly granularity;
    // until then a stale Year selection resolves to a null granularity, which
    // the backend now defaults to DAY (new_change.md C2). It used to mean "no
    // granularity predicate", i.e. every zoom level at once — a silent
    // 2x-3.21x over-count. Defaulting to DAY is the safe fallback.
    if (ENABLE_YEAR) {
      return {
        granularity: YEAR_GRANULARITY,
        from: toIso(startOfYear(anchor)),
        to: today,
        mode: "snapshot",
      };
    }
    return { granularity: null, from: null, to: null, mode: "snapshot" };
  }

  return { granularity: null, from: null, to: null, mode: "snapshot" };
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
}

function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1, 12, 0, 0);
}

function parseIso(iso) {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  // Construct at local noon so the -7 day shift never crosses a DST/UTC
  // boundary back into the previous calendar day.
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function toIso(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function shift(now, days) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return toIso(d);
}
