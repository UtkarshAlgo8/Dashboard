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

/** The label a raw unit is displayed under ("KG" → "MT"; others unchanged). */
export function displayUnit(unit) {
  return isKg(unit) ? "MT" : unit;
}

/**
 * Convert a (value, rawUnit) pair to its display form: KG values become
 * tonnes under an "MT" label; every other unit is returned untouched.
 * @param {number|null} value  raw value (in KG when rawUnit is KG)
 * @param {string|null} rawUnit  the unit the value is recorded in
 * @returns {{ value: number|null, unit: string|null }}
 */
export function toDisplayQuantity(value, rawUnit) {
  if (!isKg(rawUnit)) return { value, unit: rawUnit ?? null };
  return { value: kgToTonnes(value), unit: "MT" };
}
