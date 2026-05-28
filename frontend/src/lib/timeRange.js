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
 * `now()` is injectable for tests.
 */
export function presetToDateRange(timeRange, now = new Date()) {
  if (!timeRange) {
    return { granularity: null, from: null, to: null, mode: "snapshot" };
  }
  const { preset, from, to } = timeRange;

  // Explicit custom range wins — aggregate Daily rows per spec.
  if (from && to) {
    return { granularity: "Daily", from, to, mode: "aggregate" };
  }

  const today = toIso(now);

  if (preset === "today") {
    return {
      granularity: "Daily",
      from: shift(now, -7),
      to: today,
      mode: "snapshot",
    };
  }

  if (preset === "month") {
    return {
      granularity: "MTD",
      from: shift(now, -7),
      to: today,
      mode: "snapshot",
    };
  }

  if (preset === "year") {
    return {
      granularity: "YTD",
      from: shift(now, -7),
      to: today,
      mode: "snapshot",
    };
  }

  return { granularity: null, from: null, to: null, mode: "snapshot" };
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
