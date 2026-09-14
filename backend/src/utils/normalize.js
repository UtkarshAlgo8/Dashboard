import { config } from "../config.js";

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
 * Missing-value sentinels (changes.md §0)                            *
 * ----------------------------------------------------------------- *
 * The real gold table encodes "missing" as the literal STRING "null"
 * (as well as the older dummy's "nan"). Neither is a SQL NULL. Every
 * "is this value empty?" check — in JS and in SQL — must treat BOTH
 * "null" and "nan" (and "") as empty, or overall rows (product_type =
 * "null") get missed and fake drill KPIs named "null" get created.
 */

// Lowercased tokens that mean "no value" for a dimension column.
export const EMPTY_VALUE_TOKENS = new Set(["", "nan", "null"]);

/** True when a raw string dimension value is a missing-value sentinel. */
export function isEmptyValue(v) {
  if (v == null) return true;
  return EMPTY_VALUE_TOKENS.has(String(v).trim().toLowerCase());
}

/**
 * SQL fragment: does `column` hold no value? Covers SQL NULL and the
 * literal sentinel strings "nan"/"null"/"" (case-insensitively).
 */
export function emptyColumnPredicate(column) {
  return `(${column} IS NULL OR LOWER(${column}) = 'nan' OR LOWER(${column}) = 'null' OR ${column} = '')`;
}

/* ----------------------------------------------------------------- *
 * Plant / department                                                *
 * ----------------------------------------------------------------- */

// realdata.md §1: the ONLY plant the dashboard ever shows. BTP is
// excluded by always applying this filter. Stored uppercase in the real
// data; we compare case-insensitively (UPPER(plant) = 'BANMORE').
export const PLANT_BANMORE = "BANMORE";
export const PLANT_CHENNAI = "CHENNAI";

/* ----------------------------------------------------------------- *
 * Tyre type                                                          *
 * ----------------------------------------------------------------- *
 * Banmore's gold table only ever stores tyre_type = 'PCR' (plus the
 * empty sentinel on non-production rows), so the plant has nothing to
 * pick between. Chennai/CTP (gold.ctp_gold) runs BOTH lines and
 * stores three values on department = Production:
 *   PCR  — Curing / TBM / Stock
 *   TBR  — Curing / TBM / Stock
 *   Both — Mixing (100% of it) and part of Stock
 * 'Both' is compound shared by both lines, NOT a third product line, so
 * it is deliberately not offered as a choice: it is folded into whichever
 * line is selected. A strict PCR/TBR match would instead empty Mixing,
 * which has no PCR- or TBR-tagged row at all.
 */
export const TYRE_TYPE_ALL = "All";
// The stored value meaning "shared between both lines" — matched by PCR
// and by TBR, never selectable on its own.
export const TYRE_TYPE_SHARED = "Both";

// A one-line plant lists just that line: with nothing to choose between,
// the header shows a static "PCR ONLY" badge rather than a picker.
const TYRE_TYPES_SINGLE_LINE = ["PCR"];
const TYRE_TYPES_BOTH_LINES = [TYRE_TYPE_ALL, "PCR", "TBR"];

const PLANT_SCOPES = {
  banmore: {
    id: "banmore",
    code: PLANT_BANMORE,
    name: "Banmore Tyre Plant",
    tyreType: "PCR",
    tyreTypes: TYRE_TYPES_SINGLE_LINE,
    sqlTable: null,
    // Present (as null) so plantScope() falls back to
    // config.upstream.dailySqlTable, mirroring how `sqlTable: null` above
    // falls back to config.upstream.sqlTable. Chennai has no daily
    // counterpart — its scope below omits this key entirely rather than
    // setting it to null, so it never resolves to a daily table.
    dailySqlTable: null,
  },
  chennai: {
    id: "chennai",
    code: PLANT_CHENNAI,
    name: "Chennai Tyre Plant",
    // Default selection, not a fixed filter — CTP runs PCR and TBR, so it
    // opens unfiltered and the user narrows from `tyreTypes`.
    tyreType: TYRE_TYPE_ALL,
    tyreTypes: TYRE_TYPES_BOTH_LINES,
    sqlTable: "gold.ctp_gold",
  },
};

const PLANT_ALIASES = new Map([
  ["banmore", "banmore"],
  ["banmore plant", "banmore"],
  ["banmore tyre plant", "banmore"],
  ["btp", "banmore"],
  ["chennai", "chennai"],
  ["chennai plant", "chennai"],
  ["chennai tyre plant", "chennai"],
  ["ctp", "chennai"],
  ["laksar", "laksar"],
  ["laksar plant", "laksar"],
  ["laksar tyre plant", "laksar"],
  ["ltp", "laksar"],
  ["mysore", "mysore"],
  ["mysore plant", "mysore"],
  ["mysore tyre plant", "mysore"],
  ["mtp", "mysore"],
]);

export function normalizePlantId(value = "banmore") {
  const key = String(value ?? "banmore").trim().toLowerCase();
  return PLANT_ALIASES.get(key) ?? null;
}

export function plantScope(value = "banmore") {
  const id = normalizePlantId(value);
  if (!id || !PLANT_SCOPES[id]) {
    throw new Error(`Unknown plant: ${value}`);
  }
  const scope = PLANT_SCOPES[id];
  return {
    ...scope,
    sqlTable: scope.sqlTable ?? config.upstream.sqlTable,
    // Only plants that declare the key at all (Banmore, as null) fall back
    // to config.upstream.dailySqlTable. Chennai has no `dailySqlTable` key
    // in its scope (no daily counterpart) and stays null/no-op — `??` alone
    // can't express that distinction since Chennai's key would also be
    // `undefined` if merely omitted without this guard.
    dailySqlTable: Object.hasOwn(scope, "dailySqlTable")
      ? scope.dailySqlTable ?? config.upstream.dailySqlTable
      : null,
  };
}

export function plantSqlTable(value = "banmore") {
  return plantScope(value).sqlTable;
}

/** Rolling daily-table FROM target for a plant, or null if it has none. */
export function plantDailySqlTable(value = "banmore") {
  return plantScope(value).dailySqlTable;
}

/** Tyre-type options offered for a plant, first entry = default. */
export function plantTyreTypes(value = "banmore") {
  return [...plantScope(value).tyreTypes];
}

/**
 * SQL predicate for a tyre_type selection, or null when the selection
 * places no restriction ("All" / empty).
 *
 * A line selection also keeps the shared-compound rows (tyre_type =
 * 'Both'): Mixing is recorded entirely as 'Both' at CTP, so a strict
 * equality match would blank that section for every non-"All" choice.
 */
export function tyreTypePredicate(value, column = "tyre_type") {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed.toLowerCase() === TYRE_TYPE_ALL.toLowerCase()) {
    return null;
  }
  const spellings = [trimmed, TYRE_TYPE_SHARED]
    .map((s) => `'${s.toUpperCase().replaceAll("'", "''")}'`)
    .join(", ");
  return `UPPER(${column}) IN (${spellings})`;
}

// realdata.md §2: the ONLY department. Real data has both "Production"
// (Banmore) and "production" (BTP) — match case-insensitively
// (LOWER(department) = 'production'). department = Quality (where SPC
// lives) is excluded automatically by this filter.
export const DEPARTMENT_PRODUCTION = "production";

/** SQL predicate fragment: plant filter (case-insensitive). Always applied. */
export function plantPredicate(column = "plant", plantId = "banmore") {
  return `UPPER(${column}) = '${plantScope(plantId).code}'`;
}

/** SQL predicate fragment: department filter (case-insensitive). */
export function departmentPredicate(column = "department") {
  return `LOWER(${column}) = '${DEPARTMENT_PRODUCTION}'`;
}

/** Both core filters joined — every endpoint applies these. */
export function plantDepartmentPredicate(plantId = "banmore") {
  return `${plantPredicate("plant", plantId)} AND ${departmentPredicate()}`;
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
 * Dimension canonicalization (changes.md §6 / §7)                   *
 * ----------------------------------------------------------------- *
 * The real data is inconsistent in casing/spelling on some low-
 * cardinality FILTER dimensions. We canonicalize ONCE on read (both
 * the incoming filter value AND the row value) so duplicate spellings
 * merge into a single bar with a combined total, and a filter matches
 * regardless of casing. This is NOT blind LOWER() — only these
 * dimensions are folded; kpi_name/remarks/itemcode stay exact (§6.2).
 *
 * Canonicalize = case-fold to look up + map to ONE canonical spelling.
 * Look-alikes (Green vs Green Tyre, 3 Roll vs Three Roll) are handled
 * by EXPLICIT alias maps, never by case-folding (§6.3).
 */

// product_type: reported SideWall/Sidewall split (1,108 Stock rows).
// Key is the lowercased form; value is the canonical spelling.
const PRODUCT_TYPE_CANONICAL = new Map([["sidewall", "SideWall"]]);

// sub_section: "3 Roll" and "Three Roll" are the same Stock subsection
// spelled two ways — merge via explicit alias (case-folding won't catch
// it). Key is lowercased; value is the canonical spelling.
const SUB_SECTION_CANONICAL = new Map([
  ["3 roll", "3 Roll"],
  ["three roll", "3 Roll"],
]);

/** Canonicalize a product_type value (case-insensitive + spelling merge). */
export function canonicalizeProductType(raw) {
  if (raw == null) return raw;
  const trimmed = String(raw).trim();
  if (trimmed === "") return trimmed;
  return PRODUCT_TYPE_CANONICAL.get(trimmed.toLowerCase()) ?? trimmed;
}

/** Canonicalize a sub_section value (case-insensitive + 3 Roll alias). */
export function canonicalizeSubSection(raw) {
  if (raw == null) return raw;
  const trimmed = String(raw).trim();
  if (trimmed === "") return trimmed;
  return SUB_SECTION_CANONICAL.get(trimmed.toLowerCase()) ?? trimmed;
}

/**
 * SQL predicate matching `column` against a canonical dimension value
 * case-insensitively AND across its known spelling aliases. Used for
 * product_type / sub_section so SideWall/Sidewall and 3 Roll/Three Roll
 * both match the one canonical selection. Returns a parenthesized
 * `LOWER(col) IN (...)` fragment.
 */
export function canonicalDimensionPredicate(column, canonicalValue) {
  const canon = String(canonicalValue).trim();
  const lc = canon.toLowerCase();
  const spellings = new Set([lc]);
  // Gather every raw spelling that canonicalizes to this value.
  const maps =
    column === "product_type"
      ? PRODUCT_TYPE_CANONICAL
      : column === "sub_section"
        ? SUB_SECTION_CANONICAL
        : new Map();
  for (const [rawLc, canonical] of maps) {
    if (canonical.toLowerCase() === lc) spellings.add(rawLc);
  }
  const list = [...spellings]
    .map((s) => `'${s.replaceAll("'", "''")}'`)
    .join(", ");
  return `LOWER(${column}) IN (${list})`;
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
  // changes.md §0/§1: "null" (and "nan") are missing-value sentinels, NOT a
  // child KPI. A Scrap_s row whose drill_down_attribute is the literal
  // "null" is a leaf (children = []); without this it would be wrapped as a
  // fake single-child KPI ["null"] and drilling would open an empty card.
  if (trimmed === "" || trimmed === "[]" || isEmptyValue(trimmed)) return null;

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
// new_change.md C9: "null" is the literal missing-value sentinel in the gold
// layer (a STRING, not SQL NULL), so it belongs in the unset set alongside
// "(unset)" and "nan".
const UNSET_UNIT_TOKENS = new Set(["(unset)", "unset", "nan", "null", ""]);

/**
 * new_change.md C9 — unit alias map. Upper-casing alone never merges the
 * duplicate spellings the source emits: "Meters" -> "METERS" never matches
 * "M", and "NUM" never matches "NOS". Stock NCM_Hold carries both spellings
 * of both units, so without this the same unit renders as two separate rows
 * with two partial totals.
 *
 * Applied to BOTH the incoming filter value and the stored row value so the
 * predicate matches and the display groups into one total.
 */
const UNIT_ALIASES = new Map([
  ["METERS", "M"],
  ["METER", "M"],
  ["NUM", "NOS"],
  // "Tyres" is a business label for the count unit (NOS); folding both
  // spellings into one keeps filter pins and stored rows aligned.
  ["TYRES", "NOS"],
  ["TYRE", "NOS"],
]);
// Exported so the materializer can mirror the same spelling-merge logic
// in JS. Keep the two in lockstep — drift silently halves filtered rows
// when "Meters" is sent and the materializer doesn't fold it.
export { UNIT_ALIASES };

/**
 * Normalize a unit_of_measurement value for display.
 *   - "(unset)" / "nan" / "null" / "" / null → null (treated as "no unit")
 *   - alias-merged per UNIT_ALIASES (Meters → M, NUM → NOS)
 *   - everything else: trimmed, with known labels upper-cased for
 *     consistent casing (KG, NOS, M). "%" and "min" pass through.
 *
 * NOTE: KG and Batch (Mixing) are genuinely DIFFERENT measures of the same
 * production and must never be aliased together — they stay a toggle.
 */
export function normalizeUnit(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (UNSET_UNIT_TOKENS.has(trimmed.toLowerCase())) return null;

  // Canonical casing for the unit-bearing labels. "min" and "%" are kept
  // verbatim; alphabetic codes (kg/nos/m) are upper-cased.
  if (trimmed === "%" || trimmed.toLowerCase() === "min") return trimmed;
  if (/^[a-z]+$/i.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return UNIT_ALIASES.get(upper) ?? upper;
  }
  return trimmed;
}

/**
 * new_change.md C9 — SQL predicate matching a unit_of_measurement filter
 * against every stored spelling that canonicalizes to the same unit.
 * `M` also matches `Meters`; `NOS` also matches `NUM`.
 */
export function unitPredicate(canonicalUnit, column = "unit_of_measurement") {
  const spellings = new Set([canonicalUnit]);
  for (const [alias, canon] of UNIT_ALIASES) {
    if (canon === canonicalUnit) spellings.add(alias);
  }
  const list = [...spellings]
    .map((s) => `'${s.replaceAll("'", "''")}'`)
    .join(", ");
  return `UPPER(TRIM(${column})) IN (${list})`;
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
