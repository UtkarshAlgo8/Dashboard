/**
 * Shared normalization layer — realdata.md §0 ("normalize on read, stop
 * hardcoding").
 *
 * The real gold table differs from the old gold_dummy in casing and
 * vocabulary (BANMORE vs Banmore, DAY vs Daily, single-quoted drill
 * lists, uppercase units, …). Rather than chase every frozen literal
 * across the query builders and controllers, every value is normalized
 * HERE, once, as it is read — and the canonical forms below are what the
 * rest of the backend matches against.
 *
 * Canonical forms emitted to SQL / used in comparisons:
 *   plant        → uppercase ("BANMORE")
 *   department   → lowercase ("production")
 *   granularity  → DAY | MONTH | SHIFT A | SHIFT B | SHIFT C | YTD (gated)
 *   units        → uppercase label, or null for "(unset)" / missing
 */

/* ----------------------------------------------------------------- *
 * Plant / department                                                *
 * ----------------------------------------------------------------- */

// realdata.md §1: the ONLY plant the dashboard ever shows. BTP is
// excluded by always applying this filter. Stored uppercase in the real
// data; we compare case-insensitively (UPPER(plant) = 'BANMORE').
export const PLANT_BANMORE = "BANMORE";

// realdata.md §2: the ONLY department. Real data has both "Production"
// (Banmore) and "production" (BTP) — match case-insensitively
// (LOWER(department) = 'production'). department = Quality (where SPC
// lives) is excluded automatically by this filter.
export const DEPARTMENT_PRODUCTION = "production";

/** SQL predicate fragment: plant filter (case-insensitive). Always applied. */
export function plantPredicate(column = "plant") {
  return `UPPER(${column}) = '${PLANT_BANMORE}'`;
}

/** SQL predicate fragment: department filter (case-insensitive). */
export function departmentPredicate(column = "department") {
  return `LOWER(${column}) = '${DEPARTMENT_PRODUCTION}'`;
}

/** Both core filters joined — every endpoint applies these. */
export function plantDepartmentPredicate() {
  return `${plantPredicate()} AND ${departmentPredicate()}`;
}

/* ----------------------------------------------------------------- *
 * Granularity (realdata.md §3)                                      *
 * ----------------------------------------------------------------- */

// Feature flag for the Year/YTD time filter. There is no YTD data in the
// real set yet (§3) — keep the code path but disable it. Flip to true (and
// set YEAR_GRANULARITY to whatever the future yearly value is) when yearly
// data arrives; everything else behaves like Month.
export const ENABLE_YEAR = false;
export const YEAR_GRANULARITY = "YTD";

// Canonical real-data granularities (the values that go into SQL).
export const GRAN_DAY = "DAY";
export const GRAN_MONTH = "MONTH";
export const GRAN_SHIFT_A = "SHIFT A";
export const GRAN_SHIFT_B = "SHIFT B";
export const GRAN_SHIFT_C = "SHIFT C";

// Default granularity for OEE/section fallbacks — was MTD, now MONTH (§3).
export const DEFAULT_GRANULARITY = GRAN_MONTH;

/**
 * Synonym map → canonical real granularity. Accepts BOTH the old dummy
 * names (Daily / MTD / YTD / Shift A) AND the real names (DAY / MONTH /
 * SHIFT A) so a partially-updated frontend still works. Comparison is
 * case-insensitive and whitespace-tolerant.
 *
 * Year/YTD is only honoured when ENABLE_YEAR is true; otherwise it is
 * treated as "not present" (returns null) so no YTD predicate is emitted.
 */
const GRANULARITY_SYNONYMS = new Map([
  ["daily", GRAN_DAY],
  ["day", GRAN_DAY],
  ["today", GRAN_DAY],
  ["mtd", GRAN_MONTH],
  ["month", GRAN_MONTH],
  ["monthly", GRAN_MONTH],
  ["shift a", GRAN_SHIFT_A],
  ["shifta", GRAN_SHIFT_A],
  ["a", GRAN_SHIFT_A],
  ["shift b", GRAN_SHIFT_B],
  ["shiftb", GRAN_SHIFT_B],
  ["b", GRAN_SHIFT_B],
  ["shift c", GRAN_SHIFT_C],
  ["shiftc", GRAN_SHIFT_C],
  ["c", GRAN_SHIFT_C],
]);

// The set of granularities that actually exist for the production
// dashboard (Real-time lives only on excluded SPC rows — §3). YTD is
// added only when the Year flag is on.
export function allowedGranularities() {
  const base = new Set([
    GRAN_DAY,
    GRAN_MONTH,
    GRAN_SHIFT_A,
    GRAN_SHIFT_B,
    GRAN_SHIFT_C,
  ]);
  if (ENABLE_YEAR) base.add(YEAR_GRANULARITY);
  return base;
}

/**
 * Normalize any inbound granularity value to its canonical real form.
 *   - empty / null / "all" → null (no granularity filter)
 *   - YTD/Year → YEAR_GRANULARITY when ENABLE_YEAR, else null (disabled)
 *   - unknown value → throws via the caller's allow-list check (we return
 *     the trimmed value so the caller can reject it with a clear message)
 */
export function normalizeGranularity(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "" || trimmed.toLowerCase() === "all") return null;

  const key = trimmed.toLowerCase().replace(/\s+/g, " ");

  // Year / YTD — gated behind the feature flag.
  if (key === "ytd" || key === "year" || key === "yearly") {
    return ENABLE_YEAR ? YEAR_GRANULARITY : null;
  }

  return GRANULARITY_SYNONYMS.get(key) ?? trimmed;
}

/* ----------------------------------------------------------------- *
 * drill_down_attribute parser (realdata.md §6)                      *
 * ----------------------------------------------------------------- */

// realdata.md §13: the real data only ships Production_m_sku; the dummy's
// separate Production_sku_m view is aliased to it. Serve the same rows for
// either name; never show two views or error on either. (Kept here so both
// query and transform layers share one source of truth.)
export const KPI_ALIASES = new Map([["Production_sku_m", "Production_m_sku"]]);

export function aliasKpiName(name) {
  if (typeof name !== "string") return name;
  return KPI_ALIASES.get(name) ?? name;
}

/**
 * Tolerant drill_down_attribute parser (realdata.md §6).
 *
 * The dummy stored a JSON array with DOUBLE quotes:
 *   ["Production_m", "Production_sku"]
 * The real data stores a Python-style list with SINGLE quotes:
 *   ['Production_m', 'Production_sku']
 * A strict JSON.parse fails on the single-quote form and silently returns
 * the raw string → every drilldown dies. This parser accepts either form
 * and ALWAYS returns a real array of child KPI names (or null for a leaf).
 *
 * Never throws.
 */
export function parseDrillAttribute(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "nan" || trimmed === "[]") return null;

  // 1. Try strict JSON first (double-quoted dummy form).
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return normalizeAttrArray(parsed);
  } catch {
    /* fall through to the single-quote path */
  }

  // 2. Python-style single-quoted list → swap single→double, then parse.
  //    Only do this for values that LOOK like a list, so a plain string
  //    KPI name (rare) still falls through to the array-wrap below.
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const jsonish = trimmed.replace(/'/g, '"');
      const parsed = JSON.parse(jsonish);
      if (Array.isArray(parsed)) return normalizeAttrArray(parsed);
    } catch {
      // 3. Last resort: hand-split the inner contents on commas and strip
      //    quotes/whitespace. Survives odd escaping the JSON path chokes on.
      const inner = trimmed.slice(1, -1).trim();
      if (inner === "") return null;
      const items = inner
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, "").trim())
        .filter(Boolean);
      return items.length ? normalizeAttrArray(items) : null;
    }
  }

  // A bare child name (not a list) → wrap as a single-element array.
  return normalizeAttrArray([trimmed]);
}

/** Apply KPI-name aliasing across a parsed attribute array. */
function normalizeAttrArray(arr) {
  const out = arr
    .filter((x) => typeof x === "string" && x.trim() !== "")
    .map((x) => aliasKpiName(x.trim()));
  return out.length ? out : null;
}

/* ----------------------------------------------------------------- *
 * Units (realdata.md §7)                                            *
 * ----------------------------------------------------------------- */

// Real units: %, KG, M, NOS, min, (unset). "(unset)" means missing — show
// nothing, never print the literal. We DON'T hardcode a unit per KPI; the
// label is read from the data and only normalized for display.
const UNSET_UNIT_TOKENS = new Set(["(unset)", "unset", "nan", ""]);

/**
 * Normalize a unit_of_measurement value for display.
 *   - "(unset)" / "nan" / "" / null → null (treated as "no unit")
 *   - everything else: trimmed, with known labels upper-cased for
 *     consistent casing (KG, NOS, M). "%" and "min" pass through.
 */
export function normalizeUnit(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (UNSET_UNIT_TOKENS.has(trimmed.toLowerCase())) return null;

  // Canonical casing for the unit-bearing labels. "min" and "%" are kept
  // verbatim; alphabetic codes (kg/nos/m) are upper-cased.
  if (trimmed === "%" || trimmed.toLowerCase() === "min") return trimmed;
  if (/^[a-z]+$/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}

/* ----------------------------------------------------------------- *
 * UNKNOWN kpi_name (realdata.md §9)                                 *
 * ----------------------------------------------------------------- */

// realdata.md §9: a literal "UNKNOWN" kpi_name (~1,056 rows) survives in
// Banmore production — filter it out everywhere.
export const EXCLUDED_KPI_NAMES = new Set(["UNKNOWN"]);

/** SQL predicate fragment that drops the UNKNOWN kpi_name rows. */
export function excludeUnknownKpiPredicate(column = "kpi_name") {
  return `${column} != 'UNKNOWN'`;
}
