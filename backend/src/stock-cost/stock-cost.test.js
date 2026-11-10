import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import express from "express";

process.env.AWS_DATA_URL = "http://stock-cost-upstream.invalid";
process.env.AWS_DATA_API_KEY = "placeholder";
process.env.CACHE_DRIVER = "memory";
const { stockCostQuery, stockCostResult, STOCK_NAMES } =
  await import("./queries.js");
const { parseStockCostRequest, createStockCostRouter } =
  await import("./routes.js");
const { config } = await import("../config.js");
const { GOLD_ALL_COLUMNS } = await import("../queries/gold-source.js");
const { errorHandler } = await import("../middlewares/errorHandler.js");
const { UpstreamError } = await import("../utils/upstream.js");

const input = { from: "2026-08-08", to: "2026-08-10" };
const row = (date, name, value, category = null, unit = "INR", extra = {}) => ({
  plant: "BTP",
  granularity: "DAY",
  category: "Not a filter",
  department: "Anything",
  date,
  kpi_name: name,
  actual_value: value,
  product_type: category,
  unit_of_measurement: unit,
  ...extra,
});
const fixtures = [
  row("2026-08-06", STOCK_NAMES.overall, 180),
  row("2026-08-07", STOCK_NAMES.overall, 200),
  row("2026-08-08", STOCK_NAMES.overall, 100),
  row("2026-08-08", STOCK_NAMES.cost, 60, "PROCESS INSTRUMENTS"),
  row("2026-08-08", STOCK_NAMES.cost, 40, "CURING PRESSES & ACCESSORIES"),
  row("2026-08-08", STOCK_NAMES.quantity, 6, "PROCESS INSTRUMENTS", "NOS"),
  row(
    "2026-08-08",
    STOCK_NAMES.quantity,
    7,
    "CURING PRESSES & ACCESSORIES",
    "NOS",
  ),
  row(
    "2026-08-08",
    STOCK_NAMES.quantity,
    1,
    "CURING PRESSES & ACCESSORIES",
    "ST",
  ),
  row("2026-08-10", STOCK_NAMES.overall, 80),
  row("2026-08-10", STOCK_NAMES.cost, 80, "CURING PRESSES & ACCESSORIES"),
  row(
    "2026-08-10",
    STOCK_NAMES.quantity,
    8,
    "CURING PRESSES & ACCESSORIES",
    "NOS",
  ),
];

// Execute the real aggregate/window SQL; only Athena DATE literals and table names are adapted.
function execute(scope = input, rows = fixtures) {
  const sql = stockCostQuery(scope)
    .replaceAll(config.upstream.dailySqlTable, "gold_daily")
    .replaceAll(config.upstream.sqlTable, "gold_base")
    .replace(/DATE '([^']+)'/g, "'$1'");
  const result = spawnSync(
    "python3",
    [
      "-c",
      `import sqlite3,json,sys
p=json.load(sys.stdin); c=sqlite3.connect(':memory:'); c.row_factory=sqlite3.Row
for table in ['gold_base','gold_daily']:
 c.execute('CREATE TABLE '+table+' ('+', '.join('"'+k+'" '+('REAL' if k=='actual_value' else 'TEXT') for k in p['columns'])+')')
for row in p['rows']:
 keys=list(row.keys()); c.execute('INSERT INTO gold_base ('+','.join(keys)+') VALUES ('+','.join('?' for k in keys)+')',[row[k] for k in keys])
print(json.dumps([dict(r) for r in c.execute(p['sql'])]))`,
    ],
    {
      input: JSON.stringify({ sql, rows, columns: GOLD_ALL_COLUMNS }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr + "\n" + sql);
  return JSON.parse(result.stdout);
}
const get = (scope = input, rows = fixtures) =>
  stockCostResult(execute(scope, rows), scope);

test("exact BTP/DAY/names, independent of category, department, and drill metadata", () => {
  const sql = stockCostQuery(input);
  assert.match(sql, /plant = 'BTP' AND granularity = 'DAY'/);
  assert.doesNotMatch(sql, /\bcategory\b|department|drill_down_level|itemcode/);
  const decoys = [
    row("2026-08-08", STOCK_NAMES.overall, 999, null, "INR", {
      plant: "Banmore",
    }),
    row("2026-08-08", STOCK_NAMES.overall, 999, null, "INR", {
      granularity: "MONTH",
    }),
    row("2026-08-08", "Stock_Cost_other", 999),
    row("2026-08-11", STOCK_NAMES.overall, 999),
  ];
  assert.deepEqual(get(input, [...fixtures, ...decoys]), get());
});

test("daily totals never sum dates, previous published day survives missing dates", () => {
  const data = get();
  assert.deepEqual(data.overall, [
    { date: "2026-08-08", cost: 100 },
    { date: "2026-08-10", cost: 80 },
  ]);
  assert.deepEqual(data.previous, { date: "2026-08-07", cost: 200 });
  assert.deepEqual(data.reconciliation, []);
  const day = get({ from: "2026-08-10", to: "2026-08-10" });
  assert.deepEqual(day.previous, { date: "2026-08-08", cost: 100 });
  assert.equal(day.overall[0].cost, 80);
});

test("SUM category values only within a date and UoM; keep mixed quantities distinct", () => {
  const data = get();
  const curing = data.categories.find(
    (item) => item.date === "2026-08-08" && item.category.startsWith("CURING"),
  );
  assert.deepEqual(curing.quantities, [
    { unit: "NOS", value: 7 },
    { unit: "ST", value: 1 },
  ]);
  const extra = row(
    "2026-08-08",
    STOCK_NAMES.quantity,
    2,
    "CURING PRESSES & ACCESSORIES",
    "NOS",
  );
  assert.equal(
    get(input, [...fixtures, extra]).categories.find((item) =>
      item.category.startsWith("CURING"),
    ).quantities[0].value,
    9,
  );
});

test("empty and published zero are distinct; mismatches are surfaced without altering Gold", () => {
  assert.deepEqual(get(input, []).overall, []);
  const zero = get(input, [row("2026-08-08", STOCK_NAMES.overall, 0)]);
  assert.equal(zero.overall[0].cost, 0);
  assert.deepEqual(zero.reconciliation, []);
  const mismatch = get(
    input,
    fixtures.filter(
      (item) =>
        !(
          item.kpi_name === STOCK_NAMES.cost &&
          item.product_type === "PROCESS INSTRUMENTS"
        ),
    ),
  );
  assert.deepEqual(mismatch.reconciliation, [
    { date: "2026-08-08", overall: 100, categories: 40 },
  ]);
});

test("reject truncated, duplicate, invalid/null values and missing units; preserve new UoMs", () => {
  const rows = execute();
  assert.throws(
    () => stockCostResult(rows.slice(1), input),
    /incomplete|truncated/,
  );
  for (const change of [
    { value: null },
    { value: "" },
    { invalid_rows: 1 },
    { unit_of_measurement: "USD" },
    { source_rows: 2 },
  ])
    assert.throws(() =>
      stockCostResult([{ ...rows[0], ...change }, ...rows.slice(1)], input),
    );
  assert.throws(() => get(input, [...fixtures, fixtures[2]]), /exactly one/);
  assert.throws(
    () =>
      get(input, [
        ...fixtures,
        row("2026-08-08", STOCK_NAMES.quantity, 1, "X", ""),
      ]),
    /invalid unit/,
  );
  const extraUnit = get(input, [
    ...fixtures,
    row("2026-08-08", STOCK_NAMES.quantity, 2, "PROCESS INSTRUMENTS", "BT"),
  ]);
  assert.deepEqual(
    extraUnit.categories.find((item) => item.category === "PROCESS INSTRUMENTS")
      .quantities,
    [
      { unit: "BT", value: 2 },
      { unit: "NOS", value: 6 },
    ],
  );
});

test("strict ISO window validation rejects dates, arrays, unsupported filters, oversized windows", () => {
  assert.deepEqual(parseStockCostRequest(input), input);
  for (const bad of [
    {},
    { ...input, from: "2026-02-30" },
    { ...input, from: [input.from] },
    { ...input, to: "2026-08-01" },
    { from: "2024-01-01", to: "2025-01-01" },
    { ...input, category: "Cost" },
    { ...input, plant: "Chennai" },
    { ...input, granularity: "MONTH" },
  ])
    assert.throws(() => parseStockCostRequest(bad));
  assert.doesNotThrow(() =>
    parseStockCostRequest({ from: "2024-01-01", to: "2024-12-31" }),
  );
});

test("HTTP validation and upstream errors keep the standard API envelope", async () => {
  let calls = 0;
  const app = express();
  app.use(
    "/stock-cost",
    createStockCostRouter(async (sql) => {
      calls++;
      if (sql.includes("DATE '2026-08-11'"))
        throw new UpstreamError("Gold unavailable", {
          type: "STOCK_TEST_ERROR",
          status: 502,
        });
      return execute();
    }),
  );
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/stock-cost`;
  try {
    const bad = await fetch(`${url}?from=invalid&to=2026-08-10`);
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, "VALIDATION_ERROR");
    assert.equal(calls, 0);
    const good = await fetch(`${url}?${new URLSearchParams(input)}`);
    assert.equal(good.status, 200);
    assert.equal((await good.json()).data.context.plant, "BTP");
    await fetch(`${url}?${new URLSearchParams(input)}`);
    assert.equal(calls, 1);
    for (let attempt = 0; attempt < 2; attempt++) {
      const failure = await fetch(`${url}?from=2026-08-11&to=2026-08-11`);
      assert.equal(failure.status, 502);
      assert.deepEqual((await failure.json()).error, {
        code: "STOCK_TEST_ERROR",
        message: "Gold unavailable",
      });
    }
    assert.equal(calls, 3); // errors are not cached
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
