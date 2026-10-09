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
 *     today  → snapshot @ DAY     (latest day's value)
 *     month  → snapshot @ MONTH   (the selected month's pre-aggregated row)
 *     year   → snapshot @ YTD     (latest year-to-date value)
 *     custom → aggregate @ DAY    (let transformer roll Daily per spec)
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

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "yyyy-MM" key for a Date. */
function monthKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The as-of month key (the default-selected month), e.g. "2026-06". */
export function asOfMonthKey(asOf = null) {
  return monthKeyOf(parseIso(asOf) ?? new Date());
}

/**
 * The list of selectable months for the header dropdown: `count` months
 * ending at (and including) the as-of month, newest first.
 * @returns {{ key: string, label: string }[]}
 */
export function buildMonthOptions(asOf = null, count = 12) {
  const anchor = parseIso(asOf) ?? new Date();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(
      anchor.getFullYear(),
      anchor.getMonth() - i,
      1,
      12,
      0,
      0,
    );
    out.push({
      key: monthKeyOf(d),
      label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return out;
}

/**
 * "yyyy-MM" -> { from: "yyyy-MM-01", to: "yyyy-MM-<last>" }, the calendar
 * window for a month picked from the header dropdown. Callers that talk to
 * an endpoint taking only from/to (the landing page's /plants) use this
 * instead of presetToDateRange, which also carries granularity/mode.
 * Returns null for anything that isn't a month key.
 */
export function monthKeyToRange(monthKey) {
  const anchor = parseMonthKey(monthKey);
  if (!anchor) return null;
  return { from: toIso(startOfMonth(anchor)), to: toIso(endOfMonth(anchor)) };
}

/** The system clock's local calendar date, ISO yyyy-mm-dd. */
export function todayIso() {
  return toIso(new Date());
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
    // The user can pin a specific month via the header's month dropdown
    // (timeRange.month = "yyyy-MM"); with none chosen we default to the
    // as-of month. The window is that month's 1st → its end, except the
    // as-of month itself, which is month-TO-DATE (1st → as-of).
    //
    // We read the pre-aggregated MONTH row (mode "snapshot", granularity
    // MONTH) rather than rolling the month's DAY rows up client-side.
    //
    // Why: for RATE KPIs the two disagree, and only the MONTH row is
    // defensible. Averaging DAY rows counts an idle day as a literal 0 and
    // drags the month down — Mixing machine 0201 in Aug-2026 reads
    // Availability 50.01 as a DAY average (two zero-production days) against
    // 84.53 in the MONTH row. The ETL's monthly rollup excludes those days,
    // and that judgement cannot be reconstructed on the client. OEE differs
    // for a second, subtler reason: the MONTH row is computed from monthly
    // A x P x Q, which is not the mean of the daily OEE values. Additive
    // KPIs (Production) agree exactly either way, so nothing regresses there.
    //
    // The window still pins the CHOSEN month — the regression that reverted
    // an earlier attempt at this. Every MONTH row is dated the 1st of its
    // month (verified across all 124 section/KPI pairs), so a 1st -> month-end
    // window selects exactly one month's rows and the card can no longer show
    // "the latest month regardless" of the dropdown.
    //
    // No card loses coverage by switching: for every (section, kpi_name)
    // that backs a card, the months carrying MONTH rows are a superset of
    // those carrying DAY rows. The only DAY-without-MONTH gaps in the gold
    // table are the plant-level rows (section NULL: OEE_p and the plant
    // loss reasons), and the plant summary card reads its own endpoint
    // (getPlantSummary, from/to only) rather than this granularity.
    //
    // A month's rows also drop from thousands to ~9, well under the row cap.
    const monthAnchor = parseMonthKey(timeRange.month) ?? startOfMonth(anchor);
    const isAsOfMonth =
      monthAnchor.getFullYear() === anchor.getFullYear() &&
      monthAnchor.getMonth() === anchor.getMonth();
    return {
      granularity: MONTH_GRAN,
      from: toIso(startOfMonth(monthAnchor)),
      to: isAsOfMonth ? today : toIso(endOfMonth(monthAnchor)),
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

function endOfMonth(d) {
  // Day 0 of the next month == last day of this month.
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0);
}

/** "yyyy-MM" → a Date at local noon on the 1st of that month, else null. */
function parseMonthKey(key) {
  if (typeof key !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1, 12, 0, 0);
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
