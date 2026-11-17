import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import express from "express";

process.env.AWS_DATA_URL = "http://engineering-source.invalid";
process.env.AWS_DATA_API_KEY = "placeholder";
process.env.CACHE_DRIVER = "memory";
const { config } = await import("../../config.js");
const { GOLD_ALL_COLUMNS } = await import("../../queries/gold-source.js");
const { engineeringGoldSource, engineeringSourceCacheScope } =
  await import("./gold-source.js");
const queries = await import("./reliability.queries.js");
const { toKpiValueBatch, toAggregatedSummary, toLatestDate } =
  await import("../transformers/reliability.transformers.js");

function setup(t) {
  const prior = { ...config.engineering };
  const days = config.upstream.dailyFreshDays;
  const engine = config.upstream.engine;
  Object.assign(config.engineering, {
    dataSource: "db",
    sqlTable: "engineering_base",
    dailySqlTable: "engineering_daily",
  });
  config.upstream.dailyFreshDays = 2;
  config.upstream.engine = "athena";
  t.mock.method(Date, "now", () => Date.parse("2026-11-17T08:00:00Z"));
  t.after(() => {
    Object.assign(config.engineering, prior);
    config.upstream.dailyFreshDays = days;
    config.upstream.engine = engine;
  });
}

const row = (date, kpi_name, actual_value, extra = {}) => ({
  date,
  kpi_name,
  actual_value,
  plant: "BTP",
  department: "Engineering",
  category: "Reliability",
  granularity: "DAY",
  status: "A",
  section: "Mixing",
  machine: "0001",
  eqname: "Fixture machine",
  sub_section: "Mechanical",
  remarks: "Fixture failure",
  ...extra,
});
function fixtures() {
  const base = [
    row("2026-11-14", "MTBF_Overall", 100),
    row("2026-11-15", "MTBF_Overall", 9000),
    row("2026-11-17", "MTBF_Overall", 9999),
    row("2026-11-01", "MTBF_Overall", 333, { granularity: "MONTH" }),
  ];
  const daily = [
    row("2026-11-14", "MTBF_Overall", 999),
    row("2026-11-15", "MTBF_Overall", 200),
    row("2026-11-17", "MTBF_Overall", 6210),
    row("2026-11-01", "MTBF_Overall", 99999, { granularity: "MONTH" }),
    row("2026-11-17", "MTBF_Overall", 99999, { plant: "CHENNAI" }),
    row("2026-11-17", "MTBF_Overall", 99999, { department: "Production" }),
    row("2026-11-17", "MTBF_Overall", 99999, {
      category: "Breakdown Maintenance",
    }),
    row("2026-11-17", "MTBF_Grade", 930),
    row("2026-11-17", "MTBF_Grade", 999, { status: "Unmapped" }),
  ];
  for (const [date, lost, occ, operating] of [
    ["2026-11-14", 10, 1, 90],
    ["2026-11-15", 20, 2, 80],
    ["2026-11-17", 5, 1, 95],
  ]) {
    const correct = date === "2026-11-14" ? base : daily;
    const stale = date === "2026-11-14" ? daily : base;
    for (const [name, value] of [
      ["BreakdownMin_m", lost],
      ["BreakdownOcc_m", occ],
      ["OperatingMin_m", operating],
      ["ScheduledMin_m", 100],
    ]) {
      correct.push(row(date, name, value));
      stale.push(row(date, name, 99999));
    }
  }
  base.push(
    row("2026-11-14", "DaysWithoutBreakdown_m", 31),
    row("2026-11-15", "DaysWithoutBreakdown_m", 99, { machine: "STALE" }),
  );
  daily.push(
    row("2026-11-15", "DaysWithoutBreakdown_m", 33),
    row("2026-11-17", "DaysWithoutBreakdown_m", 40),
    row("2026-11-17", "DaysWithoutBreakdown_m", 10, { machine: "0002" }),
  );
  return { base, daily };
}

/** Execute the actual source split and query builders on overlapping/stale source fixtures. */
function execute(sql, { base, daily } = fixtures()) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `import sqlite3,json,sys
p=json.load(sys.stdin);c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
for table,rows in [('engineering_base',p['base']),('engineering_daily',p['daily'])]:
 c.execute('CREATE TABLE '+table+' ('+', '.join('"'+k+'" '+('REAL' if k=='actual_value' else 'TEXT') for k in p['columns'])+')')
 for row in rows:
  keys=list(row.keys());c.execute('INSERT INTO '+table+' ('+','.join(keys)+') VALUES ('+','.join('?' for k in keys)+')',[row[k] for k in keys])
print(json.dumps([dict(r) for r in c.execute(p['sql'])]))`,
    ],
    {
      input: JSON.stringify({ sql, base, daily, columns: GOLD_ALL_COLUMNS }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr + "\n" + sql);
  return JSON.parse(result.stdout);
}

test("Engineering uses the shared recent DAY/history/MONTH policy with independent configuration", (t) => {
  setup(t);
  assert.equal(
    engineeringGoldSource({ date: "2026-11-17", granularity: "DAY" }),
    "engineering_daily",
  );
  assert.equal(
    engineeringGoldSource({ date: "2026-11-15", granularity: "DAY" }),
    "engineering_daily",
  );
  assert.equal(
    engineeringGoldSource({ date: "2026-11-14", granularity: "DAY" }),
    "engineering_base",
  );
  assert.equal(
    engineeringGoldSource({ date: "2026-11-01", granularity: "MONTH" }),
    "engineering_base",
  );
  t.mock.method(Date, "now", () => Date.parse("2026-11-02T08:00:00Z"));
  assert.equal(
    engineeringGoldSource({ date: "2026-11-01", granularity: "MONTH" }),
    "engineering_base",
  );
  assert.equal(
    engineeringGoldSource({ date: "2026-11-01", granularity: "DAY" }),
    "engineering_daily",
  );
  t.mock.method(Date, "now", () => Date.parse("2026-11-17T08:00:00Z"));
  const sql = engineeringGoldSource({
    from: "2026-11-14",
    to: "2026-11-17",
    granularity: "DAY",
  });
  assert.match(sql, /UNION ALL/);
  assert.match(sql, /< '20261115'/);
  assert.match(sql, />= '20261115'/);
  config.engineering.dailySqlTable = "";
  assert.equal(
    engineeringGoldSource({ date: "2026-11-17", granularity: "DAY" }),
    "engineering_base",
  );
  config.engineering.dailySqlTable = "engineering_base";
  assert.equal(
    engineeringGoldSource({ date: "2026-11-17", granularity: "DAY" }),
    "engineering_base",
  );
});

test("Excel bypasses rolling-source SQL and preserves the single-table executor contract", (t) => {
  setup(t);
  config.engineering.dataSource = "excel";
  const input = {
    kpiNames: ["MTBF_Overall"],
    date: "2026-11-17",
    granularity: "DAY",
  };
  for (const sql of [
    queries.kpiValueBatchQuery(input),
    queries.latestDateQuery({ kpiName: "MTBF_Overall", granularity: "DAY" }),
    queries.daysWithoutBreakdownCountQuery(),
  ]) {
    assert.match(sql, /FROM engineering_base/);
    assert.doesNotMatch(sql, /engineering_daily|UNION ALL/);
  }
});

test("every Engineering query family resolves the correct scoped sources", (t) => {
  setup(t);
  const input = {
    kpiNames: ["MTBF_Overall"],
    date: "2026-11-17",
    granularity: "DAY",
  };
  for (const sql of [
    queries.kpiValueBatchQuery(input),
    queries.kpiChildrenQuery(input),
    queries.kpiHistoryQuery({
      kpiName: "MTBF_Overall",
      from: "2026-11-16",
      to: "2026-11-17",
      granularity: "DAY",
    }),
  ]) {
    assert.match(sql, /FROM engineering_daily/);
    assert.doesNotMatch(sql, /FROM engineering_base/);
  }
  for (const sql of [
    queries.componentAggregateQuery({ from: "2026-11-14", to: "2026-11-17" }),
    queries.lossTreeRangeQuery({
      kpiNames: ["LostTime_LossCategory"],
      from: "2026-11-14",
      to: "2026-11-17",
    }),
    queries.latestDateQuery({ kpiName: "MTBF_Overall", granularity: "DAY" }),
    queries.latestCompleteDateQuery({
      kpiNames: ["MTBF_Overall"],
      granularity: "DAY",
    }),
    queries.daysWithoutBreakdownCountQuery(),
  ]) {
    assert.match(sql, /FROM engineering_base/);
    assert.match(sql, /FROM engineering_daily/);
    assert.match(sql, /UNION ALL/);
    assert.match(sql, /LOWER\(department\) = 'engineering'/);
    assert.match(sql, /category = 'Reliability'/);
    assert.match(sql, /UPPER\(plant\) = 'BTP'/);
  }
});

test("real summary/history SQL prefers current daily rows and excludes overlapping stale rows", (t) => {
  setup(t);
  const kpiNames = ["MTBF_Overall", "BreakdownMin_Overall"];
  const today = execute(
    queries.kpiValueBatchQuery({
      kpiNames,
      date: "2026-11-17",
      granularity: "DAY",
    }),
  );
  assert.deepEqual(toKpiValueBatch(today, kpiNames), {
    MTBF_Overall: 6210,
    BreakdownMin_Overall: null,
  });
  assert.equal(
    execute(
      queries.kpiValueBatchQuery({
        kpiNames,
        date: "2026-11-14",
        granularity: "DAY",
      }),
    )[0].actual_value,
    100,
  );
  assert.equal(
    execute(
      queries.kpiValueBatchQuery({
        kpiNames,
        date: "2026-11-01",
        granularity: "MONTH",
      }),
    )[0].actual_value,
    333,
  );
  const history = execute(
    queries.kpiHistoryQuery({
      kpiName: "MTBF_Overall",
      from: "2026-11-14",
      to: "2026-11-17",
      granularity: "DAY",
    }),
  );
  assert.deepEqual(
    history.map((r) => [r.date, r.actual_value]),
    [
      ["2026-11-14", 100],
      ["2026-11-15", 200],
      ["2026-11-17", 6210],
    ],
  );
  const children = execute(
    queries.kpiChildrenQuery({
      kpiNames: ["MTBF_Grade"],
      date: "2026-11-17",
      granularity: "DAY",
    }),
  );
  assert.equal(children.length, 1);
  assert.equal(children[0].actual_value, 930);
  assert.equal(children[0].machine, "0001");
});

test("mixed-range component totals and coverage never double count overlapping dates", (t) => {
  setup(t);
  const summary = toAggregatedSummary(
    execute(
      queries.componentAggregateQuery({ from: "2026-11-14", to: "2026-11-17" }),
    ),
  );
  assert.equal(summary.BreakdownMin_Overall, 35);
  assert.equal(summary.MTBF_Overall, 265 / 4);
  assert.equal(summary.MTTR_Overall, 35 / 4);
  const coverage = execute(queries.daysWithoutBreakdownCountQuery());
  assert.deepEqual(
    coverage.map((r) => [r.date, r.machine_count]),
    [
      ["2026-11-14", 1],
      ["2026-11-15", 1],
      ["2026-11-17", 2],
    ],
  );
  const over = execute(queries.daysWithoutBreakdownCountQuery({ minDays: 30 }));
  assert.deepEqual(
    over.map((r) => [r.date, r.machine_count]),
    [
      ["2026-11-14", 1],
      ["2026-11-15", 1],
      ["2026-11-17", 1],
    ],
  );
});

test("latest-date queries include fresh rows without relaxing complete-period requirements", (t) => {
  setup(t);
  const source = fixtures();
  source.base.push(row("2026-11-14", "MTTR_Overall", 5));
  source.daily.push(row("2026-11-15", "MTTR_Overall", 8));
  const names = ["MTBF_Overall", "MTTR_Overall"];
  assert.equal(
    toLatestDate(
      execute(
        queries.latestDateQuery({
          kpiName: "MTBF_Overall",
          granularity: "DAY",
        }),
        source,
      ),
    ).date,
    "2026-11-17",
  );
  assert.equal(
    toLatestDate(
      execute(
        queries.latestCompleteDateQuery({
          kpiNames: names,
          granularity: "DAY",
        }),
        source,
      ),
    ).date,
    "2026-11-15",
  );
});

test("source/cache identity follows IST midnight and preserves configurable fresh-window length", (t) => {
  setup(t);
  const before = engineeringSourceCacheScope();
  t.mock.method(Date, "now", () => Date.parse("2026-11-17T18:30:00Z"));
  const after = engineeringSourceCacheScope();
  assert.equal(before.cutoff, "20261115");
  assert.equal(after.cutoff, "20261116");
  assert.equal(
    engineeringGoldSource({ date: "2026-11-15", granularity: "DAY" }),
    "engineering_base",
  );
  config.upstream.dailyFreshDays = 0;
  assert.equal(
    engineeringGoldSource({ date: "2026-11-17", granularity: "DAY" }),
    "engineering_base",
  );
  assert.equal(
    engineeringGoldSource({ date: "2026-11-18", granularity: "DAY" }),
    "engineering_daily",
  );
  config.engineering.dailySqlTable = "custom_daily";
  assert.equal(engineeringSourceCacheScope().daily, "custom_daily");
});

test("invalid dates/ranges cannot enter the source resolver's interpolated SQL", (t) => {
  setup(t);
  for (const date of [
    "2026-02-30",
    "2026-11-17' OR 1=1",
    ["2026-11-17"],
    "17-11-2026",
  ])
    assert.throws(
      () => engineeringGoldSource({ date, granularity: "DAY" }),
      (error) => error.status === 400,
    );
  assert.throws(
    () =>
      engineeringGoldSource({
        from: "2026-11-17",
        to: "2026-11-14",
        granularity: "DAY",
      }),
    /valid ISO dates/,
  );
});

test("actual summary route ignores old base-only caches, caches the new source scope and preserves missing data", async (t) => {
  setup(t);
  const { cacheSet, buildCacheKey, _clear } =
    await import("../../utils/cache.js");
  const { router } = await import("../routes/reliability.routes.js");
  const { errorHandler } = await import("../../middlewares/errorHandler.js");
  await _clear();
  const params = { date: "2026-11-17", granularity: "DAY" };
  await cacheSet(buildCacheKey("/engineering/reliability/summary", params), {
    MTBF_Overall: null,
  });
  const native = globalThis.fetch;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) !== config.upstream.url) return native(url, options);
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.engine, "athena");
    return new Response(JSON.stringify({ rows: execute(body.sql) }));
  });
  const app = express();
  app.use("/reliability", router);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/reliability/summary`;
  try {
    const response = await fetch(`${url}?${new URLSearchParams(params)}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.values.MTBF_Overall, 6210);
    assert.equal(body.values.BreakdownMin_Overall, null);
    assert.equal(body.context.date, params.date);
    await fetch(`${url}?${new URLSearchParams(params)}`);
    assert.equal(calls, 1);
    const invalid = await fetch(`${url}?date=2026-02-30&granularity=DAY`);
    assert.equal(invalid.status, 400);
    assert.equal(calls, 1);
    config.engineering.dailySqlTable = "";
    const archiveOnly = await fetch(`${url}?${new URLSearchParams(params)}`);
    assert.equal((await archiveOnly.json()).values.MTBF_Overall, 9999);
    assert.equal(calls, 2); // a source-config change cannot reuse the prior daily result
    config.engineering.dailySqlTable = "engineering_daily";
    const dailyAgain = await fetch(`${url}?${new URLSearchParams(params)}`);
    assert.equal((await dailyAgain.json()).values.MTBF_Overall, 6210);
    assert.equal(calls, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
