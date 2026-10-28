// GT Weight Variation (Paint Weight) — shared by Quality › Product and the
// Technical dashboard so both read the same gold KPIs the same way.

/** Headline gold KPI behind the GT Weight Variation card. */
export const PAINT_WEIGHT_HEADLINE_KPI = "Paint_Wt_Within3_Pct_overall";
export const PAINT_WEIGHT_METRIC_LABEL = "Paint Weight Within 3%";

export const PAINT_WEIGHT_COLUMNS = [
  { label: "Tyre Qty", kpi: "Paint_Wt_Tyre_Qty_sku", decimals: 0 },
  { label: "Spec Wt (kg)", kpi: "Paint_Wt_Spec_Kg_sku", decimals: 3 },
  { label: "Avg Wt (kg)", kpi: "Paint_Wt_Avg_Kg_sku", decimals: 3 },
  { label: "Deviation (kg)", kpi: "Paint_Wt_Dev_Kg_sku", decimals: 3 },
  { label: "1%", kpi: "Paint_Wt_Within1_Pct_sku", decimals: 2, percent: true },
  { label: "2%", kpi: "Paint_Wt_Within2_Pct_sku", decimals: 2, percent: true },
  { label: "3%", kpi: "Paint_Wt_Within3_Pct_sku", decimals: 2, percent: true },
];
export const PAINT_WEIGHT_OVERALL = [
  { label: "Within 3%", kpi: "Paint_Wt_Within3_Pct_overall" },
  { label: "Within 2%", kpi: "Paint_Wt_Within2_Pct_overall" },
  { label: "Within 1%", kpi: "Paint_Wt_Within1_Pct_overall" },
];
export const PAINT_WEIGHT_DRILL_KPIS = [
  ...PAINT_WEIGHT_OVERALL.map((column) => column.kpi),
  ...PAINT_WEIGHT_COLUMNS.map((column) => column.kpi),
];

/**
 * Display string for one paint-weight value; blanks and non-numbers are "—".
 *
 * @param {unknown} value
 * @param {number} [decimals=2]
 * @param {boolean} [percent=false]
 * @returns {string}
 */
export function paintWeightValue(value, decimals = 2, percent = false) {
  if (value == null || String(value).trim() === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (
    number.toLocaleString("en-IN", { maximumFractionDigits: decimals }) +
    (percent ? "%" : "")
  );
}

/**
 * Splits paint-weight drill rows into plant-level overall values and a
 * per-SKU table (SKUs ascending, one formatted cell per PAINT_WEIGHT_COLUMNS).
 *
 * @param {Array<{kpi_name: string, actual_value: unknown, itemcode?: string}>} rows
 * @returns {{ overall: Map<string, unknown>, tableRows: string[][] }}
 */
export function groupPaintWeightRows(rows) {
  const overall = new Map();
  const bySku = new Map();
  for (const row of rows) {
    if (PAINT_WEIGHT_OVERALL.some((column) => column.kpi === row.kpi_name)) {
      overall.set(row.kpi_name, row.actual_value);
    } else if (row.itemcode) {
      if (!bySku.has(row.itemcode)) bySku.set(row.itemcode, new Map());
      bySku.get(row.itemcode).set(row.kpi_name, row.actual_value);
    }
  }
  const tableRows = [...bySku]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sku, values]) => [
      sku,
      ...PAINT_WEIGHT_COLUMNS.map((column) =>
        paintWeightValue(
          values.get(column.kpi),
          column.decimals,
          column.percent,
        ),
      ),
    ]);
  return { overall, tableRows };
}

/**
 * Technical-dashboard card for GT Weight Variation from one Product summary
 * value row, or null when gold has no value for the period. Always opens the
 * paint-weight drill, matching Quality › Product.
 *
 * @param {{ actual_value?: unknown, unit?: string } | null | undefined} live
 * @param {{ id: string, name: string }} definition
 * @returns {object | null}
 */
export function toGtWeightCard(live, definition) {
  if (live?.actual_value == null) return null;
  const value = Number(live.actual_value);
  if (!Number.isFinite(value)) return null;
  return {
    ...definition,
    value,
    unit: live.unit || "%",
    note: PAINT_WEIGHT_METRIC_LABEL,
    hideTrend: true,
    drillable: true,
    drillType: "paintWeight",
  };
}
