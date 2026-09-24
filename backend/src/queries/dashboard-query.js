/**
 * Universal dashboard query builder.
 *
 * Spec: docs/dashboard_logic_guide_v2.pdf §3 ("The Universal Query
 * Pattern") and §15 ("The Whole Backend in One Function").
 *
 * Every dashboard request is one of two shapes:
 *   Shape A — Landing query  (drill_kpis = null)
 *     WHERE <context> AND drill_down_level = 1
 *   Shape B — Drill query    (drill_kpis is an array)
 *     WHERE <context> AND <parent_filters> AND kpi_name IN (drill_kpis)
 *
 * Caller responsibility: assemble the `context` and `parent_filters`
 * dicts from URL/body params (frontend already maintains them in the
 * picker stack). We only build SQL.
 *
 * gold_dummy schema (confirmed via Excel sample 2026-05-27):
 *   record_id, date (DD-MM-YYYY), plant, department, section,
 *   sub_section, tyre_type, machine, product_type, itemcode,
 *   granularity, category, kpi_name, unit_of_measurement,
 *   drill_down_level (1 = landing, 2 = leaf), drill_down_attribute
 *   (JSON-array string), actual_value, previous_value,
 *   threshold_value, status, remarks
 *
 * NULL sentinel: missing values arrive as the literal "nan" — we
 * treat empty + "nan" as "no filter" rather than "filter for nan".
 * Pass `null` for any context key the caller does not set.
 */
import { config } from "../config.js";
import {
  plantDepartmentPredicate,
  normalizeGranularity,
  allowedGranularities,
  excludeUnknownKpiPredicate,
  emptyColumnPredicate,
  nonEmptyColumnPredicate,
  canonicalizeProductType,
  canonicalizeSubSection,
  canonicalDimensionPredicate,
  normalizeUnit,
  unitPredicate,
  tyreTypePredicate,
  TYRE_TYPE_ALL,
  normalizePlantId,
} from "../utils/normalize.js";
import { goldSource } from "./gold-source.js";
import { DATE_YYYYMMDD, isoToYyyymmdd } from "./sql-date.js";

// Re-exported so existing importers (e.g. static.controller.js) keep
// working unchanged now that the definitions live in sql-date.js.
export { DATE_YYYYMMDD, isoToYyyymmdd };

export const ALLOWED_CONTEXT_KEYS = new Set([
  // plant + department are NO LONGER accepted from the caller — they are
  // forced server-side to BANMORE / production (realdata.md §1/§2) so BTP
  // and the Quality department (SPC) can never leak in. Sending them is a
  // validation error to surface stale frontend code early.
  "section",
  "sub_section",
  "product_type",
  "category",
  "tyre_type",
  "granularity",
  "unit_of_measurement",
]);

export const ALLOWED_PARENT_FILTER_KEYS = new Set([
  "machine",
  "itemcode",
]);

/* Tight allow-lists for values that go into WHERE clauses raw.
 * Anything outside these lists is rejected at the route layer. We
 * still escape on the way in via escapeLiteral as defence-in-depth,
 * but reject early so the upstream Lambda never sees junk. */
// realdata.md §4: keep ONLY these four sections. Final Finish and
// TUO & DBM are excluded by being absent from the allow-list.
export const ALLOWED_SECTIONS = new Set(["Mixing", "TBM", "Curing", "Stock"]);
// realdata.md §5: after the BANMORE + Production filter only these three
// categories survive (Cost/Morale/Safety don't exist in the real data;
// SPC lives under department = Quality and is excluded). category = Quality
// is KEPT (the Quality tab: Scrap/Rework/NCM Hold).
export const ALLOWED_CATEGORIES = new Set([
  "Productivity",
  "Quality",
  "Inventory",
]);
// realdata.md §3: real granularities are DAY / MONTH / SHIFT A/B/C (YTD only
// when ENABLE_YEAR). Sourced from the shared normalization layer so this
// stays in lock-step with the synonym map.
export const ALLOWED_GRANULARITIES = allowedGranularities();
// The selectable tyre types. Banmore is PCR-only; CTP runs PCR and TBR.
// "All" applies no filter. "Both" is a STORED value (shared compound), not
// a selection — see tyreTypePredicate. LTR was in this list historically but
// exists in neither gold table, so it is gone.
export const ALLOWED_TYRE_TYPES = new Set([TYRE_TYPE_ALL, "PCR", "TBR"]);

/**
 * SQL predicate restricting rows to the four in-scope sections. The per-request
 * builder gets this via the caller's `section` context; the aggregate helpers
 * (anchors, shift coverage) have no such context and would otherwise report on
 * Final Finish / TUO & DBM / UNKNOWN rows the dashboard can never display.
 */
function inScopeSectionPredicate(column = "section") {
  const list = [...ALLOWED_SECTIONS]
    .map((s) => `'${s.replaceAll("'", "''")}'`)
    .join(", ");
  return `${column} IN (${list})`;
}

/**
 * Equipment-level KPIs are recorded against the MACHINE/LINE, not a
 * product type — OEE rows are product_type NULL and never pin a product
 * (realdata.md §17.2). We exempt these from the product_type predicate so
 * the line-level value always survives when a user has a secondary product
 * selected; the frontend prefers the product-matching row when present and
 * falls back otherwise.
 *
 * realdata.md §9/§10/§15: the dummy's Downtime/Setup/Startup/ToolChange/…
 * KPIs do NOT exist in the real data — Downtime is removed entirely (its
 * purpose is served by the OEE availability-loss reasons). The real
 * OEE-loss reason leaves are: Breakdown, No Schedule, Power Failure,
 * Preventive Maintenance, Setup & Change, Operations/Material/Manpower.
 * Plan_Compliance is kept (null card until data arrives, §15).
 */
export const PRODUCT_AGNOSTIC_KPIS = new Set([
  "OEE_o",
  "OEE_s",
  "Availability_o",
  "Performance_o",
  "Quality_o",
  "Availability_s",
  "Performance_s",
  "Quality_s",
  "OEE_m",
  "Availability_m",
  "Performance_m",
  "Quality_m",
  "Plan_Compliance",
  // Real OEE availability-loss reasons (replace the old Downtime KPI).
  "Breakdown",
  "No Schedule",
  "Power Failure",
  "Preventive Maintenance",
  "Setup & Change",
  "Operations/Material/Manpower",
  // SKU-level Plan Fulfillment / Compliance feed KPIs
  "Building_Fulfilled_Qty_sku",
  "Building_Planned_Qty_sku",
  "Curing_Fulfilled_Qty_sku",
  "Curing_Planned_Qty_sku",
]);

export const PLAN_FULFILLMENT_SKU_KPIS = new Set([
  "Building_Fulfilled_Qty_sku",
  "Building_Planned_Qty_sku",
  "Curing_Fulfilled_Qty_sku",
  "Curing_Planned_Qty_sku",
]);
const PLAN_FULFILLMENT_SKU_KPIS_SQL = `kpi_name IN (${[...PLAN_FULFILLMENT_SKU_KPIS]
  .map((k) => `'${k}'`)
  .join(", ")})`;

/** Pre-built SQL fragment: kpi_name IN ('OEE_o', ...) for the exemption. */
const PRODUCT_AGNOSTIC_KPIS_SQL = `kpi_name IN (${[...PRODUCT_AGNOSTIC_KPIS]
  .map((k) => `'${k}'`)
  .join(", ")})`;

/**
 * Aggregate ("overall") product types whose per-product children are
 * stored under the real product-type names (realdata.md §6a):
 *   - TBM    "Green Tyre" = overall total; products = Passenger Radial,
 *            LCV, Unknown.
 *   - Curing "Cured Tyre" = overall total; products = Passenger Radial,
 *            LCV, Unknown.
 * The card pins the aggregate (product_type NULL for the overall), but
 * product-split drill children carry the real product names. When the
 * aggregate is selected we expand the predicate to also accept the child
 * products so the detail tables populate. (The "overall" row itself —
 * Green/Cured Tyre — is excluded from the per-product list downstream so
 * products don't double-count.)
 */
const AGGREGATE_PRODUCT_CHILDREN = {
  "Green Tyre": ["Passenger Radial", "LCV", "Unknown"],
  "Cured Tyre": ["Passenger Radial", "LCV", "Unknown"],
};
// Exported so the materializer (src/utils/materializer.js) can mirror the
// product-split lookup logic in JS without duplicating this map.
export { AGGREGATE_PRODUCT_CHILDREN };

/**
 * new_change.md C4 — drill levels that store BOTH the aggregate row and its
 * per-product children in the same kpi_name.
 *
 *   Curing Production_m, 2026-07-16:
 *     Cured Tyre       22,300   <- the aggregate (equals the parent card)
 *     Passenger Radial 14,785  ┐
 *     LCV               3,869  ├─ the SAME production, split by product
 *     Unknown           3,646  ┘
 *     all rows summed  44,600  = exactly 2x the parent
 *
 * For these KPIs product_type must be pinned to EXACTLY ONE value — either
 * the aggregate or one child — never left unpinned, never OR'd with the
 * empty/children fallbacks that the generic predicate applies. Those
 * fallbacks are correct for section-level KPIs but are precisely what
 * doubles these ones.
 */
export const PRODUCT_SPLIT_KPIS = new Set([
  "Production_m",
  "Production_sku",
  "Production_m_sku",
  "Production_product",
]);

/** Pre-built SQL fragment: kpi_name IN ('Production_m', ...) for C4. */
const PRODUCT_SPLIT_KPIS_SQL = `kpi_name IN (${[...PRODUCT_SPLIT_KPIS]
  .map((k) => `'${k}'`)
  .join(", ")})`;

/** new_change.md C4/C7 — the aggregate ("overall") product per section. */
export const AGGREGATE_PRODUCT = {
  Curing: "Cured Tyre",
  TBM: "Green Tyre",
};

// realdata.md §16: sub_section values are NOT uniform and differ from the
// dummy (Stock: 4 Roll / 3 Roll / Three Roll / Extruder / Cutter / Slitter /
// Bead; Curing: Trench1…Trench8 with no Trench3, plus the uppercase scrap
// areas BUILDING / CURING / ENGINEERING). The spec says to read them from
// the data, never hardcode a fixed list/range — so we no longer pin a frozen
// allow-list. sub_section values are still bounded by safeStringValue
// (length + no control/meta chars) and escaped on the way into SQL.
export const ALLOWED_SUB_SECTIONS = null;

/**
 * Strict allow-list per context key. Keys not listed here accept any
 * string (length-bounded, no control chars — see safeStringValue).
 * product_type is intentionally unrestricted (dozens of values across
 * sections). Note: Stock has NO synthetic "Overall" product in the real
 * data (changes.md §4) — the frontend no longer sends one.
 */
const CONTEXT_ALLOW_LISTS = {
  section: ALLOWED_SECTIONS,
  category: ALLOWED_CATEGORIES,
  tyre_type: ALLOWED_TYRE_TYPES,
  // granularity is handled specially (normalized via the synonym map, not a
  // raw literal match) and sub_section is read-from-data (no frozen list) —
  // neither has an entry here.
};

/**
 * The gold table's 23 columns, in order. Listed explicitly because the
 * de-duplication below wraps the scan in a sub-query with a ROW_NUMBER()
 * helper column — selecting `*` from that sub-query would leak the helper
 * into the API response.
 */
const GOLD_COLUMNS = [
  "record_id",
  "date",
  "plant",
  "department",
  "section",
  "sub_section",
  "tyre_type",
  "machine",
  "product_type",
  "itemcode",
  "granularity",
  "category",
  "kpi_name",
  "unit_of_measurement",
  "production_ids",
  "drill_down_attribute",
  "drill_down_level",
  "actual_value",
  "previous_values",
  "threshold_value",
  "status",
  "remarks",
  "plot_data",
];

/**
 * The subset of GOLD_COLUMNS a kpi-data row actually needs to reach the UI.
 *
 * The dashboard reads raw rows, so every column in the projection is shipped
 * once per row over the wire. Seven of them are never read by any frontend
 * consumer — `record_id`, `plant`, `department` and `tyre_type` are pins the
 * client already knows (it sent them), and `production_ids` / `previous_values`
 * / `plot_data` are the heavy blob columns (plot_data alone backs the SPC
 * widget board, which queries the table directly via spc.queries.js and never
 * goes through this endpoint).
 *
 * Dropping them from the OUTER select only. The inner de-duplication sub-query
 * still scans the full GOLD_COLUMNS list because DEDUPE_PARTITION partitions on
 * `plant` / `department` / `remarks` / `status`, so narrowing the projection
 * cannot change which row survives the collapse.
 */
const OUTPUT_COLUMNS = [
  "date",
  "section",
  "sub_section",
  "machine",
  "product_type",
  "itemcode",
  "granularity",
  "category",
  "kpi_name",
  "unit_of_measurement",
  "drill_down_attribute",
  "drill_down_level",
  "actual_value",
  "threshold_value",
  "status",
  "remarks",
];

/**
 * Rate / ratio KPIs — the C5 AVERAGE class.
 *
 * These are EXCLUDED from the de-duplication below. Additive rows duplicate
 * with one true value and shadow copies (22,300 alongside a spurious 2,418),
 * so MAX recovers the real figure exactly. Rate rows instead carry several
 * genuinely DIFFERENT values for the same day (Curing OEE_o on 2026-07-08
 * ranges 67.10 - 82.39), so no collapse rule is defensible: MAX biases high,
 * MIN biases low, and none reproduce the spec's validated 82.45% average.
 * Leaving them untouched keeps today's behaviour rather than silently
 * shipping a rule we cannot prove. See the ETL note in the C5 docs.
 */
export const RATE_KPIS = new Set([
  "OEE_o",
  "OEE_s",
  "OEE_m",
  "OEE_p",
  "Availability_o",
  "Availability_s",
  "Availability_m",
  "Performance_o",
  "Performance_s",
  "Performance_m",
  "Quality_o",
  "Quality_s",
  "Quality_m",
  "FTQ",
  "Plan_Compliance",
]);

const RATE_KPIS_SQL = `kpi_name IN (${[...RATE_KPIS]
  .map((k) => `'${k}'`)
  .join(", ")})`;

/**
 * Columns that together identify ONE logical measurement. Two rows agreeing
 * on all of these are duplicates of the same fact, not separate production.
 *
 * `remarks` is part of the identity, not a free-text annotation. The
 * availability/performance loss leaves (Breakdown, Setup & Change, No
 * Schedule, …) store ONE ROW PER REASON, and the reason lives in `remarks`:
 * Mixing machine 0201 has 27 Breakdown rows for Jul-2026 totalling 2,379
 * minutes, one per reason. Without `remarks` in the partition those 27
 * distinct facts looked like 27 copies of one, and __dedupe_rn = 1 kept only
 * the largest — the API returned a single 659-minute row and silently
 * discarded 72 % of the downtime, at DAY and MONTH alike.
 *
 * `status` is the same story for NCM_Hold / NCM_Hold_sku, which store one row
 * per business status (Use As / Rework / Hold / Repass). MS1066 on 2026-08-05
 * carries "Use As" 6,150 AND "Hold" 3,690; without `status` in the partition
 * the smaller one vanished. Mixing / Master Compound / Aug-2026 came back as
 * 114,000 against a true 149,669.89.
 *
 * Adding both is a no-op for the KPIs dedupe actually protects: every
 * Production* and OEE-family row has remarks AND status blank (verified
 * across all 1.2 M of them), so a constant column in the PARTITION BY cannot
 * change their grouping and the C4/C5 over-count guarantees are unchanged.
 */
const DEDUPE_PARTITION = [
  "date",
  "plant",
  "department",
  "section",
  "sub_section",
  "tyre_type",
  "machine",
  "product_type",
  "itemcode",
  "granularity",
  "category",
  "kpi_name",
  "unit_of_measurement",
  "remarks",
  "status",
];

export class QueryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "QueryValidationError";
    this.status = 400;
  }
}

/* ---------- SQL literal helpers ---------- */

export function escapeLiteral(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new QueryValidationError(`Non-finite number: ${value}`);
    }
    return String(value);
  }
  if (typeof value !== "string") {
    throw new QueryValidationError(`Cannot escape non-string: ${typeof value}`);
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    throw new QueryValidationError("Control chars not allowed in literal");
  }
  if (value.length > 200) {
    throw new QueryValidationError("Literal exceeds 200 chars");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function safeStringValue(value, key) {
  if (typeof value !== "string") {
    throw new QueryValidationError(`${key} must be a string`);
  }
  if (value.length === 0 || value.length > 200) {
    throw new QueryValidationError(`${key} length out of bounds`);
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    throw new QueryValidationError(`${key} contains control chars`);
  }
  // Reject SQL meta-chars that could escape the string literal. The
  // single quote IS handled by escapeLiteral's doubling — we only
  // reject other dangerous shapes here.
  if (/[;\\]/.test(value)) {
    throw new QueryValidationError(`${key} contains forbidden chars`);
  }
  return value;
}

/* ---------- Date handling ----------
 *
 * gold_dummy `date` column is ISO yyyy-mm-dd (confirmed 2026-05-28 via
 * sample rows). We accept ISO yyyy-mm-dd from the frontend and pass it
 * through unchanged. DD-MM-YYYY input from older callers is converted
 * back to ISO for the equality predicate.
 *
 * Per existing queries.js, putting `year = X` triggers an upstream
 * Lambda partition-path lookup that often fails. We avoid year/month/
 * day predicates entirely.
 */

function toIsoDate(input) {
  if (typeof input !== "string") {
    throw new QueryValidationError("date must be a string");
  }
  // new_change.md C1: pickers commonly emit a full ISO timestamp
  // ("2026-07-01T00:00:00.000Z"). Strip the time component rather than
  // rejecting the request — a bad-date-format error here blanks the card.
  let value = input.trim();
  const tIndex = value.indexOf("T");
  if (tIndex > 0) value = value.slice(0, tIndex);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (ymd) return value;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  // mm/dd/yyyy and dd-mm-yyyy with slashes — accepted so a locale-formatted
  // picker value never silently fails.
  const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (slash) return `${slash[3]}-${slash[1]}-${slash[2]}`;
  throw new QueryValidationError(`Bad date format: ${input}`);
}

/**
 * new_change.md C1 — resolve the time predicate.
 *
 * A range ALWAYS wins over a leftover single date. The previous logic was
 * an either/or in which `date` took absolute priority, so the frontend's
 * stale "today" value silently discarded every range the user picked and
 * every request was pinned to the same day.
 *
 * @returns {{mode: 'SINGLE_DAY'|'RANGE', date?: string, from?: string, to?: string}}
 */
export function resolveDatePredicate({ date, from, to }) {
  const hasFrom = from != null && from !== "";
  const hasTo = to != null && to !== "";

  if (hasFrom || hasTo) {
    const isoFrom = hasFrom ? toIsoDate(from) : null;
    const isoTo = hasTo ? toIsoDate(to) : null;
    if (isoFrom && isoTo) {
      if (isoFrom > isoTo) {
        throw new QueryValidationError(
          `from (${isoFrom}) must be <= to (${isoTo})`,
        );
      }
      // from == to is a single day, not a range — no aggregation downstream.
      if (isoFrom === isoTo) return { mode: "SINGLE_DAY", date: isoFrom };
    }
    // The single `date` is IGNORED entirely once a range is present.
    return { mode: "RANGE", from: isoFrom, to: isoTo };
  }

  if (date != null && date !== "") {
    return { mode: "SINGLE_DAY", date: toIsoDate(date) };
  }

  // Nothing supplied — the caller (controller) resolves a per-KPI anchor (C6).
  return { mode: "SINGLE_DAY", date: null };
}

/**
 * new_change.md C2 — sentinel meaning "this request must return no rows".
 * Used when a disabled feature (Year, behind ENABLE_YEAR) is requested: a
 * disabled feature must return EMPTY, never fall through to "no filter",
 * which would union every zoom level and silently over-count.
 */
export const NO_DATA = Symbol("NO_DATA");

export const DEFAULT_GRANULARITY = "DAY";

/**
 * new_change.md C2 — resolve exactly ONE granularity for every query.
 *
 * The previous behaviour skipped the predicate entirely whenever the value
 * failed to normalize (empty, "all", or Year-with-the-flag-off), which
 * returned DAY + SHIFT A/B/C + MONTH rows together. Because
 * SHIFT A + SHIFT B + SHIFT C == DAY exactly, and MONTH is a third copy,
 * that produced a 2.00x / 3.21x over-count that looked like a plausible
 * number (Curing Production 1-16 Jul: 301,530 -> 603,060 -> 967,407).
 *
 * @param {string|null|undefined} rawValue  caller-supplied granularity
 * @param {boolean} isRangeMode  true when a from/to window is active
 * @returns {string|symbol} canonical granularity, or NO_DATA
 */
export function resolveGranularity(rawValue, isRangeMode = false) {
  const trimmed = rawValue == null ? "" : String(rawValue).trim();
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");

  // Rule 0.1 (a custom range reads DAY rows, never a MONTH/YEAR snapshot) is
  // enforced by the CALLER, not here. An explicit granularity is always
  // honoured over a range, because SHIFT A/B/C legitimately combine with one:
  // shift rows exist only at DAY level, so a month-wise or custom-range shift
  // total is obtained by SUMMING the daily SHIFT rows across the window (C11).
  // Overriding those to DAY here would make every shift cell return the whole
  // day's production instead of that shift's.
  if (key === "" || key === "all") {
    // With no explicit value, a range still resolves to DAY — which is both
    // the general default and what Rule 0.1 requires.
    void isRangeMode;
    console.warn(
      `[granularity] missing/"all" value -> defaulting to ${DEFAULT_GRANULARITY}`,
    );
    return DEFAULT_GRANULARITY;
  }

  if (key === "ytd" || key === "year" || key === "yearly") {
    const gran = normalizeGranularity(trimmed);
    if (gran != null) return gran;
    console.warn("[granularity] Year/YTD requested while disabled -> no data");
    return NO_DATA;
  }

  const gran = normalizeGranularity(trimmed);
  if (gran == null || !ALLOWED_GRANULARITIES.has(gran)) {
    console.warn(
      `[granularity] unrecognized "${trimmed}" -> defaulting to ${DEFAULT_GRANULARITY}`,
    );
    return DEFAULT_GRANULARITY;
  }
  return gran;
}

/**
 * new_change.md C6 — per-KPI latest-date anchors.
 *
 * KPIs land on different days: Production runs to 2026-07-20 but Curing OEE
 * ends 2026-07-16 and Mixing/Stock/TBM OEE end 2026-07-17. A single global
 * "latest date" taken from Production therefore matches ZERO OEE rows, so the
 * OEE card blanks and its drill is dead in every section.
 *
 * This returns one row per (section, kpi_name) with that KPI's own newest DAY
 * date, so each card can anchor itself and render an "as of <date>" label.
 * One cheap grouped query replaces N per-card lookups.
 */
export function buildLatestDateQuery({ plantId = "banmore" } = {}) {
  const table = goldSource({ plantId, fromKey: null, toKey: null });
  const where = [
    plantDepartmentPredicate(plantId),
    excludeUnknownKpiPredicate(),
    // Same section allow-list the rest of the API enforces — without it the
    // anchors leak TUO & DBM, Final Finish, UNKNOWN and empty-section rows
    // that no card can ever look up (realdata.md §4).
    inScopeSectionPredicate(),
    "granularity = 'DAY'",
  ].join(" AND ");
  return (
    `SELECT section, kpi_name, MAX(${DATE_YYYYMMDD}) AS latest_date ` +
    `FROM ${table} WHERE ${where} GROUP BY section, kpi_name`
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * new_change.md C14 / C15-Q3 — which days are still in progress.
 *
 * A day is PARTIAL when its three shift rows are not all present yet. On
 * 2026-07-20 Curing has SHIFT A and SHIFT C but no SHIFT B, and the DAY total
 * is 6,895 against ~19,000 for a complete day. Comparing that against a full
 * previous day yields -75.3%, which reads as a catastrophic drop but is purely
 * an artefact of the day still running.
 *
 * The frontend cannot derive this for a DAY-granularity card (it has no shift
 * rows in hand), so the server reports it: any (section, date) with fewer than
 * three distinct shifts is incomplete, and the UI suppresses the spike and
 * labels the day rather than rendering the artefact.
 */
export function buildShiftCoverageQuery({ plantId = "banmore" } = {}) {
  const table = goldSource({ plantId, fromKey: null, toKey: null });
  const where = [
    plantDepartmentPredicate(plantId),
    excludeUnknownKpiPredicate(),
    inScopeSectionPredicate(),
    "granularity IN ('SHIFT A', 'SHIFT B', 'SHIFT C')",
    "kpi_name = 'Production'",
  ].join(" AND ");
  return (
    `SELECT section, ${DATE_YYYYMMDD} AS day, ` +
    `COUNT(DISTINCT granularity) AS shift_count ` +
    `FROM ${table} WHERE ${where} GROUP BY section, ${DATE_YYYYMMDD}`
  )
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- new_change.md C15/C16/C17 — the spike baseline ---------- */

/** Days between two ISO dates, inclusive. */
function inclusiveDayCount(isoFrom, isoTo) {
  const ms = Date.parse(`${isoTo}T00:00:00Z`) - Date.parse(`${isoFrom}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Shift an ISO date by whole days (negative shifts backwards). */
function shiftIsoDays(iso, days) {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The whole calendar month immediately before the given ISO date's month,
 * as a 1st→last-day window (e.g. any July date -> {from: Jun 1, to: Jun 30}). */
function previousCalendarMonth(anchorIso) {
  const d = new Date(Date.parse(`${anchorIso.slice(0, 7)}-01T00:00:00Z`));
  d.setUTCMonth(d.getUTCMonth() - 1);
  const from = d.toISOString().slice(0, 10);
  const end = new Date(Date.parse(`${from}T00:00:00Z`));
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from, to: end.toISOString().slice(0, 10) };
}

/** True when [from,to] is exactly the 1st → last day of one calendar month. */
function isFullCalendarMonth(from, to) {
  if (!from || !to) return false;
  if (from.slice(0, 7) !== to.slice(0, 7)) return false;
  if (!from.endsWith("-01")) return false;
  const last = new Date(Date.parse(`${to.slice(0, 7)}-01T00:00:00Z`));
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  return to === last.toISOString().slice(0, 10);
}

/**
 * new_change.md C15 — the comparison window for the % spike indicator.
 *
 * The previous implementation used "the second row in the result set" as the
 * baseline, which is only the previous period by accident: with rows grouped
 * by kpi_name alone it could be an entirely different series (Master Compound
 * against Final Compound), and over a custom range it silently degraded to
 * day-over-day between the last two days inside the range.
 *
 * `previous_values` cannot help — the column is empty in all 389,512 rows —
 * so the baseline has to be derived by re-querying the preceding window.
 *
 * @returns {{date?: string, from?: string, to?: string}|null}
 *          null when no baseline is definable (open-ended range, or a MONTH
 *          snapshot whose predecessor does not exist) — the caller renders
 *          BLANK, never 0%, never -100%.
 */
export function previousWindow(timeScope, granularity) {
  // MONTH/YEAR rows are point-dated snapshots: step the anchor back one whole
  // period rather than subtracting days.
  if (granularity === "MONTH") {
    const anchor = timeScope.date ?? timeScope.from;
    if (!anchor) return null;
    // Snapshot rows are dated the 1st, so a whole-month window is safe for
    // callers that send either a date or a range.
    return previousCalendarMonth(anchor);
  }

  if (timeScope.mode === "SINGLE_DAY") {
    if (!timeScope.date) return null;
    return { date: shiftIsoDays(timeScope.date, -1) };
  }

  // A full calendar month selected via the header month picker arrives here
  // as a DAY range (1st → last day), not a MONTH snapshot — the frontend
  // aggregates the month's DAY rows. Its natural baseline is the PREVIOUS
  // whole calendar month, which the label collapses to "vs Jun", rather than
  // the equal-length day-shifted window below ("31 May – 30 Jun").
  if (isFullCalendarMonth(timeScope.from, timeScope.to)) {
    return previousCalendarMonth(timeScope.from);
  }

  // RANGE: the immediately preceding window of EQUAL length, ending the day
  // before the range starts. 1-16 July (16 days) -> 15-30 June.
  if (!timeScope.from || !timeScope.to) return null; // open-ended: undefinable
  const n = inclusiveDayCount(timeScope.from, timeScope.to);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    from: shiftIsoDays(timeScope.from, -n),
    to: shiftIsoDays(timeScope.from, -1),
  };
}

/* ---------- Public builder ---------- */

/**
 * The scope predicates every dashboard read shares: the always-on core
 * filters, the context picker stack, the date + granularity window, and the
 * parent-row carry-forward filters. Callers append their own row-shape clause
 * (landing band, drill kpi_name list, …) to the returned array.
 *
 * @param {object} input
 * @param {object} input.context  context dict from frontend picker stack
 * @param {object} [input.parentFilters]  carry-forward filters
 *        from clicked row (machine, itemcode)
 * @param {string} [input.date]   ISO yyyy-mm-dd or DD-MM-YYYY
 * @returns {string[]} WHERE predicates, to be joined with AND
 */
function buildScopeWhere({
  plantId = "banmore",
  context = {},
  parentFilters = {},
  date,
  from,
  to,
} = {}) {
  if (typeof context !== "object" || context === null) {
    throw new QueryValidationError("context must be an object");
  }
  if (typeof parentFilters !== "object" || parentFilters === null) {
    throw new QueryValidationError("parentFilters must be an object");
  }

  const where = [];

  // 0. ALWAYS-ON core filters (realdata.md §1/§2/§9). Applied on every
  //    query, before any caller-supplied context, so BTP (wrong plant),
  //    the Quality department (SPC), and the stray UNKNOWN kpi_name can
  //    never reach the dashboard. Plant is matched uppercase, department
  //    lowercase — case-insensitive against the real data's casing.
  where.push(plantDepartmentPredicate(plantId));
  where.push(excludeUnknownKpiPredicate());

  // 1. Context filters. Keys outside ALLOWED_CONTEXT_KEYS are
  //    rejected so the frontend can't smuggle extra columns into the
  //    WHERE without us adding them deliberately.
  for (const [key, raw] of Object.entries(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) {
      throw new QueryValidationError(`Unknown context key: ${key}`);
    }
    if (raw == null || raw === "") continue; // null / empty = no filter

    const value = safeStringValue(raw, key);

    // granularity is resolved OUTSIDE this loop (new_change.md C2) so that a
    // missing / empty / unrecognized value still produces a predicate. See
    // the resolveGranularity call below — there is no code path that omits it.
    if (key === "granularity") continue;

    const allow = CONTEXT_ALLOW_LISTS[key];
    if (allow && !allow.has(value)) {
      throw new QueryValidationError(
        `Invalid ${key}: ${value}. Allowed: ${[...allow].join(", ")}`,
      );
    }
    // changes.md §6: canonicalize the incoming filter value before it goes
    // into the predicate, so "Sidewall"/"sidewall" match the canonical
    // "SideWall" rows and "Three Roll" matches "3 Roll".
    const canonValue =
      key === "product_type"
        ? canonicalizeProductType(value)
        : key === "sub_section"
          ? canonicalizeSubSection(value)
          : value;
    // new_change.md C9 — match every stored spelling of the same unit
    // ("Meters" == "M", "NUM" == "NOS") so the filter doesn't silently miss
    // half the rows. KG vs Batch are NOT aliased — they stay distinct.
    // tyre_type: "All" places no restriction, and a line selection also
    // keeps the shared-compound rows (tyre_type = 'Both') — Mixing at CTP
    // is recorded entirely as 'Both' and would otherwise vanish.
    if (key === "tyre_type") {
      const predicate = tyreTypePredicate(value, key);
      if (predicate) where.push(predicate);
      continue;
    }

    if (key === "unit_of_measurement") {
      const canonUnit = normalizeUnit(value);
      if (canonUnit == null) {
        where.push(emptyColumnPredicate(key));
      } else {
        where.push(unitPredicate(canonUnit, key));
      }
      continue;
    }

    if (key === "section" || key === "sub_section" || key === "product_type") {
      // Filter to the requested value BUT also keep rows that carry no
      // value for this column (NULL / 'nan' / ''):
      //   - section: plant-level KPIs (Absenteeism) have no section.
      //   - sub_section: section-level + plant-level rows have none.
      //   - product_type: section-level KPIs (e.g. OEE in Stock/Curing)
      //     have none, so they survive when a specific product is picked.
      // This lets the selection be a real server-side filter without
      // dropping the non-product-scoped rows the grid still needs.
      //
      // product_type additionally exempts the equipment-level KPIs
      // (PRODUCT_AGNOSTIC_KPIS): these are line metrics that some sections
      // record ONLY under a primary product (TBM "Green Tyre") with no
      // NULL fallback, so the NULL clause above can't save them. Without
      // this exemption, selecting a secondary product type makes OEE /
      // Downtime cards disappear. The frontend prefers the product-matching
      // row when present and falls back to the line-level row otherwise.
      let extra =
        key === "product_type" ? ` OR ${PRODUCT_AGNOSTIC_KPIS_SQL}` : "";
      // Aggregate product types (Green/Cured Tyre): also accept the child
      // tyre categories so SKU-level drill children populate (see map docs).
      if (key === "product_type" && AGGREGATE_PRODUCT_CHILDREN[canonValue]) {
        const kids = AGGREGATE_PRODUCT_CHILDREN[canonValue]
          .map((c) => `${key} = ${escapeLiteral(c)}`)
          .join(" OR ");
        extra += ` OR ${kids}`;
      }
      // Match clause: exact for section; canonical case-insensitive +
      // spelling-alias match for product_type / sub_section (§6). The empty
      // fallback (emptyColumnPredicate) treats NULL / "nan" / "null" / "" as
      // "no value" so overall / section-level rows survive (§0).
      const matchClause =
        key === "product_type" || key === "sub_section"
          ? canonicalDimensionPredicate(key, canonValue)
          : `${key} = ${escapeLiteral(canonValue)}`;
      const lenient = `(${matchClause} OR ${emptyColumnPredicate(key)}${extra})`;

      // new_change.md C4 — the lenient predicate above is correct for
      // section-level rows (it keeps OEE and other product-agnostic KPIs alive
      // when a product is selected), but it is exactly what doubles the
      // product-split levels: those store the aggregate row AND its per-product
      // children under the same kpi_name, so "match OR empty OR children"
      // matches both halves and sums to 2x the parent card.
      //
      // Split the predicate by row type rather than by request shape: rows
      // whose kpi_name is a product-split level must match ONE product exactly;
      // every other row keeps the lenient fallbacks. This holds for landing
      // rows, drill rows, and mixed responses alike.
      if (key === "product_type") {
        where.push(
          `((${PRODUCT_SPLIT_KPIS_SQL} AND ${matchClause}) ` +
            `OR (NOT ${PRODUCT_SPLIT_KPIS_SQL} AND ${lenient}))`,
        );
      } else {
        where.push(lenient);
      }
    } else {
      where.push(`${key} = ${escapeLiteral(value)}`);
    }
  }

  // 2. Date predicate (new_change.md C1). Format-robust: compare the
  //    normalized YYYYMMDD form of the stored `date` against the YYYYMMDD
  //    form of the caller's input. A range ALWAYS wins over a stale single
  //    date — resolveDatePredicate enforces the priority and rejects from>to.
  const timeScope = resolveDatePredicate({ date, from, to });

  // 2b. Granularity predicate (new_change.md C2). ALWAYS emitted — an empty,
  //     "all", or unrecognized value defaults to DAY rather than dropping the
  //     predicate. Omitting it unions DAY + SHIFT A/B/C (+ MONTH), and since
  //     SHIFT A+B+C == DAY exactly, the result is a silent 2x–3.21x over-count.
  const granPredicate = resolveGranularity(
    context.granularity,
    timeScope.mode === "RANGE",
  );
  if (granPredicate === NO_DATA) {
    // A disabled feature (Year with the flag off) must return NOTHING rather
    // than wrong data. An always-false predicate keeps the response shape.
    where.push("1 = 0");
  } else {
    where.push(`granularity = ${escapeLiteral(granPredicate)}`);
  }

  if (timeScope.mode === "SINGLE_DAY") {
    if (timeScope.date) {
      where.push(`${DATE_YYYYMMDD} = '${isoToYyyymmdd(timeScope.date)}'`);
    }
  } else {
    if (timeScope.from) {
      where.push(`${DATE_YYYYMMDD} >= '${isoToYyyymmdd(timeScope.from)}'`);
    }
    if (timeScope.to) {
      where.push(`${DATE_YYYYMMDD} <= '${isoToYyyymmdd(timeScope.to)}'`);
    }
  }

  // 3. Parent filters carried forward from clicked rows.
  for (const [key, raw] of Object.entries(parentFilters)) {
    if (!ALLOWED_PARENT_FILTER_KEYS.has(key)) {
      throw new QueryValidationError(`Unknown parent filter: ${key}`);
    }
    if (raw == null || raw === "") continue;
    const value = safeStringValue(raw, key);
    where.push(`${key} = ${escapeLiteral(value)}`);
  }

  return { where, timeScope };
}

/**
 * Resolved date scope (from resolveDatePredicate) → {fromKey, toKey}
 * YYYYMMDD digit strings for goldSource's window resolution. Either side
 * is null when that bound is open-ended.
 */
function timeScopeWindow(timeScope) {
  if (timeScope.mode === "SINGLE_DAY") {
    const key = timeScope.date ? isoToYyyymmdd(timeScope.date) : null;
    return { fromKey: key, toKey: key };
  }
  return {
    fromKey: timeScope.from ? isoToYyyymmdd(timeScope.from) : null,
    toKey: timeScope.to ? isoToYyyymmdd(timeScope.to) : null,
  };
}

/**
 * Build SELECT SQL for one dashboard fetch.
 *
 * @param {object} input
 * @param {object} input.context  context dict from frontend picker stack
 * @param {string} [input.date]   ISO yyyy-mm-dd or DD-MM-YYYY
 * @param {string[]|null} [input.drillKpis]
 *        null/undefined → landing query (drill_down_level = 1)
 *        non-empty array → drill query (kpi_name IN ...)
 * @param {object} [input.parentFilters]  carry-forward filters
 *        from clicked row (machine, itemcode)
 * @param {number} [input.limit]
 * @returns {string} SQL
 */
export function buildFetchQuery({
  plantId = "banmore",
  context = {},
  date,
  from,
  to,
  drillKpis = null,
  parentFilters = {},
  limit = 5000,
  // Pagination + drill-only mode (used by the paginated Production drill).
  // offset: rows to skip. drillOnly: when true, return ONLY the drill rows
  // (kpi_name IN drillKpis) — NO landing band — so a page is exactly `limit`
  // rows of that one lens for LIMIT/OFFSET paging.
  offset = 0,
  drillOnly = false,
  // The kpi_names the landing grid actually renders for this (section,
  // category), sent by the client from its own ALLOWED_KPIS catalogue.
  // null/omitted → every landing-level kpi_name, the pre-existing behaviour.
  landingKpis = null,
} = {}) {
  const { where, timeScope } = buildScopeWhere({
    plantId,
    context,
    parentFilters,
    date,
    from,
    to,
  });
  const { fromKey, toKey } = timeScopeWindow(timeScope);

  // 4. Drill shape. Null/undefined → landing only. Array → return BOTH
  //    landing rows AND drill children so the grid always has cards while
  //    the drill panel is open.
  //
  //    A landing card is a TOP-LEVEL row. Most carry drill_down_level = 1,
  //    but the Quality Scrap/Rework parents (quality-change.md §4/§5) are
  //    stored with drill_down_level = NULL. The spec says navigation is
  //    attribute-driven and drill_down_level is "not used" — so we identify
  //    a landing card structurally: drill_down_level = 1, OR a parent row
  //    with no machine / itemcode / sub_section (a true section/plant-level
  //    card). The sub_section IS NULL clause keeps the Scrap_s / Scrap_reason
  //    children OUT of the landing grid (they carry a sub_section).
  // drill_down_level is stored as a VARCHAR in the real gold table
  // ("1", not 1), so compare against a string literal — Athena rejects
  // `varchar = integer` with a TYPE_MISMATCH.
  //
  // The value is NOT stored consistently: the Production family uses the
  // clean integer string "1", but the OEE family (OEE_o / Availability_o /
  // Performance_o / Quality_o) is stored FLOAT-formatted as "1.0". A bare
  // `= '1'` string match therefore silently drops every overall-OEE landing
  // card (found 2026-07-23: OEE blank in Mixing/Curing Productivity). Accept
  // both spellings so the landing gate is level-based, not format-based.
  const LANDING_PREDICATE =
    "((kpi_name = 'Building_Fulfilled_Qty_sku' OR kpi_name = 'Building_Planned_Qty_sku' OR kpi_name = 'Curing_Fulfilled_Qty_sku' OR kpi_name = 'Curing_Planned_Qty_sku') OR drill_down_level IN ('1', '1.0') OR (drill_down_level IS NULL " +
    `AND ${emptyColumnPredicate("machine")} ` +
    `AND ${emptyColumnPredicate("itemcode")} ` +
    `AND ${emptyColumnPredicate("sub_section")}))`;
  if (drillKpis == null) {
    where.push(LANDING_PREDICATE);
  } else {
    if (!Array.isArray(drillKpis) || drillKpis.length === 0) {
      throw new QueryValidationError(
        "drillKpis must be a non-empty array or null",
      );
    }
    if (drillKpis.length > 32) {
      throw new QueryValidationError("drillKpis exceeds 32 entries");
    }
    const escaped = drillKpis.map((k) =>
      escapeLiteral(safeStringValue(k, "drillKpis[]")),
    );
    if (drillOnly) {
      // Paginated drill: ONLY the drill rows for this lens — no landing band
      // — so a page is exactly `limit` rows of `kpi_name IN (...)`.
      where.push(`kpi_name IN (${escaped.join(", ")})`);
    } else {
      // Always include landing rows so the grid doesn't go empty during drill.
      where.push(`(${LANDING_PREDICATE} OR kpi_name IN (${escaped.join(", ")}))`);
    }
  }

  // 4b. Narrow the landing band to the KPIs the grid RENDERS.
  //
  // The landing predicate above selects every top-level row in the
  // (section, category) scope, but the grid only ever draws the 3-4 KPIs in
  // its catalogue — toKpiGrid discards the rest against the same allow-list
  // the client sends here. Mixing/Productivity returns 6 landing kpi_names for
  // the 3 on screen — Availability_o, Performance_o, Quality_o and OEE_p are
  // all fetched and thrown away — so roughly half of every response was pure
  // waste, multiplied by each day in the window.
  //
  // Union'd with drillKpis, never intersected: the C7 `Production_product`
  // request rides on the landing payload and is NOT in the grid catalogue, so
  // an allow-list that excluded it would blank the TBM/Curing Production card.
  // Skipped entirely under drillOnly, where `kpi_name IN (drillKpis)` above is
  // already the tighter filter.
  if (!drillOnly && landingKpis != null) {
    if (!Array.isArray(landingKpis) || landingKpis.length === 0) {
      throw new QueryValidationError(
        "landingKpis must be a non-empty array or null",
      );
    }
    const names = new Set(
      landingKpis.map((k) => safeStringValue(k, "landingKpis[]")),
    );
    for (const k of Array.isArray(drillKpis) ? drillKpis : []) {
      names.add(safeStringValue(k, "drillKpis[]"));
    }
    if (names.size > 64) {
      throw new QueryValidationError("landingKpis exceeds 64 entries");
    }
    where.push(
      `kpi_name IN (${[...names].map((n) => escapeLiteral(n)).join(", ")})`,
    );
  }

  // 5. Bound result size. Upstream Lambda has its own limit too.
  const lim =
    Number.isInteger(limit) && limit > 0 && limit <= 10000 ? limit : 5000;
  const off = Number.isInteger(offset) && offset > 0 ? offset : 0;

  const table = goldSource({ plantId, fromKey, toKey });
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // Athena (Trino) has no `* EXCLUDE(...)` syntax and serializes a DATE
  // column to an ISO yyyy-mm-dd string natively, so a plain `SELECT *`
  // is both valid and gives transformers the `date` field they expect.
  // The EXCLUDE trick is only needed on the legacy databricks/DuckDB
  // path, whose Lambda 500s serializing a raw DATE column — there we
  // drop `date` and re-add it cast to VARCHAR.
  //
  // DE-DUPLICATION (blocking data defect, found 2026-07-21).
  //
  // The gold table contains rows that are identical on EVERY dimension —
  // same record_id, date, granularity and pins — so no amount of predicate
  // tightening removes them:
  //
  //   Curing Production, DAY, 2026-07-16:
  //     record_id 343598214367 -> 22,300   the real value
  //     record_id 343598214367 ->  2,418   spurious shadow row
  //   Curing Production, DAY, 2026-07-01:
  //     record_id 17179953339  -> 16,907   x22 identical rows
  //
  // Raw, Curing Production 1-16 Jul reads 721,497 against a validated
  // 301,530 (2.39x) — a third over-count cause on top of C2 and C4.
  //
  // Keeping the highest value per logical measurement reproduces every
  // validated additive figure exactly (301,530 total; shifts 101,348 /
  // 99,127 / 101,055, which re-sum to 301,530; 22,300 on 07-16), because the
  // shadow rows are always partial. Rate KPIs are deliberately EXEMPT — see
  // RATE_KPIS — as their duplicates hold genuinely different values and no
  // collapse rule is provable. This is a query-layer compensation for an ETL
  // defect; the real fix is de-duplicating the gold table upstream.
  const dateCol =
    config.upstream.engine === "databricks"
      ? "CAST(date AS VARCHAR) AS date"
      : "date";
  const innerCols = GOLD_COLUMNS.map((c) => (c === "date" ? dateCol : c)).join(
    ", ",
  );
  // Only the columns a row needs to reach the UI — see OUTPUT_COLUMNS. The
  // inner scan keeps the full list so the dedupe partition is unchanged.
  const outerCols = OUTPUT_COLUMNS.join(", ");
  const dedupedSource =
    `(SELECT ${innerCols}, ROW_NUMBER() OVER (` +
    `PARTITION BY ${DEDUPE_PARTITION.join(", ")} ` +
    `ORDER BY actual_value DESC) AS __dedupe_rn ` +
    `FROM ${table} ${whereSql})`;

  // ORDER BY newest-first BEFORE the LIMIT: if a wide window ever exceeds
  // the row cap, truncation drops the OLDEST rows, never the latest ones
  // the cards/snapshots need. A machine/itemcode/unit tiebreak makes the
  // order fully deterministic so LIMIT/OFFSET paging is stable (no skipped or
  // repeated rows between pages) and rows land in a readable grouping.
  // Trino wants OFFSET before LIMIT; emit OFFSET only when non-zero so the
  // first page stays a plain LIMIT.
  const drillPriority =
    "CASE WHEN kpi_name IN (" +
    [
      "OEE_o",
      "OEE_s",
      "OEE_m",
      "Availability_o",
      "Availability_s",
      "Availability_m",
      "Performance_o",
      "Performance_s",
      "Performance_m",
      "Quality_o",
      "Quality_s",
      "Quality_m",
    ]
      .map(escapeLiteral)
      .join(", ") +
    ") THEN 0 ELSE 1 END";
  const orderBy =
    `ORDER BY ${DATE_YYYYMMDD} DESC, ${drillPriority}, ` +
    `machine, kpi_name, itemcode, unit_of_measurement, actual_value`;
  const pageClause = off > 0 ? `OFFSET ${off} LIMIT ${lim}` : `LIMIT ${lim}`;
  return (
    `SELECT ${outerCols} FROM ${dedupedSource} ` +
    `WHERE (__dedupe_rn = 1 OR ${RATE_KPIS_SQL}) ${orderBy} ${pageClause}`
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * KPIs `buildDrillAggregateQuery` may sum. Deliberately narrow: SUM is only
 * the right roll-up for the additive Production leaves (kpi-transformer's
 * classifyKpiAggregation returns SUM for these). A rate KPI would need AVERAGE
 * and a level KPI the latest day, so neither is allowed in rather than being
 * silently summed into a wrong number.
 */
const AGGREGATABLE_DRILL_KPIS = new Set([
  "Production_m",
  "Production_sku",
  "Production_m_sku",
  "Production_s",
]);

/** Dimensions a drill page may group by. */
const AGGREGATE_GROUP_COLUMNS = new Set(["machine", "itemcode", "sub_section"]);

/**
 * Build SELECT SQL for ONE page of a drill lens, already rolled up per
 * grouping key.
 *
 * Why this exists rather than paging raw rows: over a date range the gold
 * table stores one row per (machine, itemcode, DAY), so a raw LIMIT/OFFSET
 * page slices *days*, not machines. The client then groups what it got, which
 * (a) makes the page's displayed row count unrelated to the page size, and
 * (b) splits a single machine across two pages, showing a partial total on
 * each. Grouping in SQL makes one result row == one displayed row, so the page
 * window and the totals both mean what they say.
 *
 * Aggregation matches the frontend's aggregateForRange exactly: SUM over the
 * window, with missing days simply absent (never counted as 0). De-duplication
 * runs BEFORE the SUM, so the shadow rows documented above cannot inflate it.
 *
 * @param {object} input
 * @param {object} input.context  context dict from frontend picker stack
 * @param {string} input.kpiName  one additive Production leaf
 * @param {string[]} input.groupBy  dimension columns, e.g. ["machine"]
 * @returns {string} SQL
 */
export function buildDrillAggregateQuery({
  plantId = "banmore",
  context = {},
  parentFilters = {},
  date,
  from,
  to,
  kpiName,
  groupBy = [],
  limit = 100,
  offset = 0,
} = {}) {
  const safeKpi = safeStringValue(kpiName ?? "", "kpiName");
  if (!AGGREGATABLE_DRILL_KPIS.has(safeKpi)) {
    throw new QueryValidationError(
      `Invalid kpiName: ${safeKpi}. Allowed: ${[...AGGREGATABLE_DRILL_KPIS].join(", ")}`,
    );
  }
  if (!Array.isArray(groupBy) || groupBy.length === 0) {
    throw new QueryValidationError("groupBy must be a non-empty array");
  }
  const cols = [...new Set(groupBy.map((c) => safeStringValue(c, "groupBy[]")))];
  for (const col of cols) {
    if (!AGGREGATE_GROUP_COLUMNS.has(col)) {
      throw new QueryValidationError(
        `Invalid groupBy column: ${col}. Allowed: ${[...AGGREGATE_GROUP_COLUMNS].join(", ")}`,
      );
    }
  }

  const { where, timeScope } = buildScopeWhere({
    plantId,
    context,
    parentFilters,
    date,
    from,
    to,
  });
  where.push(`kpi_name = ${escapeLiteral(safeKpi)}`);

  // A machine-grouped lens is machine data: rows that carry no machine
  // (SQL NULL or the "nan"/"null"/"" sentinels) would collapse into one
  // anonymous bucket and render as a "—" row whose total belongs to no
  // machine on the floor. CTP's gold table has such rows; drop them at
  // source so the page window, the row count and the totals all agree.
  if (cols.includes("machine")) {
    where.push(nonEmptyColumnPredicate("machine"));
  }

  const lim = Number.isInteger(limit) && limit > 0 && limit <= 10000 ? limit : 100;
  const off = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const { fromKey, toKey } = timeScopeWindow(timeScope);
  const table = goldSource({ plantId, fromKey, toKey });
  const dateCol =
    config.upstream.engine === "databricks"
      ? "CAST(date AS VARCHAR) AS date"
      : "date";
  const innerCols = GOLD_COLUMNS.map((c) => (c === "date" ? dateCol : c)).join(
    ", ",
  );
  const dedupedSource =
    `(SELECT ${innerCols}, ROW_NUMBER() OVER (` +
    `PARTITION BY ${DEDUPE_PARTITION.join(", ")} ` +
    `ORDER BY actual_value DESC) AS __dedupe_rn ` +
    `FROM ${table} WHERE ${where.join(" AND ")})`;

  // Normalize the grouping keys so the NULL / "nan" / "" spellings of "no
  // value" collapse into ONE bucket instead of several look-alike rows.
  const keyExprs = cols.map((c) => `${cleanedColumn(c)} AS ${c}`);
  // Measures stay VARCHAR in gold; TRY_CAST turns the unparseable ones into
  // NULL, which SUM skips — so a missing day never lands as a 0.
  const measures = [
    "SUM(TRY_CAST(actual_value AS DOUBLE)) AS actual_value",
    "SUM(TRY_CAST(threshold_value AS DOUBLE)) AS threshold_value",
    // The single unit for the group; the caller already pins one, so MIN is
    // just a deterministic pick rather than a real choice.
    `MIN(${cleanedColumn("unit_of_measurement")}) AS unit_of_measurement`,
  ];
  // GROUP BY ordinals — the key expressions are non-trivial and Trino matches
  // them positionally without re-stating the CASE.
  const groupOrdinals = cols.map((_, i) => i + 1).join(", ");
  const orderBy = cols.join(", ");
  const pageClause = off > 0 ? `OFFSET ${off} LIMIT ${lim}` : `LIMIT ${lim}`;

  return (
    `SELECT ${[...keyExprs, ...measures].join(", ")} FROM ${dedupedSource} ` +
    `WHERE __dedupe_rn = 1 GROUP BY ${groupOrdinals} ` +
    `ORDER BY ${orderBy} ${pageClause}`
  )
    .replace(/\s+/g, " ")
    .trim();
}

function dateWhereParts({ date, from, to }) {
  const timeScope = resolveDatePredicate({ date, from, to });
  const parts = [];
  if (timeScope.mode === "SINGLE_DAY") {
    if (timeScope.date) {
      parts.push(`${DATE_YYYYMMDD} = '${isoToYyyymmdd(timeScope.date)}'`);
    }
  } else {
    if (timeScope.from) {
      parts.push(`${DATE_YYYYMMDD} >= '${isoToYyyymmdd(timeScope.from)}'`);
    }
    if (timeScope.to) {
      parts.push(`${DATE_YYYYMMDD} <= '${isoToYyyymmdd(timeScope.to)}'`);
    }
  }
  return { parts, timeScope };
}

function cleanedColumn(column) {
  return (
    `CASE WHEN ${column} IS NULL OR LOWER(TRIM(CAST(${column} AS VARCHAR))) ` +
    `IN ('', 'nan', 'null') THEN NULL ELSE TRIM(CAST(${column} AS VARCHAR)) END`
  );
}

export function buildProductOptionsQuery({
  plantId = "banmore",
  context = {},
  date,
  from,
  to,
  limit = 1000,
} = {}) {
  if (typeof context !== "object" || context === null) {
    throw new QueryValidationError("context must be an object");
  }
  const section = safeStringValue(context.section ?? "", "section");
  if (!ALLOWED_SECTIONS.has(section)) {
    throw new QueryValidationError(
      `Invalid section: ${section}. Allowed: ${[...ALLOWED_SECTIONS].join(", ")}`,
    );
  }

  const where = [
    plantDepartmentPredicate(plantId),
    excludeUnknownKpiPredicate(),
    `section = ${escapeLiteral(section)}`,
    `category = ${escapeLiteral("Productivity")}`,
    `kpi_name = ${escapeLiteral("Production")}`,
    "TRY_CAST(actual_value AS DOUBLE) IS NOT NULL",
  ];

  if (context.sub_section) {
    const subSection = canonicalizeSubSection(
      safeStringValue(context.sub_section, "sub_section"),
    );
    where.push(canonicalDimensionPredicate("sub_section", subSection));
  }

  // Scope the options to the selected tyre line, so a product only the
  // other line makes doesn't stay on the pill row after switching.
  if (context.tyre_type) {
    const predicate = tyreTypePredicate(
      safeStringValue(context.tyre_type, "tyre_type"),
    );
    if (predicate) where.push(predicate);
  }

  const { parts: dateParts, timeScope } = dateWhereParts({ date, from, to });
  where.push(...dateParts);

  const gran = resolveGranularity(
    context.granularity,
    timeScope.mode === "RANGE",
  );
  if (gran === NO_DATA) {
    where.push("1 = 0");
  } else {
    where.push(`granularity = ${escapeLiteral(gran)}`);
  }

  const lim =
    Number.isInteger(limit) && limit > 0 && limit <= 10000 ? limit : 1000;
  const productType = cleanedColumn("product_type");
  const unit = cleanedColumn("unit_of_measurement");
  const { fromKey, toKey } = timeScopeWindow(timeScope);
  const table = goldSource({ plantId, fromKey, toKey });

  return (
    `SELECT DISTINCT ${productType} AS product_type, ${unit} AS unit_of_measurement ` +
    `FROM ${table} WHERE ${where.join(" AND ")} ` +
    `ORDER BY product_type, unit_of_measurement LIMIT ${lim}`
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function buildShiftComparisonQuery({
  plantId = "banmore",
  section,
  subSection = null,
  category,
  date,
  from,
  to,
  extraKpis = null,
  limit = 10000,
} = {}) {
  const safeSection = safeStringValue(section ?? "", "section");
  if (!ALLOWED_SECTIONS.has(safeSection)) {
    throw new QueryValidationError(
      `Invalid section: ${safeSection}. Allowed: ${[...ALLOWED_SECTIONS].join(", ")}`,
    );
  }
  const safeCategory = safeStringValue(category ?? "", "category");
  if (!ALLOWED_CATEGORIES.has(safeCategory)) {
    throw new QueryValidationError(
      `Invalid category: ${safeCategory}. Allowed: ${[...ALLOWED_CATEGORIES].join(", ")}`,
    );
  }

  const LANDING_PREDICATE =
    "(drill_down_level IN ('1', '1.0') OR (drill_down_level IS NULL " +
    `AND ${emptyColumnPredicate("machine")} ` +
    `AND ${emptyColumnPredicate("itemcode")} ` +
    `AND ${emptyColumnPredicate("sub_section")}))`;
  const where = [
    plantDepartmentPredicate(plantId),
    excludeUnknownKpiPredicate(),
    `section = ${escapeLiteral(safeSection)}`,
    // CTP (gold.ctp_gold) stores Scrap-family rows under category='Scrap'
    // while Banmore (gold.gold) stores them under category='Quality'. The
    // frontend always sends 'Quality' for Scrap/Rework shift charts; on CTP
    // we widen the predicate to also pick up the Scrap-category rows so
    // the chart reflects the actual gold vocabulary instead of always
    // returning empty. Rework rows still don't exist at CTP — that's a
    // data-side gap, not a filter mismatch.
    normalizePlantId(plantId) === "chennai" && safeCategory === "Quality"
      ? `(category = ${escapeLiteral("Quality")} OR category = ${escapeLiteral("Scrap")})`
      : `category = ${escapeLiteral(safeCategory)}`,
    "granularity IN ('SHIFT A', 'SHIFT B', 'SHIFT C')",
  ];

  const safeExtraKpis = Array.isArray(extraKpis)
    ? [...new Set(extraKpis.map((k) => safeStringValue(k, "extraKpis[]")))]
    : [];
  if (safeExtraKpis.length > 0) {
    where.push(
      `(${LANDING_PREDICATE} OR kpi_name IN (${safeExtraKpis
        .map(escapeLiteral)
        .join(", ")}))`,
    );
  } else {
    where.push(LANDING_PREDICATE);
  }

  if (subSection) {
    const safeSubSection = canonicalizeSubSection(
      safeStringValue(subSection, "subSection"),
    );
    where.push(canonicalDimensionPredicate("sub_section", safeSubSection));
  }

  const { parts: dateParts, timeScope } = dateWhereParts({ date, from, to });
  where.push(...dateParts);

  const lim =
    Number.isInteger(limit) && limit > 0 && limit <= 10000 ? limit : 10000;
  const { fromKey, toKey } = timeScopeWindow(timeScope);
  const table = goldSource({ plantId, fromKey, toKey });
  const dateCol =
    config.upstream.engine === "databricks"
      ? "CAST(date AS VARCHAR) AS date"
      : "date";
  const innerCols = GOLD_COLUMNS.map((c) => (c === "date" ? dateCol : c)).join(
    ", ",
  );
  const outerCols = GOLD_COLUMNS.join(", ");
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const dedupedSource =
    `(SELECT ${innerCols}, ROW_NUMBER() OVER (` +
    `PARTITION BY ${DEDUPE_PARTITION.join(", ")} ` +
    `ORDER BY actual_value DESC) AS __dedupe_rn ` +
    `FROM ${table} ${whereSql})`;

  return (
    `SELECT ${outerCols} FROM ${dedupedSource} ` +
    `WHERE (__dedupe_rn = 1 OR ${RATE_KPIS_SQL}) ` +
    `ORDER BY ${DATE_YYYYMMDD} DESC, granularity, machine, kpi_name, ` +
    `itemcode, unit_of_measurement, actual_value LIMIT ${lim}`
  )
    .replace(/\s+/g, " ")
    .trim();
}
