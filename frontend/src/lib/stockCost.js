import { formatIndianNumber } from "./numberFormat.js";

export const STOCK_COST_PERIOD_HELP =
  "Stock Cost supports DAY data over a date range up to 366 days. Select a day, month, or shorter custom range.";

export const stockCategoryLabel = (raw) =>
  raw.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export const stockMoney = (value) =>
  formatIndianNumber(value, { maxDecimals: 2 });

/** Convert the Engineering header to a DAY window, never to a MONTH sum. */
export function stockCostRange(period) {
  if (!period) return null;
  let from = period.from ?? period.date;
  let to = period.to ?? period.date;
  if (period.granularity === "MONTH") {
    from = `${period.date.slice(0, 7)}-01`;
    const [year, month] = from.split("-").map(Number);
    to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  } else if (period.granularity !== "DAY") return null;
  const span = (Date.parse(to) - Date.parse(from)) / 86400000;
  return Number.isFinite(span) && span >= 0 && span <= 365
    ? { from, to }
    : null;
}

/** Latest plant day within the selected window; comparison uses the previous published plant day. */
export function stockCostSnapshot(data) {
  const overall = data?.overall ?? [];
  const current = overall.at(-1) ?? null;
  const previous = overall.at(-2) ?? data?.previous ?? null;
  const rows = current
    ? (data.categories ?? []).filter((row) => row.date === current.date)
    : [];
  return {
    current,
    previous,
    rows: rows.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0)),
    categoryCount: rows.filter((row) => row.cost !== null).length,
    change:
      current && previous && previous.cost !== 0
        ? ((current.cost - previous.cost) / previous.cost) * 100
        : null,
  };
}

/** Neutral card: cost only, no quantity, threshold, target or implied RAG. */
export function stockCostCard(data, { range, error, isLoading } = {}) {
  const { current, previous, categoryCount, change } = stockCostSnapshot(data);
  return {
    id: "stock-cost",
    n: "Stock Cost",
    v: current ? current.cost / 100000 : "—",
    valuePrefix: "₹",
    u: "Lakh",
    presentationTone: "neutral",
    loadingPresentation: "skeleton",
    neutralTrend: true,
    showProgress: false,
    status: null,
    target: null,
    isLoading,
    drill: range ? "stock-cost" : null,
    trendApi: Boolean(range),
    periodLabel: current
      ? `${current.date} · DAY · All shifts`
      : "DAY · All shifts",
    showPeriodWhenEmpty: true,
    subLine: current
      ? { text: `${categoryCount} categories · ₹${stockMoney(current.cost)}` }
      : null,
    trendPct: change,
    trendBaseline: previous ? `vs ${previous.date}` : undefined,
    emptyReason: !range
      ? STOCK_COST_PERIOD_HELP
      : error
        ? "Stock Cost source unavailable"
        : isLoading
          ? "Loading…"
          : "No published Stock Cost day in this selection",
  };
}

/** Each quantity stays in its own unit; a unit price exists only for a nonzero single-UoM quantity. */
export function stockCategoryCells(row, { rawNumbers = false } = {}) {
  const quantities = [...row.quantities].sort((a, b) =>
    a.unit.localeCompare(b.unit),
  );
  return [
    stockCategoryLabel(row.category),
    rawNumbers ? (row.cost ?? "—") : stockMoney(row.cost),
    quantities.length
      ? quantities
          .map(({ unit, value }) => `${stockMoney(value)} ${unit}`)
          .join(" + ")
      : "—",
    quantities.length === 1 && quantities[0].value !== 0 && row.cost !== null
      ? rawNumbers
        ? row.cost / quantities[0].value
        : stockMoney(row.cost / quantities[0].value)
      : "—",
  ];
}

/** Cost-only category summary; quantities never enter totals or shares. */
export function stockCostCategorySummary(rows) {
  const costRows = rows.filter((row) => row.cost !== null);
  const total = costRows.reduce((sum, row) => sum + row.cost, 0);
  const topThree = costRows.slice(0, 3).reduce((sum, row) => sum + row.cost, 0);
  return { costRows, total, topThree };
}

/** Build a calendar spine. Missing category observations become zero, never a line across a gap. */
export function stockCostTrend(data, range, category = "") {
  const dates = [];
  for (
    let time = Date.parse(range.from);
    time <= Date.parse(range.to);
    time += 86400000
  )
    dates.push(new Date(time).toISOString().slice(0, 10));
  const rows = (data?.categories ?? []).filter(
    (row) => row.category === category,
  );
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const totals = new Map(
    (data?.overall ?? []).map((row) => [row.date, row.cost]),
  );
  const units = category
    ? [
        ...new Set(rows.flatMap((row) => row.quantities.map((q) => q.unit))),
      ].sort()
    : [];
  return {
    dates,
    cost: dates.map((date) =>
      category ? (byDate.get(date)?.cost ?? 0) : (totals.get(date) ?? null),
    ),
    quantities: units.map((unit) => ({
      unit,
      values: dates.map(
        (date) =>
          byDate.get(date)?.quantities.find((q) => q.unit === unit)?.value ?? 0,
      ),
    })),
  };
}
