import client from "./client.js";

/** Stock Cost is fixed to raw BTP/DAY; range/category labels never become SQL filters. */
export async function getStockCost(input, { signal } = {}) {
  const params = new URLSearchParams(input);
  const data = await client.get(`/engineering/stock-cost?${params}`, {
    signal,
  });
  if (
    data?.context?.plant !== "BTP" ||
    data.context.granularity !== "DAY" ||
    data.context.from !== input.from ||
    data.context.to !== input.to ||
    !Array.isArray(data.overall) ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.reconciliation)
  )
    throw new Error(
      "Stock Cost returned an incomplete or different date scope.",
    );
  return data;
}
