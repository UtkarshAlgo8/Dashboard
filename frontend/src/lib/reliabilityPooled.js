/**
 * Reliability rates rebuilt for a custom date range from summed machine-level
 * components — the same arithmetic the backend's `toAggregatedSummary` uses
 * for the headline cards, applied per drill row:
 *
 *   Breakdown % = ΣBreakdownMin_m / ΣScheduledMin_m × 100
 *   MTTR        = ΣBreakdownMin_m / ΣBreakdownOcc_m
 *   MTBF        = ΣOperatingMin_m / ΣBreakdownOcc_m
 *
 * A row here is one `agg=sum` group (category, section or machine) over the
 * range. Published rates cannot be summed across days, so a custom-range
 * drill has to be built this way.
 *
 * Gap rule, matching the backend: a figure that cannot be measured is null,
 * never a fabricated 0.
 */

/**
 * Downtime minutes. A group that was scheduled but never broke down has no
 * BreakdownMin row at all — that is a real 0, not a gap.
 * @param {Record<string, number|null>} row
 * @returns {number|null}
 */
export function pooledDowntime(row) {
  const scheduled = row?.ScheduledMin_m ?? null;
  const measured = scheduled != null && scheduled > 0;
  return row?.BreakdownMin_m ?? (measured ? 0 : null);
}

/**
 * @param {Record<string, number|null>} row
 * @returns {number|null} null when nothing was scheduled
 */
export function pooledBreakdownPct(row) {
  const scheduled = row?.ScheduledMin_m ?? null;
  if (scheduled == null || scheduled <= 0) return null;
  return (pooledDowntime(row) / scheduled) * 100;
}

/**
 * MTTR from any (minutes, occurrences) pair — machine components or a
 * failure's own counters.
 * @param {number|null|undefined} minutes
 * @param {number|null|undefined} occurrences
 * @returns {number|null} null when there were no breakdowns (undefined mean)
 */
export function meanRepairMinutes(minutes, occurrences) {
  if (!occurrences || minutes == null) return null;
  return minutes / occurrences;
}

/**
 * @param {Record<string, number|null>} row
 * @returns {number|null} null when there were no breakdowns — 0 would read
 *   as "fails constantly", the opposite of the truth
 */
export function pooledMtbf(row) {
  const occurrences = row?.BreakdownOcc_m ?? null;
  const operating = row?.OperatingMin_m ?? null;
  if (!occurrences || operating == null) return null;
  return operating / occurrences;
}
