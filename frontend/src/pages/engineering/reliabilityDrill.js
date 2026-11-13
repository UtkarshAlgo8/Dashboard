import { formatIndianNumber } from "@/lib/numberFormat.js";
import theme from "@/theme.js";

/**
 * Shared vocabulary of the Engineering plot drills (plot_drilldown_spec):
 * the category and discipline colours, and how a drill value is written.
 */

export const UNMAPPED = "Unmapped";

const GREY = theme.palette.text.disabled;

// Spec §4: "A red · B amber · C blue · D teal · Unmapped grey (last)".
export const CATEGORY_COLORS = [
  { id: "A", name: "Category A", color: theme.custom.status.red },
  { id: "B", name: "Category B", color: theme.custom.status.amber },
  { id: "C", name: "Category C", color: theme.palette.primary.main },
  { id: "D", name: "Category D", color: theme.custom.charts.teal },
  { id: UNMAPPED, name: UNMAPPED, color: GREY },
];

export function categoryColor(status) {
  return CATEGORY_COLORS.find((c) => c.id === status)?.color ?? GREY;
}

/** Legend entries for the categories that are on the chart, in spec order. */
export function categoryGroups(statuses) {
  const present = new Set(statuses);
  return CATEGORY_COLORS.filter((c) => present.has(c.id));
}

// Spec §4: "one fixed colour per discipline". The five the spec names, then
// gold's sixth, 'Other', which is drawn only when it has a value.
export const DISCIPLINES = [
  { id: "Mechanical", color: theme.custom.brand.purple },
  { id: "Electrical", color: theme.custom.charts.electrical },
  { id: "Electronics", color: theme.palette.primary.main },
  { id: "Instrumentation", color: theme.custom.charts.teal },
  { id: "Utility", color: theme.custom.charts.utility },
];
export const OTHER_DISCIPLINE = { id: "Other", color: GREY };

export function disciplineColor(subSection) {
  return (
    DISCIPLINES.find((d) => d.id === subSection)?.color ??
    OTHER_DISCIPLINE.color
  );
}

export const num = (v) => {
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** 2 decimals under 10 (0.61 h), 1 above (126.7 h). */
export function fmtDrill(v) {
  if (v == null) return "—";
  return formatIndianNumber(v, { maxDecimals: Math.abs(v) < 10 ? 2 : 1 });
}

/** A hex colour at reduced opacity, e.g. for a single-event bar. */
export function lighter(hex, alpha = 0.45) {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
