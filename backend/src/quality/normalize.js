/**
 * Quality-dashboard normalization + shared SQL predicates (Backend FRD §0).
 *
 * Additive to Production's normalize.js — the Quality gold layer is a
 * different family (department='Quality') with its own conventions, so it
 * gets its own thin layer here. Every quirk the FRD calls out is handled
 * ONCE, so the query builders stay declarative.
 */

/* ----------------------------------------------------------------- *
 * SQL literal escaping                                              *
 * ----------------------------------------------------------------- */

/** Single-quote-escape a value for inline SQL (mirrors Production). */
export function escapeLiteral(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number cannot be a SQL literal: ${value}`);
    }
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

/* ----------------------------------------------------------------- *
 * Scope predicates (FRD §0.1)                                        *
 * ----------------------------------------------------------------- */

// Every Quality row carries department='Quality'. The `category` column is
// the family partition: Process-tab requests add category='Process Audit',
// SPC requests add category='SPC'.
export const DEPARTMENT_QUALITY = "Quality";
export const CATEGORY_PROCESS = "Process Audit";
export const CATEGORY_SPC = "SPC";

/**
 * Plant alias (FRD §0.1). The two source files label the same physical
 * plant differently and Step 1 preserved both: Process rows carry
 * plant='BTP', SPC rows carry plant='BANMORE'. The frontend sends ONE
 * plant id; the backend resolves it to the right label per family.
 * Filtering Process on BANMORE (or SPC on BTP) returns nothing.
 *
 * @param {"Process Audit"|"SPC"} family
 * @returns {"BTP"|"BANMORE"}
 */
export function plantLabelForFamily(family) {
  return family === CATEGORY_SPC ? "BANMORE" : "BTP";
}

/** SQL fragment: department='Quality' (case-insensitive). Always applied. */
export function departmentPredicate(column = "department") {
  return `LOWER(${column}) = 'quality'`;
}

/**
 * The always-on Process-family scope: department Quality + category
 * Process Audit + the family-correct plant label. Every Process query
 * AND-prepends this so SPC rows / the BANMORE label can never leak in.
 */
export function processScopePredicate() {
  const plant = plantLabelForFamily(CATEGORY_PROCESS);
  return (
    `${departmentPredicate()} ` +
    `AND category = ${escapeLiteral(CATEGORY_PROCESS)} ` +
    `AND UPPER(plant) = ${escapeLiteral(plant)}`
  );
}

/* ----------------------------------------------------------------- *
 * Granularity / time (FRD §0.4)                                      *
 * ----------------------------------------------------------------- */

export const GRAN_DAY = "DAY";
export const GRAN_MONTH = "MONTH";
export const GRAN_YEAR = "YEAR";
export const GRAN_SHIFT_A = "SHIFT A";
export const GRAN_SHIFT_B = "SHIFT B";
export const GRAN_SHIFT_C = "SHIFT C";

// The only granularity tokens we ever emit. The live feed may still carry
// malformed tokens (FRD §0.4 saw 'SHIFT A, B'); keeping a strict allow-list
// is the defensive exclusion the FRD asks for.
const ALLOWED_GRANULARITIES = new Set([
  GRAN_DAY,
  GRAN_MONTH,
  GRAN_YEAR,
  GRAN_SHIFT_A,
  GRAN_SHIFT_B,
  GRAN_SHIFT_C,
]);

/**
 * Resolve the UI's time selection to a canonical gold granularity.
 *
 * The header sends either an explicit `granularity` or a `shift` convenience
 * value (FRD §0.9: All→DAY, A/B/C→SHIFT x). Returns null for anything not on
 * the allow-list, so callers can 400 rather than emit a bad filter.
 *
 * @param {{granularity?: string, shift?: string}} input
 * @returns {string|null}
 */
export function resolveGranularity({ granularity, shift } = {}) {
  if (granularity) {
    const g = String(granularity).trim().toUpperCase();
    // Accept "SHIFT B" / "SHIFTB" / "B" loosely; normalize to "SHIFT B".
    const shiftLetter = /^SHIFT\s*([ABC])$/.exec(g);
    const canonical = shiftLetter ? `SHIFT ${shiftLetter[1]}` : g;
    return ALLOWED_GRANULARITIES.has(canonical) ? canonical : null;
  }
  if (shift) {
    const s = String(shift).trim().toUpperCase();
    if (s === "ALL") return GRAN_DAY;
    if (["A", "B", "C"].includes(s)) return `SHIFT ${s}`;
  }
  return GRAN_DAY;
}

/** SQL fragment excluding malformed granularity tokens (defensive, §0.4). */
export function granularityAllowListPredicate(column = "granularity") {
  const list = [...ALLOWED_GRANULARITIES].map(escapeLiteral).join(", ");
  return `${column} IN (${list})`;
}

/* ----------------------------------------------------------------- *
 * The "null" sentinel + drill parsing (FRD §0.2 / §1.2)              *
 * ----------------------------------------------------------------- */

// Loader already converts the literal "null" and blank cells to JS null
// (see loadExcel.js), so JS-side "is empty?" is a plain == null check. This
// helper stays for the odd raw string that reaches a transformer.
export function isEmptyValue(v) {
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  return s === "" || s === "null" || s === "nan";
}

/**
 * Parse a stored `drill_down_attribute` into the child KPI list.
 *
 * The generalized navigation rule (FRD §1.2): the next drill level is the
 * JSON list in the CURRENT row's drill_down_attribute; a null/"null" value
 * means a leaf. `drill_down_level` is never read. Tolerates the single-quoted
 * list form the real feed sometimes emits.
 *
 * @param {unknown} raw
 * @returns {{ is_leaf: boolean, children: string[] }}
 */
export function parseDrillDown(raw) {
  if (isEmptyValue(raw)) return { is_leaf: true, children: [] };
  if (Array.isArray(raw)) {
    return { is_leaf: raw.length === 0, children: raw };
  }
  let text = String(raw).trim();
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr) && arr.length > 0) {
      return { is_leaf: false, children: arr.map(String) };
    }
    return { is_leaf: true, children: [] };
  } catch {
    // Single-quoted list, e.g. ['Plant_quality_rating_m'] → JSON-ify.
    try {
      const arr = JSON.parse(text.replaceAll("'", '"'));
      if (Array.isArray(arr) && arr.length > 0) {
        return { is_leaf: false, children: arr.map(String) };
      }
    } catch {
      /* fall through to leaf */
    }
    return { is_leaf: true, children: [] };
  }
}

/**
 * Coerce a stored value column to its JSON-serializable form (FRD §0.2/§0.6):
 * the "null" sentinel and blanks become JSON `null` ("—" in the UI), never 0.
 */
export function valueOrNull(v) {
  return isEmptyValue(v) ? null : v;
}
