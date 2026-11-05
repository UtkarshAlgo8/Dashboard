import { Router } from "express";
import { cached, buildCacheKey } from "../utils/cache.js";
import { runQuery } from "../utils/upstream.js";
import { COMPLIANCE_KPIS, LEVEL_SUFFIX } from "./registry.js";
import { complianceQuery, toCompliance } from "./queries.js";

export const router = Router();
const GRANULARITIES = new Set([
  "DAY",
  "MONTH",
  "YEAR",
  "SHIFT A",
  "SHIFT B",
  "SHIFT C",
]);

/** Validate exact periods: no custom-range aggregation or guessed parent %. */
export function parseComplianceRequest(query) {
  if (query.plant != null && query.plant !== "BTP")
    throw new Error("Only plant BTP is supported.");
  if (
    ["from", "to", "date_from", "date_to"].some((key) => query[key] != null)
  ) {
    throw new Error(
      "Select a stored day, month, year or shift; custom-range compliance is not defined.",
    );
  }
  const { date, section } = query;
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new Error("A valid ISO date is required.");
  }
  const granularity = query.granularity ?? "DAY";
  if (!GRANULARITIES.has(granularity))
    throw new Error("Unsupported granularity.");
  if (
    (granularity === "MONTH" && !date.endsWith("-01")) ||
    (granularity === "YEAR" && !date.endsWith("-01-01"))
  ) {
    throw new Error("MONTH/YEAR must use the first date of the stored period.");
  }
  const level = query.level ?? "overall";
  if (typeof level !== "string" || !Object.hasOwn(LEVEL_SUFFIX, level))
    throw new Error("Unsupported drill level.");
  if (typeof query.kpis !== "string") throw new Error("kpis is required.");
  const ids = [...new Set(query.kpis.split(","))].sort();
  if (!ids.length || ids.some((id) => !Object.hasOwn(COMPLIANCE_KPIS, id)))
    throw new Error("Unknown compliance KPI.");
  if (level === "machine") {
    if (
      typeof section !== "string" ||
      !section.trim() ||
      section.length > 256
    ) {
      throw new Error("A section is required for the machine drill.");
    }
  } else if (section != null)
    throw new Error("section is only valid for the machine drill.");
  return {
    ids,
    date,
    granularity,
    level,
    ...(level === "machine" ? { section } : {}),
  };
}

router.get("/", async (req, res, next) => {
  let input;
  try {
    input = parseComplianceRequest(req.query);
  } catch (error) {
    return res
      .status(400)
      .json({ error: { code: "VALIDATION_ERROR", message: error.message } });
  }
  try {
    const data = await cached(
      buildCacheKey("/compliance", input),
      async () => {
        const rows = await runQuery(complianceQuery(input), {
          engine: "athena",
          tables: [],
        });
        return {
          context: { plant: "BTP", ...input },
          kpis: toCompliance(rows, input),
        };
      },
      60_000,
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
});
