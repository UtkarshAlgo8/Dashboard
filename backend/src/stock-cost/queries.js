import { goldSource } from "../queries/gold-source.js";
import { escapeLiteral } from "../quality/normalize.js";
import { UpstreamError } from "../utils/upstream.js";

export const STOCK_NAMES = Object.freeze({
  overall: "Stock_Cost_o",
  cost: "Stock_Cost_Mt",
  quantity: "Stock_Qty_Mt",
});
const MAX_ROWS = 50000;
const fail = (message) => {
  throw new UpstreamError(message, {
    type: "STOCK_COST_SOURCE_INVALID",
    status: 502,
  });
};

/** DAY-only, exact BTP/name scope. The baseline is the previous published day, not a date sum. */
export function stockCostQuery({ from, to }) {
  // Keep historical rows available for the baseline, including when the selected window is fresh.
  const table = goldSource({
    plantId: "banmore",
    toKey: to.replaceAll("-", ""),
    granularity: "DAY",
  });
  return `WITH source AS (
    SELECT date, kpi_name, product_type, unit_of_measurement, actual_value
    FROM ${table}
    WHERE plant = 'BTP' AND granularity = 'DAY'
      AND kpi_name IN (${Object.values(STOCK_NAMES).map(escapeLiteral).join(", ")})
      AND date <= DATE ${escapeLiteral(to)}
  ), baseline AS (
    SELECT MAX(date) AS date FROM source
    WHERE kpi_name = '${STOCK_NAMES.overall}' AND date < DATE ${escapeLiteral(from)}
  ), grouped AS (
    SELECT date, kpi_name, product_type, unit_of_measurement,
      SUM(actual_value) AS value, COUNT(*) AS source_rows,
      SUM(CASE WHEN actual_value IS NULL THEN 1 ELSE 0 END) AS invalid_rows
    FROM source
    WHERE date BETWEEN DATE ${escapeLiteral(from)} AND DATE ${escapeLiteral(to)}
      OR (kpi_name = '${STOCK_NAMES.overall}' AND date = (SELECT date FROM baseline))
    GROUP BY date, kpi_name, product_type, unit_of_measurement
  )
  SELECT CAST(date AS VARCHAR) AS date, kpi_name, product_type,
    unit_of_measurement, value, source_rows, invalid_rows, COUNT(*) OVER () AS result_rows
  FROM grouped ORDER BY date, kpi_name, product_type, unit_of_measurement
  LIMIT ${MAX_ROWS + 1}`;
}

/** Validate completeness, retain raw category keys and never combine quantity units. */
export function stockCostResult(rows, input) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS)
    fail("Stock Cost response exceeds the row limit; narrow the date range.");
  const overall = new Map();
  const details = new Map();
  const seen = new Set();
  const numeric = (value) =>
    (typeof value === "number" ||
      (typeof value === "string" && value.trim() !== "")) &&
    Number.isFinite(Number(value));
  for (const row of rows) {
    if (!row || Number(row.result_rows) !== rows.length)
      fail("Stock Cost response is incomplete or truncated.");
    if (
      typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      row.date > input.to ||
      !Object.values(STOCK_NAMES).includes(row.kpi_name) ||
      !numeric(row.value) ||
      Number(row.invalid_rows) !== 0 ||
      !Number.isSafeInteger(Number(row.source_rows)) ||
      Number(row.source_rows) < 1
    )
      fail("Stock Cost source contains invalid dates or values.");
    const {
      date,
      kpi_name: name,
      product_type: category,
      unit_of_measurement: unit,
    } = row;
    const value = Number(row.value);
    const key = JSON.stringify([date, name, category, unit]);
    if (seen.has(key)) fail("Stock Cost response contains duplicate groups.");
    seen.add(key);
    if (name === STOCK_NAMES.overall) {
      if (unit !== "INR" || Number(row.source_rows) !== 1 || overall.has(date))
        fail(
          "Stock Cost requires exactly one INR plant total per published date.",
        );
      overall.set(date, value);
      continue;
    }
    if (date < input.from || typeof category !== "string" || !category.trim())
      fail(
        "Stock Cost category/date is missing or outside the selected range.",
      );
    if (
      name === STOCK_NAMES.cost
        ? unit !== "INR"
        : typeof unit !== "string" || !unit.trim() || unit.length > 64
    )
      fail("Stock Cost source contains a missing or invalid unit.");
    const detailKey = JSON.stringify([date, category]);
    const detail = details.get(detailKey) ?? {
      date,
      category,
      cost: null,
      quantities: [],
    };
    if (name === STOCK_NAMES.cost) detail.cost = value;
    else detail.quantities.push({ unit, value });
    details.set(detailKey, detail);
  }
  const totals = [...overall].sort(([a], [b]) => a.localeCompare(b));
  const baselines = totals.filter(([date]) => date < input.from);
  if (baselines.length > 1) fail("Stock Cost baseline is ambiguous.");
  const selected = totals.filter(([date]) => date >= input.from);
  const categories = [...details.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.category.localeCompare(b.category),
  );
  const reconciliation = [];
  const dates = new Set([
    ...selected.map(([date]) => date),
    ...categories.map((row) => row.date),
  ]);
  for (const date of dates) {
    const children = categories.filter((row) => row.date === date);
    const cost = children.reduce((sum, row) => sum + (row.cost ?? 0), 0);
    if (
      !overall.has(date) ||
      children.some((row) => row.cost === null) ||
      Math.abs(cost - overall.get(date)) > 0.02
    )
      reconciliation.push({
        date,
        overall: overall.get(date) ?? null,
        categories: cost,
      });
  }
  return {
    context: { plant: "BTP", granularity: "DAY", ...input },
    overall: selected.map(([date, cost]) => ({ date, cost })),
    previous: baselines.length
      ? { date: baselines[0][0], cost: baselines[0][1] }
      : null,
    categories,
    reconciliation,
  };
}
