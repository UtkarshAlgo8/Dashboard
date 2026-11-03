/**
 * Loss Tree pie maths. The only figures computed here are the two the KPI
 * spec allows the UI to compute:
 *
 *   - share of downtime  = slice minutes ÷ total minutes of all slices × 100
 *     (sets the slice size)
 *   - header % of scheduled time = sum of the five stored
 *     `LostTime_Pct_LossCategory` rows for the period (valid because all five
 *     share the scheduled-time denominator)
 *
 * Each slice's own % of scheduled time is passed through as stored.
 */

export const LOSS_PCT_KPI = "LostTime_Pct_LossCategory";

/**
 * @param {Array<{ product_type: string, LostTime_LossCategory?: number|null, LostTime_Pct_LossCategory?: number|null }>} rows
 * @returns {{ name: string, minutes: number, sharePct: number|null, scheduledPct: number|null }[]}
 */
export function lossTreeSlices(rows) {
  const list = (rows || []).map((r) => ({
    name: r.product_type,
    minutes: r.LostTime_LossCategory ?? 0,
    scheduledPct: r[LOSS_PCT_KPI] ?? null,
  }));
  const total = lostMinutesTotal(list);
  return list.map((s) => ({
    ...s,
    sharePct: total ? (s.minutes / total) * 100 : null,
  }));
}

/** Total lost minutes across every slice. */
export function lostMinutesTotal(slices) {
  return slices.reduce((sum, s) => sum + (s.minutes || 0), 0);
}

/**
 * Header % of scheduled time: the sum of every slice's stored value, or null
 * when any slice lacks one (a custom range has no stored rows).
 */
export function scheduledPctTotal(slices) {
  if (slices.length === 0) return null;
  if (slices.some((s) => s.scheduledPct == null)) return null;
  return slices.reduce((sum, s) => sum + s.scheduledPct, 0);
}
