import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Backend uses .env.local for developer-machine config (mirrors the
// Vite convention on the frontend side). Fall back to plain .env if
// only that is present (deploy environments, CI).
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

/**
 * Read + validate env. Fail fast at boot with a helpful message
 * rather than crashing on the first upstream call.
 */
function required(key) {
  const v = process.env[key];
  if (!v || v.trim() === "" || v === "REPLACE_ME") {
    throw new Error(
      `Missing required env var: ${key}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return v;
}

function optional(key, fallback) {
  const v = process.env[key];
  return v && v.trim() !== "" ? v : fallback;
}

function asInt(key, fallback) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Env var ${key} is not an integer: ${raw}`);
  }
  return n;
}

export const config = {
  port: asInt("PORT", 3001),
  frontendOrigin: optional("FRONTEND_ORIGIN", "http://localhost:5173"),
  upstream: {
    url: required("AWS_DATA_URL"),
    apiKey: required("AWS_DATA_API_KEY"),
    // Query engine on the upstream Lambda. "athena" (default) reads the
    // gold table via Athena and needs a schema-qualified FROM target
    // (`gold.gold`). Set to "databricks" to fall back to the legacy
    // path (bare `gold` + the `tables` array below).
    engine: optional("AWS_DATA_ENGINE", "athena"),
    // Real data: the full Banmore/Production dataset lives in `gold`.
    // `table` is the legacy Databricks catalog path (only used when
    // engine=databricks). `sqlTable` is the SQL FROM target; Athena
    // requires the `gold.gold` schema-qualified form.
    table: optional("AWS_DATA_TABLE", "databricks_table/gold"),
    sqlTable: optional("AWS_DATA_SQL_TABLE", "gold.gold"),
    timeoutMs: asInt("AWS_DATA_TIMEOUT_MS", 30_000),
  },
  // Quality Dashboard data layer (Backend FRD §A/§B). Additive and fully
  // decoupled from Production above.
  //
  // `dataSource` is THE switch the FRD calls for: "excel" reads the
  // reference gold workbook in-process (dev / until the Quality gold table
  // ships); "upstream" runs the identical SQL against the same remote data
  // API Production uses. Everything else — SQL builders, transformers,
  // controllers — is unchanged across the switch.
  quality: {
    dataSource: optional("QUALITY_DATA_SOURCE", "excel"), // "excel" | "upstream"
    // Reference workbook (FRD §B): sheet `result`, 23 columns.
    excelPath: optional(
      "QUALITY_EXCEL_PATH",
      path.join(projectRoot, "data", "Quality_Dashboard_Gold_Layer_3Months.xlsx"),
    ),
    excelSheet: optional("QUALITY_EXCEL_SHEET", "result"),
    // Parsed-workbook disk cache so `node --watch` restarts don't re-parse
    // the 50 MB xlsx every save. Rebuilt automatically when the xlsx is newer.
    excelCachePath: optional(
      "QUALITY_EXCEL_CACHE_PATH",
      path.join(projectRoot, "data", ".quality_gold.cache.json"),
    ),
    // SQL FROM target. For the excel source this is the in-memory alasql
    // table name; for upstream it becomes the Quality gold table path.
    sqlTable: optional("QUALITY_SQL_TABLE", "quality_gold"),
  },
  cacheTtlMs: asInt("CACHE_TTL_MS", 30_000),
};
