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
export function presetToDateRange(timeRange, asOf = null) {
  if (!timeRange) {
    return { granularity: null, from: null, to: null, mode: "snapshot" };
  }
  const { preset, from, to } = timeRange;

  // Explicit custom range wins — aggregate Daily rows per spec.
  if (from && to) {
    return { granularity: "Daily", from, to, mode: "aggregate" };
  }

  // Anchor to the as-of date when known; otherwise the system clock.
  const anchor = parseIso(asOf) ?? new Date();
  const today = toIso(anchor);

  if (preset === "today") {
    // A short trailing window so the sparkline still has a few points;
    // the headline reads the latest Daily row (the as-of day).
    return {
      granularity: "Daily",
      from: shift(anchor, -7),
      to: today,
      mode: "snapshot",
    };
  }

  if (preset === "month") {
    // The window IS the month-to-date period: 1st of the as-of month → as-of.
    return {
      granularity: "MTD",
      from: toIso(startOfMonth(anchor)),
      to: today,
      mode: "snapshot",
    };
  }

  if (preset === "year") {
    // The window IS the year-to-date period: Jan 1 of the as-of year → as-of.
    return {
      granularity: "YTD",
      from: toIso(startOfYear(anchor)),
      to: today,
      mode: "snapshot",
    };
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
