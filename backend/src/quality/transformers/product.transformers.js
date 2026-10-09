/** Row → response transformers for Product's Uniformity & Balancing feed. */
import { parseDrillDown, valueOrNull } from "../normalize.js";
import { PRODUCT_CARD_KPIS } from "../queries/product.queries.js";

function toProductRow(row) {
  return {
    kpi_name: row.kpi_name,
    machine: valueOrNull(row.machine),
    actual_value: valueOrNull(row.actual_value),
    unit: valueOrNull(row.unit_of_measurement),
    threshold_value: valueOrNull(row.threshold_value),
    status: valueOrNull(row.status),
    drill_down: parseDrillDown(row.drill_down_attribute),
  };
}

/** Preserve all seven canonical cards even when the selected period has no row. */
export function toProductSummary(rows) {
  const byName = new Map(rows.map((row) => [row.kpi_name, row]));
  const values = {};
  for (const name of PRODUCT_CARD_KPIS) {
    const row = byName.get(name);
    values[name] = row
      ? toProductRow(row)
      : {
          kpi_name: name,
          machine: null,
          actual_value: null,
          unit: null,
          threshold_value: null,
          status: null,
          drill_down: { is_leaf: true, children: [] },
        };
  }
  return { values };
}

/** Return factual gold rows in a stable, UI-ready table shape. */
export function toProductChildren(rows) {
  return { rows: rows.map(toProductRow) };
}
