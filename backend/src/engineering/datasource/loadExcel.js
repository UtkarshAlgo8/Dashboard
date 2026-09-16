/**
 * One-time loader for the Engineering reliability reference workbook
 * (spec 16/17). Mirrors quality/datasource/loadExcel.js: reads sheet `data`
 * (31,263 rows x 27 columns) into an array of plain row-objects, normalizing
 * the same two source quirks on the way in.
 *
 *   1. Dates. Unlike the Quality workbook (Excel date serials), this sheet
 *      stores `date` as a literal "YYYY-MM-DD HH:MM:SS" string (always
 *      midnight). We still emit ISO `YYYY-MM-DD` so range filters and
 *      ORDER BY stay lexicographically correct — same contract as Quality.
 *      Excel-serial and Date-object handling are kept for defensiveness
 *      (a future refresh of this workbook may switch representations, same
 *      as the Quality file did).
 *
 *   2. The "null" sentinel. Same rule as Quality: "null" / blank cells mean
 *      *absence*, converted to JS `null` here so downstream SQL/transformers
 *      never have to think about it again.
 *
 * Cached to disk (like Quality) so `node --watch` restarts don't re-parse
 * the workbook every save.
 */
import fs from "node:fs";
import * as XLSX from "xlsx";

import { config } from "../../config.js";

const CACHE_VERSION = 1;
const XLSX_SSF = XLSX.SSF ?? XLSX.default?.SSF;

/** The 27 Engineering gold columns, in sheet order. */
export const ENGINEERING_COLUMNS = [
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
  "equnr",
  "eqname",
  "arbpl",
  "logbook_id",
];

// Lowercased tokens that mean "no value" (mirrors Quality's loader).
const EMPTY_TOKENS = new Set(["null", "nan", ""]);

/** True when a raw cell value is a missing-value sentinel. */
function isSentinel(v) {
  return v == null || EMPTY_TOKENS.has(String(v).trim().toLowerCase());
}

/** Excel date serial / Date / "YYYY-MM-DD HH:MM:SS" string → ISO `YYYY-MM-DD`. */
function toIsoDate(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX_SSF?.parse_date_code(value);
    if (!parsed) return null;
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${m}-${d}`;
  }
  // Real shape of this workbook: a "YYYY-MM-DD HH:MM:SS" string. Also
  // passes through an already-ISO string unchanged (disk cache reload).
  const s = String(value).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Normalize one raw SheetJS row-object into the canonical shape. */
function normalizeRow(raw) {
  const out = {};
  for (const col of ENGINEERING_COLUMNS) {
    let v = raw[col];
    if (col === "date") {
      out.date = toIsoDate(v);
      continue;
    }
    out[col] = isSentinel(v) ? null : v;
  }
  return out;
}

function parseWorkbook() {
  // fs + XLSX.read (not XLSX.readFile — not fs-wired under pure ESM).
  const buf = fs.readFileSync(config.engineering.excelPath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets[config.engineering.excelSheet];
  if (!sheet) {
    throw new Error(
      `Engineering workbook has no sheet "${config.engineering.excelSheet}". ` +
        `Found: ${wb.SheetNames.join(", ")}`,
    );
  }
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  return rawRows.map(normalizeRow);
}

function cacheIsFresh() {
  try {
    const cacheStat = fs.statSync(config.engineering.excelCachePath);
    const xlsxStat = fs.statSync(config.engineering.excelPath);
    return cacheStat.mtimeMs >= xlsxStat.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Load and normalize the Engineering gold rows. Uses the on-disk JSON cache
 * when it is at least as new as the workbook; otherwise parses the xlsx and
 * refreshes the cache. Synchronous by design — called once at first request,
 * then memoized by the caller (see excelSource.js).
 *
 * @returns {Array<Record<string, unknown>>}
 */
export function loadEngineeringRows() {
  if (cacheIsFresh()) {
    try {
      const json = fs.readFileSync(config.engineering.excelCachePath, "utf8");
      const cached = JSON.parse(json);
      const rows =
        cached && cached.version === CACHE_VERSION && Array.isArray(cached.rows)
          ? cached.rows
          : null;
      if (rows && rows.length > 0) return rows;
    } catch {
      // Corrupt/partial cache — fall through and rebuild.
    }
  }
  const rows = parseWorkbook();
  try {
    fs.writeFileSync(
      config.engineering.excelCachePath,
      JSON.stringify({ version: CACHE_VERSION, rows }),
    );
  } catch {
    // Read-only data dir is fine; we just re-parse next boot.
  }
  return rows;
}
