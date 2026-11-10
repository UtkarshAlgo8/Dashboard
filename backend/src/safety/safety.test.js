import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import express from "express";

process.env.AWS_DATA_URL = "http://safety-upstream.invalid";
process.env.AWS_DATA_API_KEY = "placeholder";
process.env.CACHE_DRIVER = "memory";
const { safetyQuery, safetyResult, SAFETY_NAMES } =
  await import("./queries.js");
const { parseSafetyRequest, createSafetyService, createSafetyRouter } =
  await import("./routes.js");
const { GOLD_ALL_COLUMNS, freshCutoffKey } =
  await import("../queries/gold-source.js");
const { config } = await import("../config.js");
const { errorHandler } = await import("../middlewares/errorHandler.js");

const TYPE = "New ' type & <b>条件</b>";
const input = (extra = {}) =>
  parseSafetyRequest({ date: "2026-08-01", granularity: "MONTH", ...extra });
const baseRow = {
  plant: "BANMORE",
  category: "Anything",
  department: "Not Engineering",
  unit_of_measurement: "NOS",
  date: "2026-08-01",
  granularity: "MONTH",
};
const scopeRows = (period = {}, counts = [4, 3]) => {
  const types = [TYPE, "Other dynamic type"];
  const rows = [
    {
      ...baseRow,
      ...period,
      kpi_name: SAFETY_NAMES.overall,
      actual_value: counts[0] + counts[1],
    },
  ];
  for (let i = 0; i < types.length; i++) {
    rows.push({
      ...baseRow,
      ...period,
      kpi_name: SAFETY_NAMES.types,
      product_type: types[i],
      actual_value: counts[i],
    });
    for (let n = 0; n < counts[i]; n++)
      rows.push({
        ...baseRow,
        ...period,
        kpi_name: SAFETY_NAMES.reports,
        product_type: types[i],
        actual_value: 1,
        record_id: `${period.date ?? "20260801"}${i}${n}`.replaceAll("-", ""),
        section: "Mixing",
        machine: "Machine & <x>",
        status: "Escalated",
        remarks:
          "#38 | literal <script>alert('x')</script>\n No parsing | By fixture",
      });
  }
  return rows;
};

// Execute the actual CTE/group/window/page SQL against local SQLite fixtures.
// Only Athena DATE literals and configured source identifiers are adapted.
function execute(sql, rows = scopeRows(), daily = []) {
  const adapted = sql
    .replaceAll(config.upstream.dailySqlTable, "gold_daily")
    .replaceAll(config.upstream.sqlTable, "gold_base")
    .replace(/DATE '([^']+)'/g, "'$1'");
  const result = spawnSync(
    "python3",
    [
      "-c",
      `import sqlite3,json,sys
p=json.load(sys.stdin)
c=sqlite3.connect(':memory:'); c.row_factory=sqlite3.Row
for table,rows in [('gold_base',p['rows']),('gold_daily',p['daily'])]:
 c.execute('CREATE TABLE '+table+' ('+', '.join('"'+k+'" '+('REAL' if k=='actual_value' else 'INTEGER' if k=='record_id' else 'TEXT') for k in p['columns'])+')')
 for row in rows:
  keys=list(row.keys()); c.execute('INSERT INTO '+table+' ('+','.join(keys)+') VALUES ('+','.join('?' for k in keys)+')',[row[k] for k in keys])
print(json.dumps([dict(r) for r in c.execute(p['sql'])]))`,
    ],
    {
      input: JSON.stringify({
        sql: adapted,
        rows,
        daily,
        columns: GOLD_ALL_COLUMNS,
      }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr + "\n" + adapted);
  return JSON.parse(result.stdout);
}
const get = (params, rows, daily) =>
  safetyResult(execute(safetyQuery(params), rows, daily), params);

test("exact names, Banmore isolation, no category/department/shift-column predicates, SUM not rowcount", () => {
  const params = input();
  const sql = safetyQuery(params);
  for (const name of Object.values(SAFETY_NAMES)) assert.ok(sql.includes(name));
  assert.match(sql, /LOWER\(TRIM\(plant\)\) = 'banmore'/);
  assert.doesNotMatch(
    sql,
    /COUNT\s*\(|category|department|\bshift\b|Safety_Closure|Safety_Near_Miss/i,
  );
  assert.match(sql, /SUM\(actual_value\)/);
  const rows = [
    ...scopeRows(),
    ...scopeRows({ plant: "BTP" }, [50, 30]),
    ...scopeRows({ plant: "CHENNAI" }, [2, 1]),
  ];
  assert.equal(get(params, rows).value, 7); // one overall row, seven observations
  const result = get(input({ level: "types" }), rows);
  assert.deepEqual(result.rows, [
    { type: TYPE, value: 4 },
    { type: "Other dynamic type", value: 3 },
  ]);
  assert.deepEqual(result.totals, {
    overall: 7,
    types: 7,
    reports: 7,
    selectedType: null,
  });
});

test("MONTH first-day, DAY, SHIFT A/B/C and custom scope are identical at three levels", () => {
  for (const scope of [
    { date: "2026-08-01", granularity: "MONTH" },
    ...["DAY", "SHIFT A", "SHIFT B", "SHIFT C"].map((granularity) => ({
      date: "2026-08-12",
      granularity,
    })),
  ]) {
    const rows = [
      ...scopeRows(),
      ...scopeRows({ date: "2026-08-12", granularity: "DAY" }, [2, 1]),
      ...["A", "B", "C"].flatMap((s) =>
        scopeRows({ date: "2026-08-12", granularity: `SHIFT ${s}` }, [1, 1]),
      ),
    ];
    const total =
      scope.granularity === "MONTH" ? 7 : scope.granularity === "DAY" ? 3 : 2;
    for (const level of ["overall", "types", "reports"]) {
      const p = input({
        ...scope,
        level,
        ...(level === "reports" ? { type: TYPE } : {}),
      });
      const result = get(p, rows);
      assert.equal(result.value, total);
      if (level === "reports") {
        assert.equal(result.rows[0].date, scope.date);
        assert.equal(
          result.rows[0].shift,
          scope.granularity.startsWith("SHIFT")
            ? scope.granularity.slice(-1)
            : null,
        );
        assert.equal(result.rows[0].remarks, rows[2].remarks);
        assert.equal(Object.hasOwn(result.rows[0], "actual_value"), false);
      }
    }
  }
  const rows = [
    ...scopeRows(),
    ...scopeRows({ date: "2026-08-12", granularity: "DAY" }, [2, 1]),
    ...scopeRows({ date: "2026-08-13", granularity: "DAY" }, [1, 1]),
  ];
  for (const level of ["overall", "types", "reports"]) {
    const p = parseSafetyRequest({
      from: "2026-08-12",
      to: "2026-08-13",
      granularity: "DAY",
      level,
      ...(level === "reports" ? { type: TYPE } : {}),
    });
    assert.equal(get(p, rows).value, 5);
  }
});

test("configured resolver keeps MONTH on base and splits DAY ranges disjointly without daily historical override", () => {
  const cutoff = freshCutoffKey();
  const iso = `${cutoff.slice(0, 4)}-${cutoff.slice(4, 6)}-${cutoff.slice(6)}`;
  const previous = new Date(Date.parse(iso) - 86400000)
    .toISOString()
    .slice(0, 10);
  const old = scopeRows({ date: previous, granularity: "DAY" }, [1, 1]);
  const fresh = scopeRows({ date: iso, granularity: "DAY" }, [2, 1]);
  const p = parseSafetyRequest({ from: previous, to: iso, granularity: "DAY" });
  const sql = safetyQuery(p);
  assert.match(sql, /UNION ALL/);
  assert.equal(
    get(
      p,
      [...old, ...scopeRows({ date: iso, granularity: "DAY" }, [8, 8])],
      [...fresh, ...old],
    ).value,
    5,
  );
  assert.equal(get(input(), [], scopeRows()).value, null);
  assert.ok(
    !safetyQuery(input({ date: `${iso.slice(0, 7)}-01` })).includes(
      config.upstream.dailySqlTable,
    ),
  );
});

test("SQL paging has stable ties, scoped type/report SUM metadata, escaped dynamic type", () => {
  const p = input({ level: "reports", type: TYPE, offset: "1", limit: "2" });
  assert.match(safetyQuery(p), /New '' type/);
  const result = get(p);
  assert.equal(result.page.total, 4);
  assert.equal(result.page.hasMore, true);
  assert.equal(result.rows.length, 2);
  const end = get(
    input({ level: "reports", type: TYPE, offset: "3", limit: "2" }),
  );
  assert.equal(end.rows.length, 1);
  assert.equal(end.page.hasMore, false);
  const types = get(input({ level: "types", offset: "1", limit: "1" }));
  assert.deepEqual(types.rows, [{ type: "Other dynamic type", value: 3 }]);
  assert.equal(types.page.total, 2);
});

test("empty SUM is null; wrong/missing/truncated/ambiguous/parity/quality source results fail explicitly", () => {
  const p = input({ level: "reports", type: TYPE });
  const empty = get(p, []);
  assert.equal(empty.value, null);
  assert.equal(empty.totals.selectedType, null);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.page.total, 0);
  assert.throws(() => safetyResult([], p), /metadata is missing/);
  assert.throws(() => safetyResult([null], p), /shape is invalid/);
  const valid = execute(safetyQuery(p));
  for (const key of [
    "overall_total",
    "selected_reports_total",
    "position",
    "remarks",
    "record_id",
  ]) {
    const altered = structuredClone(valid);
    delete altered[0][key];
    assert.throws(() => safetyResult(altered, p), /missing|invalid/i);
  }
  assert.throws(() => safetyResult(valid.slice(0, 2), p), /truncated/);
  assert.throws(
    () => safetyResult([...valid, ...valid], { ...p, limit: 4 }),
    /oversized/,
  );
  const blank = structuredClone(valid);
  blank[0].overall_total = "  ";
  assert.throws(() => safetyResult(blank, p), /Invalid Safety/);
  const oversizedScope = structuredClone(valid);
  for (const row of oversizedScope)
    for (const key of [
      "overall_total",
      "types_total",
      "reports_total",
      "selected_type_total",
      "selected_reports_total",
    ])
      row[key] = 100001;
  assert.throws(
    () => safetyResult(oversizedScope, p),
    /100000-row paging bound/,
  );
  const differentType = scopeRows();
  differentType[2].product_type = "Other dynamic type";
  assert.throws(
    () => get(p, differentType),
    /selected type and report SUM totals/,
  );
  const ambiguous = structuredClone(valid);
  ambiguous[1].types_total = 9;
  assert.throws(() => safetyResult(ambiguous, p), /Ambiguous/);
  for (const change of [
    (rows) => {
      rows[0].actual_value = 8;
    },
    (rows) => {
      rows[2].actual_value = 2;
    },
    (rows) => {
      rows[2].actual_value = null;
    },
    (rows) => {
      rows[2].record_id = rows[3].record_id;
    },
    (rows) => {
      rows[1].product_type = null;
    },
    (rows) => {
      rows[0].unit_of_measurement = "%";
    },
    (rows) => {
      rows[0].actual_value = -1;
    },
  ]) {
    const rows = scopeRows();
    change(rows);
    assert.throws(() => get(p, rows), /Safety/);
  }
});

test("published zero with no report rows preserves empty SUM null and honest no-reports metadata", () => {
  const rows = scopeRows({}, [0, 0]);
  const p = input({ level: "reports", type: TYPE });
  const result = get(p, rows);
  assert.equal(result.value, 0);
  assert.equal(result.totals.selectedType, 0);
  assert.equal(result.totals.reports, null);
  assert.equal(result.page.total, 0);
  assert.deepEqual(result.rows, []);
});

test("strict validation: exact anchors/bounded dates/pages/plant/type, no optional controls or fabricated YEAR", () => {
  for (const extra of [
    { plant: "BTP" },
    { plant: ["Banmore"] },
    { department: "Engineering" },
    { status: "New" },
    { category: "Safety" },
    { shift: "A" },
    { date: "2026-02-30" },
    { date: "2026-08-12" },
    { granularity: "YEAR" },
    { limit: "101" },
    { offset: "100001" },
    { limit: "0" },
    { limit: "NaN" },
    { level: "reports" },
    { level: "reports", type: "x".repeat(513) },
    { type: "unused" },
    { from: "2026-08-01", to: "2026-08-15" },
  ])
    assert.throws(() => input(extra));
  assert.throws(() =>
    parseSafetyRequest({ from: "2025-01-01", to: "2026-12-31" }),
  );
});

test("bounded cache/dedup, separate scope/type/page keys, failures uncached, zero queue admission", async () => {
  const calls = [];
  let release;
  const waiting = new Promise((r) => {
    release = r;
  });
  const service = createSafetyService(
    async (sql, transport) => {
      calls.push({ sql, transport });
      await waiting;
      return execute(sql);
    },
    { maxActive: 1, maxEntries: 2 },
  );
  const one = service(input());
  const same = service(input());
  await assert.rejects(service(input({ level: "types" })), /capacity/);
  release();
  await Promise.all([one, same]);
  await service(input());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].transport, { engine: "athena", tables: [] });
  await service(input({ level: "types" }));
  await service(input({ level: "reports", type: TYPE, limit: "1" }));
  await service(
    input({ level: "reports", type: TYPE, limit: "1", offset: "1" }),
  );
  await service(input());
  assert.equal(calls.length, 5); // bounded LRU evicted summary
  let errors = 0;
  const broken = createSafetyService(async () => {
    errors++;
    throw new Error("source down");
  });
  for (let n = 0; n < 2; n++)
    await assert.rejects(broken(input()), /source down/);
  assert.equal(errors, 2);
  let misses = 0;
  const noBytes = createSafetyService(
    async (sql) => {
      misses++;
      return execute(sql);
    },
    { maxBytes: 1 },
  );
  await noBytes(input());
  await noBytes(input());
  assert.equal(misses, 2);
});

test("TTL expiry, shift/date/type cache scope and malformed source responses cannot poison cache", async (t) => {
  let now = Date.now(),
    calls = 0;
  t.mock.method(Date, "now", () => now);
  const rows = [
    ...scopeRows(),
    ...scopeRows({ date: "2026-08-12", granularity: "SHIFT A" }, [2, 1]),
  ];
  const service = createSafetyService(
    async (sql) => {
      calls++;
      return execute(sql, rows);
    },
    { ttl: 10 },
  );
  await service(input());
  await service(input());
  assert.equal(calls, 1);
  now += 11;
  await service(input());
  assert.equal(calls, 2);
  const a = await service(input({ level: "reports", type: TYPE }));
  const b = await service(
    input({ level: "reports", type: "Other dynamic type" }),
  );
  assert.equal(a.page.total, 4);
  assert.equal(b.page.total, 3);
  const shift = await service(
    input({ date: "2026-08-12", granularity: "SHIFT A" }),
  );
  assert.equal(shift.value, 3);
  assert.equal(calls, 5);
  let bad = 0;
  const malformed = createSafetyService(async () => {
    bad++;
    return [];
  });
  await assert.rejects(malformed(input()), /metadata/);
  await assert.rejects(malformed(input()), /metadata/);
  assert.equal(bad, 2);
});

test("route validation and upstream errors do not turn failures into zero", async () => {
  let calls = 0;
  const app = express();
  app.use(
    "/safety",
    createSafetyRouter(async () => {
      calls++;
      throw new Error("pipeline failed");
    }),
  );
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/safety`;
  try {
    assert.equal(
      (await fetch(`${base}?plant=BTP&date=2026-08-01`)).status,
      400,
    );
    assert.equal(calls, 0);
    const response = await fetch(`${base}?date=2026-08-01&granularity=MONTH`);
    assert.equal(response.status, 500);
    assert.equal((await response.json()).data, undefined);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("route uses existing Athena transport/positional metadata and surfaces upstream error envelopes", async (t) => {
  const native = globalThis.fetch;
  const requests = [];
  let fail = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) !== config.upstream.url) return native(url, options);
    const body = JSON.parse(options.body);
    requests.push(body);
    if (fail)
      return new Response(
        JSON.stringify({
          status: "ERROR",
          type: "PIPELINE_ERROR",
          message: "pending publication failed",
        }),
      );
    const rows = execute(body.sql);
    const columns = Object.keys(rows[0]);
    return new Response(
      JSON.stringify({
        columns,
        rows: rows.map((row) => columns.map((key) => row[key])),
      }),
    );
  });
  const app = express();
  app.use("/safety", createSafetyRouter());
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}/safety?date=2026-08-01&granularity=MONTH`;
  try {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.value, 7);
    assert.equal(requests[0].engine, "athena");
    assert.deepEqual(requests[0].tables, []);
    fail = true;
    for (let n = 0; n < 2; n++) {
      const failure = await fetch(url + "&level=types");
      assert.equal(failure.status, 502);
      const body = await failure.json();
      assert.equal(body.data, undefined);
      assert.match(body.error.message, /pending publication failed/);
    }
    assert.equal(requests.length, 3);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("actual app mounts Safety behind existing auth; no unauthenticated upstream or auth DB read", async (t) => {
  const { Sequelize } = await import("sequelize");
  t.mock.method(Sequelize.prototype, "authenticate", async () => {});
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const { app } = await import("../app.js");
  let queries = 0;
  const native = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) === config.upstream.url) {
      queries++;
      throw new Error("unexpected upstream");
    }
    return native(url, options);
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/engineering/safety?date=2026-08-01&granularity=MONTH`,
    );
    assert.equal(response.status, 401);
    assert.equal(queries, 0);
  } finally {
    process.env.NODE_ENV = prior;
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
