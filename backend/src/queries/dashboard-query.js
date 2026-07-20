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
  canonicalizeProductType,
  canonicalizeSubSection,
  canonicalDimensionPredicate,
} from "../utils/normalize.js";

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
export const ALLOWED_TYRE_TYPES = new Set(["PCR", "TBR", "LTR", "All"]);

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
]);

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
 * SQL expression that normalizes the `date` column to a sortable,
 * comparable YYYYMMDD string REGARDLESS of stored type/format. The live
 * gold_dummy stores `date` as a real DATE type; older/CSV-backed envs
 * store it as a STRING in ISO `yyyy-mm-dd` or `DD-MM-YYYY`. We:
 *   1. CAST to VARCHAR first — SUBSTRING needs VARCHAR, and a DATE casts
 *      to ISO "yyyy-mm-dd"; a string passes through unchanged.
 *   2. Detect the format by dash position rather than assuming one:
 *        ISO         "2026-04-01" → dash at char 5 → YYYY MM DD inline
 *        DD-MM-YYYY  "01-04-2026" → dash at char 3 → reorder to YYYYMMDD
 * Engine-agnostic (Athena / DuckDB / Trino). No year/month/day column
 * predicate (those trigger upstream partition-path lookups that fail).
 */
const DATE_STR = "CAST(date AS VARCHAR)";
export const DATE_YYYYMMDD =
  `(CASE WHEN SUBSTRING(${DATE_STR}, 5, 1) = '-' ` +
  `THEN SUBSTRING(${DATE_STR}, 1, 4) || SUBSTRING(${DATE_STR}, 6, 2) || SUBSTRING(${DATE_STR}, 9, 2) ` +
  `ELSE SUBSTRING(${DATE_STR}, 7, 4) || SUBSTRING(${DATE_STR}, 4, 2) || SUBSTRING(${DATE_STR}, 1, 2) END)`;

/** ISO yyyy-mm-dd → YYYYMMDD digit string for comparison literals. */
function isoToYyyymmdd(iso) {
  return iso.replaceAll("-", "");
}

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
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (ymd) return input;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  throw new QueryValidationError(`Bad date format: ${input}`);
}

/* ---------- Public builder ---------- */

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
  context = {},
  date,
  from,
  to,
  drillKpis = null,
  parentFilters = {},
  limit = 5000,
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
  where.push(plantDepartmentPredicate());
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

    // granularity: normalize synonyms → canonical real value (DAY / MONTH /
    // SHIFT A/B/C), then validate against the allowed set. A YTD/Year value
    // with the Year flag OFF normalizes to null → no granularity predicate
    // (realdata.md §3). Anything still unrecognized is rejected.
    if (key === "granularity") {
      const gran = normalizeGranularity(value);
      if (gran == null) continue; // disabled (YTD) or "all" → no filter
      if (!ALLOWED_GRANULARITIES.has(gran)) {
        throw new QueryValidationError(
          `Invalid granularity: ${value}. Allowed: ${[...ALLOWED_GRANULARITIES].join(", ")}`,
        );
      }
      where.push(`granularity = ${escapeLiteral(gran)}`);
      continue;
    }

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
      where.push(
        `(${matchClause} OR ${emptyColumnPredicate(key)}${extra})`,
      );
    } else {
      where.push(`${key} = ${escapeLiteral(value)}`);
    }
  }

  // 2. Date predicate. Format-robust: compare the normalized YYYYMMDD
  //    form of the stored `date` (ISO or DD-MM-YYYY) against the
  //    YYYYMMDD form of the caller's ISO input.
  //    - `date` (single value) → equality. Used for Today / single-day.
  //    - `from` + `to` → BETWEEN range. Used for Month / Year / custom.
  //    Either form, not both.
  if (date != null && date !== "") {
    where.push(`${DATE_YYYYMMDD} = '${isoToYyyymmdd(toIsoDate(date))}'`);
  } else {
    if (from != null && from !== "") {
      where.push(`${DATE_YYYYMMDD} >= '${isoToYyyymmdd(toIsoDate(from))}'`);
    }
    if (to != null && to !== "") {
      where.push(`${DATE_YYYYMMDD} <= '${isoToYyyymmdd(toIsoDate(to))}'`);
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
  const LANDING_PREDICATE =
    "(drill_down_level = '1' OR (drill_down_level IS NULL " +
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
    // Always include landing rows so the grid doesn't go empty during drill.
    where.push(
      `(${LANDING_PREDICATE} OR kpi_name IN (${escaped.join(", ")}))`,
    );
  }

  // 5. Bound result size. Upstream Lambda has its own limit too.
  const lim = Number.isInteger(limit) && limit > 0 && limit <= 10000
    ? limit
    : 5000;

  const table = config.upstream.sqlTable || "gold.gold";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // Athena (Trino) has no `* EXCLUDE(...)` syntax and serializes a DATE
  // column to an ISO yyyy-mm-dd string natively, so a plain `SELECT *`
  // is both valid and gives transformers the `date` field they expect.
  // The EXCLUDE trick is only needed on the legacy databricks/DuckDB
  // path, whose Lambda 500s serializing a raw DATE column — there we
  // drop `date` and re-add it cast to VARCHAR.
  const selectClause =
    config.upstream.engine === "databricks"
      ? "SELECT * EXCLUDE(date), CAST(date AS VARCHAR) AS date"
      : "SELECT *";
  // ORDER BY newest-first BEFORE the LIMIT: if a wide window ever exceeds
  // the row cap, truncation drops the OLDEST rows, never the latest ones
  // the cards/snapshots need. Without this the upstream returns an
  // arbitrary slice and the current view can intermittently come up empty.
  return `${selectClause} FROM ${table} ${whereSql} ORDER BY ${DATE_YYYYMMDD} DESC LIMIT ${lim}`
    .replace(/\s+/g, " ")
    .trim();
}
