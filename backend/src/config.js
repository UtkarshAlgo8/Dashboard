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
    table: optional("AWS_DATA_TABLE", "databricks_table/gold"),
    sqlTable: optional("AWS_DATA_SQL_TABLE", "gold"),
    timeoutMs: asInt("AWS_DATA_TIMEOUT_MS", 30_000),
  },
  cacheTtlMs: asInt("CACHE_TTL_MS", 30_000),
};
