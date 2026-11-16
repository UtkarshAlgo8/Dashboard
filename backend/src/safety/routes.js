import { Router } from "express";
import { runQuery, UpstreamError } from "../utils/upstream.js";
import { safetyQuery, safetyResult } from "./queries.js";
import { createSafetyExportService } from "./export.js";
import { EXCEL_CONTENT_TYPE } from "../utils/excel-export.js";

const GRAINS = new Set(["DAY", "MONTH", "SHIFT A", "SHIFT B", "SHIFT C"]);
const ALLOWED = new Set([
  "plant",
  "date",
  "from",
  "to",
  "granularity",
  "level",
  "type",
  "offset",
  "limit",
]);
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Strict BTP Safety scope; no implicit source, period, plant or grain fallback. */
export function parseSafetyRequest(query) {
  if (Object.keys(query).some((key) => !ALLOWED.has(key)))
    throw new Error("Unsupported Safety filter.");
  if (
    query.plant != null &&
    (typeof query.plant !== "string" ||
      query.plant.trim().toLowerCase() !== "banmore")
  )
    throw new Error("Safety supports Banmore only.");
  const granularity = query.granularity ?? "DAY";
  if (!GRAINS.has(granularity))
    throw new Error(
      "Safety supports stored MONTH, DAY and SHIFT A/B/C only; YEAR is not defined.",
    );
  let period;
  if (query.from != null || query.to != null) {
    if (
      query.date != null ||
      !validDate(query.from) ||
      !validDate(query.to) ||
      query.from > query.to
    )
      throw new Error("A valid date range, without date, is required.");
    if (granularity !== "DAY")
      throw new Error("Custom Safety ranges require DAY granularity.");
    if ((Date.parse(query.to) - Date.parse(query.from)) / 86400000 > 365)
      throw new Error("Safety ranges are limited to 366 days.");
    period = { from: query.from, to: query.to };
  } else {
    if (!validDate(query.date))
      throw new Error("A valid ISO date is required.");
    if (granularity === "MONTH" && !query.date.endsWith("-01"))
      throw new Error("MONTH requires the stored first-day anchor.");
    period = { date: query.date };
  }
  const level = query.level ?? "overall";
  if (!["overall", "types", "reports"].includes(level))
    throw new Error("Unknown Safety level.");
  if (level === "reports") {
    if (
      typeof query.type !== "string" ||
      !query.type.trim() ||
      query.type.length > 512
    )
      throw new Error(
        "A selected Safety type (up to 512 characters) is required.",
      );
  } else if (query.type != null)
    throw new Error("type is only valid for reports.");
  const integer = (key, fallback, max) => {
    if (query[key] == null) return fallback;
    if (typeof query[key] !== "string" || !/^\d+$/.test(query[key]))
      throw new Error(`Invalid ${key}.`);
    const n = Number(query[key]);
    if (!Number.isSafeInteger(n) || n > max || (key === "limit" && n < 1))
      throw new Error(`Invalid ${key}.`);
    return n;
  };
  const offset = integer("offset", 0, 100000);
  const limit = integer("limit", 25, 100);
  if (level === "overall" && offset !== 0)
    throw new Error("Summary offset must be zero.");
  return {
    ...period,
    granularity,
    level,
    ...(level === "reports" ? { type: query.type } : {}),
    offset,
    limit,
  };
}

/** Safety-only bounded TTL/LRU and in-flight dedup. No background work or waiting queue. */
export function createSafetyService(
  query = runQuery,
  {
    maxActive = 4,
    maxEntries = 128,
    maxBytes = 4 * 1024 * 1024,
    ttl = 60000,
  } = {},
) {
  const cache = new Map();
  const pending = new Map();
  let bytes = 0;
  const remove = (key) => {
    bytes -= cache.get(key).bytes;
    cache.delete(key);
  };
  return async (input) => {
    const key = JSON.stringify(input);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      cache.delete(key);
      cache.set(key, hit);
      return hit.data;
    }
    if (hit) remove(key);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxActive)
      throw new UpstreamError("Safety query capacity reached; please retry.", {
        type: "SAFETY_BUSY",
        status: 503,
      });
    const promise = Promise.resolve()
      .then(async () => {
        const data = safetyResult(
          await query(safetyQuery(input), { engine: "athena", tables: [] }),
          input,
        );
        const size = Buffer.byteLength(JSON.stringify(data));
        if (size <= maxBytes) {
          while (cache.size >= maxEntries || bytes + size > maxBytes)
            remove(cache.keys().next().value);
          cache.set(key, { data, bytes: size, expires: Date.now() + ttl });
          bytes += size;
        }
        return data;
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}

/** Export accepts the same strict scope, but never client-controlled paging. */
export function parseSafetyExportRequest(query) {
  if (Object.hasOwn(query, "offset") || Object.hasOwn(query, "limit"))
    throw new Error(
      "Safety exports include all matching rows; paging filters are not supported.",
    );
  const input = parseSafetyRequest(query);
  if (!["types", "reports"].includes(input.level))
    throw new Error("Select Safety types or a report type to export.");
  return input;
}

export function createSafetyRouter(
  service = createSafetyService(),
  exportService = createSafetyExportService(),
) {
  const router = Router();
  router.get("/export", async (req, res, next) => {
    let input;
    try {
      input = parseSafetyExportRequest(req.query);
    } catch (error) {
      return res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: error.message } });
    }
    try {
      const { buffer, filename } = await exportService(input);
      res.set("Cache-Control", "no-store");
      res.attachment(filename).type(EXCEL_CONTENT_TYPE).send(buffer);
    } catch (error) {
      next(error);
    }
  });
  router.get("/", async (req, res, next) => {
    let input;
    try {
      input = parseSafetyRequest(req.query);
    } catch (error) {
      return res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: error.message } });
    }
    try {
      res.json({ data: await service(input) });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export const router = createSafetyRouter();
