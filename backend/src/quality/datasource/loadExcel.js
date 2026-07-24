/**
 * One-time loader for the Quality reference workbook (Backend FRD §B).
 *
 * Reads sheet `result` (104,650 rows × 23 columns) into an array of plain
 * row-objects, normalizing exactly two source quirks on the way in so the
 * rest of the backend never has to think about them again:
 *
 *   1. Dates (FRD §0.4). The `date` column is an Excel date serial. We emit
 *      an ISO `YYYY-MM-DD` string, which sorts lexicographically (so range
 *      filters and ORDER BY are correct) and matches the FRD's date literals.
 *
 *   2. The "null" sentinel (FRD §0.2). Process gold marks "no value" with the
 *      literal string "null"; the SPC source also uses blank cells. Both mean
 *      *absence* — never a real value — so we convert them to JS `null` here.
 *      Downstream SQL then uses ordinary `IS NULL` semantics and transformers
 *      emit JSON `null`. Note: `actual_value` itself can be the sentinel
 *      (FRD §0.7c), so numeric columns are normalized too.
 *
 * The parse is expensive (~50 MB xlsx), so the result is cached to disk and
 * only rebuilt when the workbook is newer than the cache. Callers should
 * memoize the returned array for the process lifetime (see excelSource.js).
 */
import fs from "node:fs";
import * as XLSX from "xlsx";

import { config } from "../../config.js";

/** The 23 gold columns, in sheet order (FRD §B, data_dictionary). */
export const QUALITY_COLUMNS = [
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

// Lowercased tokens that mean "no value" (FRD §0.2 + SPC blank cells).
const EMPTY_TOKENS = new Set(["null", "nan", ""]);

/** True when a raw cell value is a missing-value sentinel. */
function isSentinel(v) {
  return v == null || EMPTY_TOKENS.has(String(v).trim().toLowerCase());
}

/** Excel date serial (or Date) → ISO `YYYY-MM-DD`. */
function toIsoDate(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${m}-${d}`;
  }
  // Already a string date (e.g. from the disk cache) — pass through.
  return String(value);
}

/** Normalize one raw SheetJS row-object into the canonical shape. */
function normalizeRow(raw) {
  const out = {};
  for (const col of QUALITY_COLUMNS) {
    let v = raw[col];
    if (col === "date") {
      out.date = toIsoDate(v);
      continue;
    }
    // Everything else: collapse the sentinel to JS null, keep the rest as-is.
    out[col] = isSentinel(v) ? null : v;
  }
  return out;
}

function parseWorkbook() {
  // Read via fs + XLSX.read (SheetJS `readFile` isn't fs-wired under pure
  // ESM). cellDates so date serials arrive as JS Date objects we format
  // deterministically (independent of the cell's display number format).
  const buf = fs.readFileSync(config.quality.excelPath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[config.quality.excelSheet];
  if (!sheet) {
    throw new Error(
      `Quality workbook has no sheet "${config.quality.excelSheet}". ` +
        `Found: ${wb.SheetNames.join(", ")}`,
    );
  }
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  return rawRows.map(normalizeRow);
}

function cacheIsFresh() {
  try {
    const cacheStat = fs.statSync(config.quality.excelCachePath);
    const xlsxStat = fs.statSync(config.quality.excelPath);
    return cacheStat.mtimeMs >= xlsxStat.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Load and normalize the Quality gold rows. Uses the on-disk JSON cache
 * when it is at least as new as the workbook; otherwise parses the xlsx
 * and refreshes the cache. Synchronous by design — called once at first
 * request, then memoized by the caller.
 *
 * @returns {Array<Record<string, unknown>>}
 */
export function loadQualityRows() {
  if (cacheIsFresh()) {
    try {
      const json = fs.readFileSync(config.quality.excelCachePath, "utf8");
      const rows = JSON.parse(json);
      if (Array.isArray(rows) && rows.length > 0) return rows;
    } catch {
      // Corrupt/partial cache — fall through and rebuild.
    }
  }
  const rows = parseWorkbook();
  try {
    fs.writeFileSync(config.quality.excelCachePath, JSON.stringify(rows));
  } catch {
    // Read-only data dir is fine; we just re-parse next boot.
  }
  return rows;
}
