import { Router } from "express";
import { runQuery } from "../utils/upstream.js";
import { cached } from "../utils/cache.js";
import { stockCostQuery, stockCostResult } from "./queries.js";

const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Fixed BTP/DAY scope; reject unsupported filters instead of silently applying them. */
export function parseStockCostRequest(query) {
  if (Object.keys(query).some((key) => !["from", "to"].includes(key)))
    throw new Error(
      "Stock Cost accepts from/to only; plant is BTP and granularity is DAY.",
    );
  if (!validDate(query.from) || !validDate(query.to) || query.from > query.to)
    throw new Error("A valid ISO from/to date range is required.");
  if ((Date.parse(query.to) - Date.parse(query.from)) / 86400000 > 365)
    throw new Error("Stock Cost ranges are limited to 366 days.");
  return { from: query.from, to: query.to };
}

export function createStockCostRouter(query = runQuery) {
  const router = Router();
  router.get("/", async (req, res, next) => {
    let input;
    try {
      input = parseStockCostRequest(req.query);
    } catch (error) {
      return res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: error.message } });
    }
    try {
      const data = await cached(
        `stock-cost:v1:${input.from}:${input.to}`,
        async () =>
          stockCostResult(
            await query(stockCostQuery(input), {
              engine: "athena",
              tables: [],
            }),
            input,
          ),
        60000,
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export const router = createStockCostRouter();
