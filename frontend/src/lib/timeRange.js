/**
 * Convert a TimeRangeSelect state ({preset, from, to}) into the
 * concrete ISO yyyy-mm-dd `from` / `to` pair the backend expects on
 * `?from=&to=` query params (CR-07).
 *
 * Rules:
 *   - explicit custom from/to (both set) takes priority — used as-is.
 *   - preset === "today"  → {from: today, to: today}
 *   - preset === "month"  → {from: today − 30 days, to: today}
 *   - preset === "year"   → {from: today − 1 year,  to: today}
 *   - otherwise (no preset, no custom range) → {from: null, to: null}
 *     (the backend treats nulls as "no date constraint")
 *
 * `now()` is injectable for tests.
 */
export function presetToDateRange(timeRange, now = new Date()) {
  if (!timeRange) return { from: null, to: null };
  const { preset, from, to } = timeRange;

  // Explicit custom range wins.
  if (from && to) return { from, to };

  const today = toIso(now);
  if (preset === "today") return { from: today, to: today };

  if (preset === "month") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { from: toIso(start), to: today };
  }

  if (preset === "year") {
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    return { from: toIso(start), to: today };
  }

  return { from: null, to: null };
}

function toIso(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
