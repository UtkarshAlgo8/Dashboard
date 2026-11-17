import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

process.env.CACHE_DRIVER = "memory";
const { router, parseComplianceRequest, parseComplianceHistoryRequest } = await import("./routes.js");
const { complianceQuery, toCompliance, complianceHistoryQuery, toComplianceHistory } = await import("./queries.js");
const { namesForCompliance } = await import("./registry.js");
const { config } = await import("../config.js");
const { _clear } = await import("../utils/cache.js");
const { errorHandler } = await import("../middlewares/errorHandler.js");
const valid = (extra = {}) => ({
  kpis: "daily,pm,critical",
  date: "2026-09-01",
  granularity: "MONTH",
  ...extra,
});
const input = (extra = {}) => parseComplianceRequest(valid(extra));
const row = (kpi_name, actual_value, extra = {}) => ({
  kpi_name,
  actual_value,
  section: null,
  machine: null,
  ...extra,
});

for (const granularity of [
  "DAY",
  "MONTH",
  "YEAR",
  "SHIFT A",
  "SHIFT B",
  "SHIFT C",
]) {
  test(`accepts exact ${granularity} periods`, () => {
    const date = granularity === "YEAR" ? "2026-01-01" : "2026-09-01";
    assert.equal(input({ granularity, date }).granularity, granularity);
  });
}

for (const bad of [
  { plant: "CHENNAI" },
  { date: "2026-02-30" },
  { date: "2026-13-01" },
  { date: "2026-09-02" },
  { granularity: "YEAR", date: "2026-09-01" },
  { granularity: "WEEK" },
  { level: "barcode" },
  { level: ["overall"] },
  { level: "machine" },
  { level: "overall", section: "Curing" },
  { kpis: "PM" },
  { kpis: "__proto__" },
  { kpis: "pm,' OR 1=1" },
  { from: "2026-09-01" },
  { date_to: "2026-09-30" },
]) {
  test(`rejects invalid input ${JSON.stringify(bad)}`, () =>
    assert.throws(() => input(bad)));
}

test("exact mappings include Daily counts at every level, never non-PM technical counts", () => {
  for (const [level, suffix] of [
    ["overall", "o"],
    ["section", "s"],
    ["machine", "m"],
  ]) {
    const daily = namesForCompliance("daily", level);
    assert.equal(daily.value, `mechanicalchecksheet_Plan_Compliance_${suffix}`);
    assert.equal(daily.planned, `mechanicalchecksheet_Total_Planned_${suffix}`);
    assert.equal(Object.keys(daily).length, 6);
    assert.deepEqual(namesForCompliance("pm", level), {
      value: `technicalchecksheet_Plan_Compliance_pm_${suffix}`,
    });
    assert.deepEqual(namesForCompliance("critical", level), {
      value: `Critical_Parameter_Compliance_${suffix}`,
    });
  }
});

test("SQL scopes only BTP, exact names/period and level dimensions, not department/category", () => {
  const sql = complianceQuery(input());
  assert.match(sql, /plant = 'BTP'/);
  assert.match(sql, /date = DATE '2026-09-01'/);
  assert.match(sql, /granularity = 'MONTH'/);
  assert.doesNotMatch(
    sql,
    /department|category|SUM\(|AVG\(|drill_down_attribute|technicalchecksheet_Planned_Nos|technicalchecksheet_Actual_Nos/i,
  );
  assert.ok(sql.includes(config.upstream.sqlTable));
  assert.ok(!sql.includes(config.upstream.dailySqlTable));
});

test("fresh DAY/SHIFT use the configured rolling Gold source; MONTH/YEAR keep base", () => {
  const date = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  for (const granularity of ["DAY", "SHIFT B"]) {
    const sql = complianceQuery(input({ date, granularity }));
    assert.ok(sql.includes(config.upstream.dailySqlTable));
  }
  for (const [granularity, anchor] of [
    ["MONTH", `${date.slice(0, 7)}-01`],
    ["YEAR", `${date.slice(0, 4)}-01-01`],
  ]) {
    assert.ok(
      !complianceQuery(input({ granularity, date: anchor })).includes(
        config.upstream.dailySqlTable,
      ),
    );
  }
});

test("section and machine drills use the correct suffix and escaped selected section", () => {
  const sectionSql = complianceQuery(input({ kpis: "pm", level: "section" }));
  assert.match(sectionSql, /technicalchecksheet_Plan_Compliance_pm_s/);
  assert.doesNotMatch(sectionSql, /Compliance_pm_[om]'/);
  const machineSql = complianceQuery(
    input({ kpis: "critical", level: "machine", section: "Curing's press" }),
  );
  assert.match(machineSql, /Critical_Parameter_Compliance_m/);
  assert.match(machineSql, /section = 'Curing''s press'/);
});

test("published overall rates are preserved including critical violation rate precision", () => {
  const result = toCompliance(
    [
      row("mechanicalchecksheet_Plan_Compliance_o", "12.34"),
      row("mechanicalchecksheet_Total_Planned_o", "2739"),
      row("mechanicalchecksheet_Complied_o", "338"),
      row("mechanicalchecksheet_Missed_o", "0"),
      row("technicalchecksheet_Plan_Compliance_pm_o", "100"),
      row("Critical_Parameter_Compliance_o", "1.744186046511628"),
    ],
    input(),
  );
  assert.equal(result.daily.value, 12.34);
  assert.equal(result.daily.counts.planned, 2739);
  assert.equal(result.daily.counts.missed, 0);
  assert.equal(result.daily.counts.nonComplied, null);
  assert.equal(result.pm.value, 100);
  assert.deepEqual(result.pm.counts, {});
  assert.equal(result.critical.value, 1.744186046511628);
  assert.deepEqual(result.critical.counts, {});
});

test("children remain independent published values; no sum or average", () => {
  const result = toCompliance(
    [
      row("Critical_Parameter_Compliance_s", "25", { section: "RMS" }),
      row("Critical_Parameter_Compliance_s", "0", { section: "Curing" }),
    ],
    input({ kpis: "critical", level: "section" }),
  );
  assert.equal(result.critical.value, null);
  assert.deepEqual(
    result.critical.rows.map((r) => [r.section, r.value]),
    [
      ["Curing", 0],
      ["RMS", 25],
    ],
  );
});

test("missing values are not fabricated zeros; identical duplicates do not add", () => {
  assert.equal(toCompliance([], input()).daily.value, null);
  const rows = [
    row("technicalchecksheet_Plan_Compliance_pm_o", "0"),
    row("technicalchecksheet_Plan_Compliance_pm_o", "0"),
  ];
  assert.equal(toCompliance(rows, input()).pm.value, 0);
  assert.equal(toCompliance(rows, input()).pm.rows.length, 1);
});

test("conflicting Gold values and potentially truncated output fail closed", () => {
  assert.throws(
    () =>
      toCompliance(
        [
          row("technicalchecksheet_Plan_Compliance_pm_o", 90),
          row("technicalchecksheet_Plan_Compliance_pm_o", 91),
        ],
        input(),
      ),
    /Conflicting published values/,
  );
  assert.throws(
    () =>
      toCompliance(
        Array(5000).fill(row("technicalchecksheet_Plan_Compliance_pm_o", 90)),
        input(),
      ),
    /truncated/,
  );
});

test("trend requests validate bounded day/month windows and query published overall values", () => {
  const input = parseComplianceHistoryRequest({ id: "pm", from: "2026-01-01", to: "2026-12-31", granularity: "MONTH" });
  const sql = complianceHistoryQuery(input);
  assert.match(sql, /technicalchecksheet_Plan_Compliance_pm_o/);
  assert.match(sql, /date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'/);
  assert.ok(sql.includes(config.upstream.sqlTable));
  assert.doesNotMatch(sql, /SUM\(|AVG\(|department|category/i);
  for (const bad of [
    { id: "critical" }, { id: "__proto__" }, { granularity: "YEAR" },
    { from: "2026-02-30" }, { from: "2027-01-01" }, { to: "2028-01-01" },
  ]) assert.throws(() => parseComplianceHistoryRequest({ ...input, ...bad }));
});

test("daily trend reads both historical and fresh Gold sources across the cutoff", () => {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const sql = complianceHistoryQuery({ id: "daily", from: "2022-01-01", to: today, granularity: "DAY" });
  assert.ok(sql.includes(config.upstream.sqlTable));
  assert.ok(sql.includes(config.upstream.dailySqlTable));
  assert.match(sql, /UNION ALL/);
});

test("trend keeps zero, missing and duplicate values without aggregation", () => {
  assert.deepEqual(toComplianceHistory([
    { date: "2026-01-02", actual_value: "0" },
    { date: "2026-01-01", actual_value: "100" },
    { date: "2026-01-02", actual_value: "0" },
    { date: "2026-01-03", actual_value: null },
  ]), [
    { date: "2026-01-01", value: 100 },
    { date: "2026-01-02", value: 0 },
    { date: "2026-01-03", value: null },
  ]);
  assert.throws(() => toComplianceHistory([
    { date: "2026-01-01", actual_value: 50 },
    { date: "2026-01-01", actual_value: 51 },
  ]), /Conflicting/);
  assert.throws(() => toComplianceHistory(Array(5000).fill({})), /truncated/);
});

async function withServer(fn) {
  const app = express();
  app.use("/api/v1/compliance", router);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/v1/compliance`);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

test("trend route returns published points, validates input and caches the window", async (t) => {
  await _clear();
  const native = globalThis.fetch;
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) !== config.upstream.url) return native(url, options);
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ rows: [{ date: "2026-01-01", actual_value: "92.5" }] }));
  });
  await withServer(async (base) => {
    assert.equal((await native(`${base}/history?id=critical&from=2026-01-01&to=2026-12-31&granularity=MONTH`)).status, 400);
    assert.equal(requests.length, 0);
    const url = `${base}/history?id=pm&from=2026-01-01&to=2026-12-31&granularity=MONTH`;
    for (let i = 0; i < 2; i++) {
      const response = await native(url);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data.points, [{ date: "2026-01-01", value: 92.5 }]);
    }
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].engine, "athena");
});

test("route uses Athena, caches exact inputs, and does not infer children from Gold metadata", async (t) => {
  await _clear();
  const native = globalThis.fetch,
    requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) !== config.upstream.url) return native(url, options);
    requests.push(JSON.parse(options.body));
    return new Response(
      JSON.stringify({
        rows: [row("technicalchecksheet_Plan_Compliance_pm_o", "100")],
      }),
    );
  });
  await withServer(async (base) => {
    const url = `${base}?kpis=pm&date=2026-09-01&granularity=MONTH`;
    for (let i = 0; i < 2; i++) {
      const response = await native(url);
      assert.equal(response.status, 200);
      const { data } = await response.json();
      assert.equal(data.kpis.pm.value, 100);
      assert.equal(data.context.plant, "BTP");
    }
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].engine, "athena");
  assert.deepEqual(requests[0].tables, []);
});

test("invalid requests never query Athena; upstream errors are not cached as empty data", async (t) => {
  await _clear();
  const native = globalThis.fetch;
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) !== config.upstream.url) return native(url, options);
    requests++;
    return new Response(
      JSON.stringify({ status: "ERROR", message: "Gold unavailable" }),
      { status: 503 },
    );
  });
  await withServer(async (base) => {
    assert.equal((await native(`${base}?kpis=pm&date=2026-02-30`)).status, 400);
    assert.equal(requests, 0);
    for (let i = 0; i < 2; i++) {
      const response = await native(
        `${base}?kpis=pm&date=2026-09-01&granularity=MONTH`,
      );
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.error.message, "Gold unavailable");
      assert.equal(body.data, undefined);
    }
  });
  assert.equal(requests, 2);
});
