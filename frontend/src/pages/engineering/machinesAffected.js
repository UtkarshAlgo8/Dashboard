/**
 * Machines Affected card (Engineering Reliability). Every count is a stored
 * Gold value for ONE period; categories/sections of that period may be added
 * (they partition the machines), days or months never are.
 *
 *   affected  = Σ BreakdownMachines_Grade rows
 *   total     = TotalMachines_Overall
 *   % / no-breakdown are the only UI calcs the spec allows.
 */

export const UNMAPPED = "Unmapped";

/** Card headline from the period's category rows and the overall total. */
export function machinesAffectedHeadline(gradeRows, totalMachines) {
  const affected = (gradeRows || []).reduce(
    (sum, r) => sum + (r.BreakdownMachines_Grade ?? 0),
    0,
  );
  const hasAffected = (gradeRows || []).some(
    (r) => r.BreakdownMachines_Grade != null,
  );
  const total = totalMachines ?? null;
  return {
    affected: hasAffected ? affected : null,
    total,
    pct: hasAffected && total ? (affected / total) * 100 : null,
    noBreakdown: hasAffected && total != null ? total - affected : null,
  };
}

/**
 * One bar per category/section: rows already joined server-side on the group
 * dimension. A group with machines but no BreakdownMachines row had no
 * breakdown, so its affected count is 0. Largest total first, Unmapped last.
 *
 * @param {Array<Record<string, any>>} rows
 * @param {{ dim: string, totalKpi: string, affectedKpi: string }} keys
 * @returns {{ label: string, total: number|null, affected: number }[]}
 */
export function machinesAffectedBars(rows, { dim, totalKpi, affectedKpi }) {
  return (rows || [])
    .map((r) => ({
      label: r[dim],
      total: r[totalKpi] ?? null,
      affected: r[affectedKpi] ?? 0,
    }))
    .sort((a, b) => {
      const au = a.label === UNMAPPED;
      const bu = b.label === UNMAPPED;
      if (au !== bu) return au ? 1 : -1;
      return (b.total ?? 0) - (a.total ?? 0);
    });
}
