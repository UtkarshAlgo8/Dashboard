// Production quantities arrive from the lake in kilograms (unit "KG"); the
// dashboard presents them in metric tonnes (MT). One tonne = 1000 kg.
//
// Conversion is DISPLAY-ONLY: stored/queried values stay in KG and the drill
// still filters the API by the raw "KG" unit — only the number shown and its
// label change. Non-KG units (%, M, NOS, Batch) pass through untouched.

/** kg per metric tonne. */
export const KG_PER_TONNE = 1000;

/** True when a unit string denotes kilograms (any casing, "kg" or "kgs"). */
export function isKg(unit) {
  if (typeof unit !== "string") return false;
  const u = unit.trim().toUpperCase();
  return u === "KG" || u === "KGS";
}

/** kg → tonnes. Divides by 1000; null/undefined pass through unchanged. */
export function kgToTonnes(value) {
  return value == null ? value : value / KG_PER_TONNE;
}

/**
 * Spellings the lake uses for the SAME unit, mapped to the one label we
 * show. The source emits both "NUM" and "NOS" for a count and both
 * "Meters" and "M" for a length; showing each row under its own raw
 * spelling makes one series look like two (CTP's Mixing card read "NUM"
 * while its own unit pill read "NOS"). Keyed by the upper-cased form.
 */
const UNIT_LABEL_ALIASES = new Map([
  ["METERS", "M"],
  ["METER", "M"],
  ["NUM", "NOS"],
  // "Tyres" is a business label for the count unit (NOS) on the Production
  // card; folding both spellings into one label keeps the card readable.
  ["TYRES", "NOS"],
  ["TYRE", "NOS"],
]);

/**
 * The canonical LABEL for a unit — alias-merged, but otherwise left in the
 * data's own casing ("%" and "min" are shown verbatim, not upper-cased).
 */
export function canonicalUnitLabel(unit) {
  if (typeof unit !== "string") return unit;
  return UNIT_LABEL_ALIASES.get(unit.trim().toUpperCase()) ?? unit;
}

/** The label a raw unit is displayed under ("KG" → "MT", "NUM" → "NOS"). */
export function displayUnit(unit) {
  return isKg(unit) ? "MT" : canonicalUnitLabel(unit);
}

/**
 * Convert a (value, rawUnit) pair to its display form: KG values become
 * tonnes under an "MT" label; every other unit is returned untouched.
 * @param {number|null} value  raw value (in KG when rawUnit is KG)
 * @param {string|null} rawUnit  the unit the value is recorded in
 * @returns {{ value: number|null, unit: string|null }}
 */
export function toDisplayQuantity(value, rawUnit) {
  if (!isKg(rawUnit))
    return { value, unit: canonicalUnitLabel(rawUnit) ?? null };
  return { value: kgToTonnes(value), unit: "MT" };
}
