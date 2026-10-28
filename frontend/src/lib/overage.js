/**
 * Overage Material — card and drill models over the
 * GET /plants/:plantId/inventory/overage payload (specs/17-overage-material.md).
 *
 * The payload is a current snapshot: it ignores the date and shift filters.
 * Quantities stay per unit; different units are never summed.
 */
import { toDisplayDate } from "./dateFormat.js";
import { formatIndianNumber, withUnit } from "./numberFormat.js";
import { toDisplayQuantity } from "./units.js";

/**
 * @typedef {object} OverageRow
 * @property {string|null} section
 * @property {string|null} sub_section
 * @property {string|null} product_type
 * @property {string|null} unit
 * @property {number} overage_qty
 * @property {string|null} oldest_lot_date ISO yyyy-mm-dd
 * @property {number} production_days
 * @property {string} [level] totals only: section | sub_section | component
 * @property {string|null} [itemcode] SKU rows only
 */

/**
 * @typedef {object} OverageScope
 * @property {string} section Gold section name ("Mixing", "Stock")
 * @property {string|null} subSection Gold sub_section, or null for the whole
 *   section
 */

function inScope(row, { section, subSection }) {
  return (
    row.section === section && (!subSection || row.sub_section === subSection)
  );
}

function byQuantityDesc(a, b) {
  return b.overage_qty - a.overage_qty;
}

/** Quantity with its display unit ("20,125 M", KG → "3.7 MT"). */
export function formatOverageQty(value, unit) {
  const shown = toDisplayQuantity(value, unit);
  return withUnit(formatIndianNumber(shown.value), shown.unit);
}

/** Earliest ISO date among rows, or null. */
function oldestOf(rows) {
  return (
    rows
      .map((row) => row.oldest_lot_date)
      .filter(Boolean)
      .sort()[0] ?? null
  );
}

/**
 * The area's per-unit totals, largest first: section-level rows for a whole
 * section, sub-section rows otherwise.
 *
 * @param {OverageRow[]} totals
 * @param {OverageScope} scope
 * @returns {OverageRow[]}
 */
export function areaTotals(totals, scope) {
  const level = scope.subSection ? "sub_section" : "section";
  return (totals ?? [])
    .filter((row) => row.level === level && inScope(row, scope))
    .sort(byQuantityDesc);
}

/**
 * The area's component rows (one per product type and unit), largest first.
 *
 * @param {OverageRow[]} totals
 * @param {OverageScope} scope
 * @returns {OverageRow[]}
 */
export function areaComponents(totals, scope) {
  return (totals ?? [])
    .filter((row) => row.level === "component" && inScope(row, scope))
    .sort(byQuantityDesc);
}

/**
 * SKU rows of one component in one unit, largest first.
 *
 * @param {OverageRow[]} skus
 * @param {OverageScope} scope
 * @param {{ productType: string|null, unit: string|null }} component
 * @returns {OverageRow[]}
 */
export function componentSkus(skus, scope, { productType, unit }) {
  return (skus ?? [])
    .filter(
      (row) =>
        inScope(row, scope) &&
        row.product_type === productType &&
        row.unit === unit,
    )
    .sort(byQuantityDesc);
}

/** Note line for units beyond the headline: one is spelled out, more are
 *  counted — KpiCard renders the note on a single unwrapped line. */
function otherUnitsNote(others) {
  if (others.length === 0) return null;
  if (others.length === 1) {
    return `+ ${formatOverageQty(others[0].overage_qty, others[0].unit)}`;
  }
  return `+ ${others.length} more units`;
}

/**
 * The Overage Material card for an area. The headline is the largest unit's
 * quantity; any other units are noted, never added to it. No target, status
 * colour or trend (Q-OVG-03). The note stays short: it never wraps.
 *
 * @param {OverageRow[]} rows areaTotals() output
 * @param {{ id: string, name: string }} definition Technical KPI definition
 * @returns {object} KpiCard `kpi` prop
 */
export function toOverageCard(rows, definition) {
  const base = {
    id: definition.id,
    name: definition.name,
    hideTrend: true,
    drillable: true,
  };
  if (rows.length === 0) {
    return { ...base, value: 0, unit: "", note: "No overage stock" };
  }
  const [headline, ...others] = rows;
  const shown = toDisplayQuantity(headline.overage_qty, headline.unit);
  const oldest = oldestOf(rows);
  const unitsNote = otherUnitsNote(others);
  const oldestNote = oldest
    ? `${unitsNote ? "oldest" : "Oldest lot"} ${toDisplayDate(oldest)}`
    : null;
  const note = [unitsNote, oldestNote].filter(Boolean).join(" · ");
  // Whole metres / pieces, as the Production card shows them; decimals would
  // push crore-scale metre values past the card edge. Tonnes keep decimals.
  const value = shown.unit === "MT" ? shown.value : Math.round(shown.value);
  return { ...base, value, unit: shown.unit ?? "", note };
}
