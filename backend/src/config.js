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
  frontendOrigin: optional("FRONTEND_ORIGIN", "http://136.112.107.154:3014"),
  // MySQL connection details — only the auth DB is on MySQL here.
  // Dashboard data flows through AWS Lambda (`AWS_DATA_URL`), so
  // there is no second connection to manage.
  db: {
    host: optional("DB_HOST", "127.0.0.1"),
    port: asInt("DB_PORT", 3306),
    user: optional("DB_USER", "root"),
    password: optional("DB_PASSWORD", ""),
    authName: optional("AUTHDB", "authdb"),
  },
  // JWT secrets / expiries used by the auth module. Required at
  // boot when AUTH_ENABLED=true; if you flip AUTH_ENABLED=false the
  // app boots without them (useful for local-only dashboard dev).
  auth: {
    enabled: optional("AUTH_ENABLED", "true") !== "false",
    accessTokenSecret: optional("ACCESS_TOKEN_SECRET", "change-me-access"),
    accessTokenExpiry: optional("ACCESS_TOKEN_EXPIRY", "1d"),
    refreshTokenSecret: optional("REFRESH_TOKEN_SECRET", "change-me-refresh"),
    refreshTokenExpiry: optional("REFRESH_TOKEN_EXPIRY", "1y"),
  },
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
    // Rolling ~48-day table: complete for today and the last couple of days
    // (gold.gold is incomplete for those), but unreliable further back
    // within its own window — reads older than `dailyFreshDays` always go
    // to `sqlTable` instead. See queries/gold-source.js.
    dailySqlTable: optional("AWS_DATA_SQL_TABLE_DAILY", "gold.gold_daily"),
    // How many trailing days (from today, Asia/Kolkata) count as "fresh"
    // and should read from dailySqlTable instead of sqlTable.
    dailyFreshDays: asInt("GOLD_DAILY_FRESH_DAYS", 2),
    timeoutMs: asInt("AWS_DATA_TIMEOUT_MS", 30_000),
  },
  // JK KPI Assistant (chatbot) — separate FastAPI service, proxied so the
  // browser never talks to it directly (see backend/src/utils/chatUpstream.js).
  chatUpstream: {
    url: optional("JK_AGENT_API_URL", "http://35.208.174.2:3020"),
    timeoutMs: asInt("JK_AGENT_TIMEOUT_MS", 60_000),
  },
  // Quality Dashboard data layer (Backend FRD §A/§B). Additive and fully
  // decoupled from Production above.
  //
  // `dataSource` is THE switch the FRD calls for: "excel" reads the
  // reference gold workbook in-process (dev / until the Quality gold table
  // ships); "db" runs the identical SQL against the same remote data
  // API Production uses. Everything else — SQL builders, transformers,
  // controllers — is unchanged across the switch.
  quality: {
    dataSource: optional("QUALITY_DATA_SOURCE", "db"), // "excel" | "db"
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
    sqlTable: optional("QUALITY_SQL_TABLE", "gold.gold"),
    // Rolling daily counterpart of `sqlTable`, read for the trailing
    // `upstream.dailyFreshDays` days exactly as Production does — the base
    // table is incomplete for today (verified 2026-09-16: Quality rows for
    // today were ~2x more numerous in gold_daily than in gold). Set to ""
    // to disable and read `sqlTable` for every date. Ignored entirely by
    // the excel source, which has only the one in-memory table.
    dailySqlTable: optional("QUALITY_SQL_TABLE_DAILY", "gold.gold_daily"),
  },
  // Engineering Head dashboard data layer (Overview + Reliability tabs,
  // spec 16/17). Additive and fully decoupled — same shape as `quality`
  // above, department='Engineering'/category='Reliability' instead of
  // Quality's Process/SPC families.
  engineering: {
    // "db" is the default: Engineering serves the live gold table, never the
    // mock. The excel path below is kept only as a local-dev escape hatch and
    // must be opted into explicitly (ENGINEERING_DATA_SOURCE=excel) — a
    // missing/blank env var must never silently fall back to mock numbers.
    dataSource: optional("ENGINEERING_DATA_SOURCE", "db"), // "db" | "excel"
    // Reference workbook: sheet `data`, 27 columns.
    excelPath: optional(
      "ENGINEERING_EXCEL_PATH",
      path.join(projectRoot, "data", "gold_mock.xlsx"),
    ),
    excelSheet: optional("ENGINEERING_EXCEL_SHEET", "data"),
    excelCachePath: optional(
      "ENGINEERING_EXCEL_CACHE_PATH",
      path.join(projectRoot, "data", ".engineering_gold.cache.json"),
    ),
    sqlTable: optional("ENGINEERING_SQL_TABLE", "gold.gold"),
  },
  cacheTtlMs: asInt("CACHE_TTL_MS", 30_000),
  // Cache backing store. "memory" (default) is a Map in this process and is
  // wiped by every deploy — `npm run deploy` rebuilds the container, so the
  // first user after a release used to re-pay the full Athena cost. "redis"
  // keeps the cache across restarts and shares it if more than one container
  // ever runs. Redis is optional: an unreachable server degrades to memory.
  cache: {
    driver: optional("CACHE_DRIVER", "memory"), // "memory" | "redis"
    redisUrl: optional("REDIS_URL", "redis://127.0.0.1:6379"),
    keyPrefix: optional("CACHE_KEY_PREFIX", "jkdash:"),
    // TTL floor for entries written by the warmer. MUST exceed the warm
    // interval — see effectiveTtl() in utils/cache.js.
    warmTtlMs: asInt("CACHE_WARM_TTL_MS", 25 * 60 * 1000),
    // Hard ceiling on what the in-process store holds. Applies under BOTH
    // drivers: the redis driver mirrors every write into memory, so this is
    // what bounds this process either way. Measured working set is ~100 MB.
    maxBytes: asInt("CACHE_MAX_BYTES", 192 * 1024 * 1024),
  },
  // Background warmer: keeps the landing page and each plant's opening
  // dashboard hot so opening them never waits on the upstream API.
  warm: {
    enabled: optional("CACHE_WARM_ENABLED", "true") !== "false",
    intervalMs: asInt("CACHE_WARM_INTERVAL_MS", 10 * 60 * 1000),
    // Delay before the first cycle, so the server is listening (the warmer
    // replays real HTTP requests against itself) and boot traffic settles.
    bootDelayMs: asInt("CACHE_WARM_BOOT_DELAY_MS", 2_000),
    plants: optional("CACHE_WARM_PLANTS", "banmore,chennai")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // How many recorded POST views to replay per cycle, most-requested first.
    maxRecorded: asInt("CACHE_WARM_MAX_RECORDED", 20),
    // Parallel warm requests. Kept low: firing every target at once risks
    // throttling the upstream and timing out the warm it is trying to do.
    concurrency: asInt("CACHE_WARM_CONCURRENCY", 2),
  },
  // Data materializer — pulls level-1+2 deduped rows for the trailing
  // window and serves kpi-data / drill-aggregate from process memory.
  // Trailing-window refresh on a 30-min cadence: shift-grain data doesn't
  // change more often than that, so longer intervals would serve stale
  // data on a new shift boundary.
  materialize: {
    enabled: optional("CACHE_MATERIALIZE_ENABLED", "true") !== "false",
    intervalMs: asInt("CACHE_MATERIALIZE_INTERVAL_MS", 30 * 60 * 1000),
    bootDelayMs: asInt("CACHE_MATERIALIZE_BOOT_DELAY_MS", 5_000),
    windowDays: asInt("CACHE_MATERIALIZE_WINDOW_DAYS", 60),
    levels: optional("CACHE_MATERIALIZE_LEVELS", "1,2")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n)),
  },
  // Deterministic cache preheater — runs on a fixed interval (default 30 min)
  // and replays every cache key the FE *could* legitimately ask for on the
  // configured plants, regardless of whether real traffic has hit it yet.
  // Companion to the reactive warmer (which only knows the top-20 most-
  // requested signatures); the preheater is the deterministic floor that
  // covers every (section, tab, period) combo so first-visit waits on the
  // upstream API never happen.
  preheat: {
    enabled: optional("CACHE_PREHEAT_ENABLED", "true") !== "false",
    intervalMs: asInt("CACHE_PREHEAT_INTERVAL_MS", 30 * 60 * 1000),
    bootDelayMs: asInt("CACHE_PREHEAT_BOOT_DELAY_MS", 5_000),
    plants: optional("CACHE_PREHEAT_PLANTS", "banmore")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    concurrency: asInt("CACHE_PREHEAT_CONCURRENCY", 2),
  },
};
