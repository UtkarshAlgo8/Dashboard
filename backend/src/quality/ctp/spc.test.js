import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNelson } from "../spc/engine.js";
import { resolveSpcRequest, spcWorkspaceQuery } from "./spc.queries.js";
import { toSpcWorkspace } from "./spc.transform.js";

const DAY = "2026-11-10";
const request = (extra = {}) => resolveSpcRequest(extra, "2026-11-11");
const point = (value, i = 0, shift = "A") => ({
  t: `${DAY} 13:${String(i).padStart(2, "0")}`,
  shift,
  x_bar: value,
  r: 0.5,
  ooc: value > 13 || value < 7,
});
const row = (metric, value, extra = {}) => ({
  record_id: "1",
  date: DAY,
  granularity: "Day",
  tyre_type: "PCR",
  machine: "PCR TRENCH 1",
  itemcode: "ALL",
  section: "Curing",
  product_type: "Steam Pressure",
  kpi_name: `Steam Pressure ${metric}`,
  actual_value: String(value),
  status: "Critical",
  unit_of_measurement: "kg/cm2",
  ...extra,
});
const rows = (points = [point(14), point(10, 1)]) => [
  row("Cp", "1.422", { status: "Warning", plot_data: '{"window_days":30}' }),
  row("Cpk", "-0.123", { status: "Critical", plot_data: '{"window_days":30}' }),
  row("Pp", "1.6", { status: "Healthy", plot_data: '{"window_days":90}' }),
  row("Ppk", "1.51", { status: "Healthy", plot_data: '{"window_days":90}' }),
  row("Mean", "10.25", {
    status: "Within Spec",
    plot_data: '{"n":216,"target":10}',
  }),
  row("OOC Points", "8", {
    status: "Out of Control",
    plot_data: JSON.stringify({
      UCL: 13,
      CL: 10,
      LCL: 7,
      USL: 12,
      LSL: 8,
      points,
    }),
  }),
];
const transform = (input = rows(), extra = {}) =>
  toSpcWorkspace(input, request(extra));

test("validates exact tyre, date, shift and refresh types before SQL", () => {
  assert.equal(request().date, null);
  assert.equal(request({ date: DAY, shift: "B", refresh: "1" }).refresh, true);
  for (const input of [
    { tyre: "Both" },
    { tyre: ["PCR"] },
    { tyre: "PCR' OR 1=1 --" },
    { date: "2026-02-30" },
    { date: "" },
    { date: [DAY] },
    { shift: "SHIFT A" },
    { shift: ["A"] },
    { refresh: "true" },
    { granularity: "MONTH" },
    { from: DAY },
    { to: DAY },
  ])
    assert.ok(request(input).error, JSON.stringify(input));
});

test("SQL scopes the new contract and never uses BTP or old CHENNAI SPC", () => {
  const sql = spcWorkspaceQuery(request());
  assert.match(sql, /FROM gold\.ctp_gold/);
  assert.match(
    sql,
    /plant = 'CTP' AND department = 'Quality' AND category = 'SPC'/,
  );
  assert.match(sql, /tyre_type IN \('PCR', 'TBR'\)/);
  assert.match(sql, /MAX\(date\)/);
  assert.match(sql, /date <= DATE '2026-11-11'/);
  assert.match(sql, /granularity = 'Day'/);
  assert.doesNotMatch(
    sql,
    /BANMORE|CHENNAI|gold\.gold\b|Both|AVG\(|SUM\(|Real-time|Baseline/,
  );
});

test("selected day is exact, with no <= snapshot fallback and no month average", () => {
  const sql = spcWorkspaceQuery(
    request({ date: DAY, tyre: "TBR", shift: "C" }),
  );
  assert.match(sql, /date = DATE '2026-11-10'/);
  assert.match(sql, /tyre_type = 'TBR'/);
  assert.match(sql, /granularity IN \('Day', 'SHIFT C'\)/);
  assert.doesNotMatch(sql, /MAX\(|<=|MONTH|YEAR|AVG\(/);
});

test("preserves all four stored capability values, statuses and windows", () => {
  const result = transform();
  const p = result.processes[0];
  assert.equal(result.context.date, DAY);
  assert.equal(result.context.data_date, DAY);
  assert.equal(result.context.date_mode, "latest");
  assert.deepEqual(p.metrics.Cp, {
    value: 1.422,
    status: "Warning",
    window_days: 30,
  });
  assert.deepEqual(p.metrics.Pp, {
    value: 1.6,
    status: "Healthy",
    window_days: 90,
  });
  assert.equal(p.metrics.Cpk.value, -0.123);
  assert.equal(p.headline_status, "Critical");
  assert.equal(p.mean.value, 10.25);
  assert.equal(p.mean.sample_count, 216);
  assert.equal(p.unit, "kg/cm2");
  assert.equal(p.published_ooc.value, 8); // Not replaced by a chart-derived count.
  assert.equal(p.chart.chart_ooc, 1);
});

test("published baseline, specs and target remain separate and fixed", () => {
  const p = transform().processes[0];
  assert.equal(p.chart.cl, 10);
  assert.equal(p.chart.ucl, 13);
  assert.equal(p.chart.lcl, 7);
  assert.equal(p.chart.usl, 12);
  assert.equal(p.chart.lsl, 8);
  assert.equal(p.target, 10);
  assert.equal(p.chart.points[0].range, 0.5);
  assert.equal(p.chart.r_chart, undefined);
  assert.equal(p.histogram, undefined);
});

test("eight-rule annotations match the BTP engine, including nine-point runs", () => {
  const values = Array.from({ length: 16 }, (_, i) => 10.1 + i / 100);
  const p = transform(rows(values.map((v, i) => point(v, i)))).processes[0];
  const expected = evaluateNelson(values, 10, 13);
  assert.deepEqual(
    p.chart.rules.map(({ rule, hit, point_indexes }) => ({
      rule,
      hit,
      point_indexes,
    })),
    expected.rules,
  );
  assert.ok(p.chart.rules[1].hit);
  assert.ok(
    p.chart.alerts.some((a) => a.rule === 2 && a.time.first === `${DAY} 13:00`),
  );
  assert.equal(
    transform(rows(values.slice(0, 7).map((v, i) => point(v, i)))).processes[0]
      .chart.rules[1].hit,
    false,
  );
});

test("missing readings break the plot and must not join Nelson runs", () => {
  const values = [11, 11, 11, 11, null, 11, 11, 11, 11, 11];
  const p = transform(rows(values.map((v, i) => point(v, i)))).processes[0];
  assert.equal(p.chart.points[4].value, null);
  assert.equal(p.chart.rules[1].hit, false);
  assert.equal(p.chart.rules[1].evaluated, false);
});

test("shift filters only chart readings; daily indices and OOC remain labelled daily", () => {
  const daily = rows([point(14, 0, "A"), point(10, 1, "B"), point(9, 2, "A")]);
  const shift = row("Shift Stats", "24", { granularity: "SHIFT A" });
  const p = transform([...daily, shift], { shift: "A" }).processes[0];
  assert.equal(p.chart.points.length, 2);
  assert.equal(p.chart.points[1].value, 9);
  assert.equal(p.shift_sample_count, 24);
  assert.equal(p.metrics.Cp.value, 1.422);
  assert.equal(p.published_ooc.value, 8);
  assert.match(p.warnings.join(" "), /daily snapshots/);
});

test("empty shifts are not presented as zero OOC or a passed assessment", () => {
  const p = transform(rows(), { shift: "C" }).processes[0];
  assert.equal(p.chart.points.length, 0);
  assert.equal(p.chart.chart_ooc, null);
  assert.equal(p.shift_sample_count, null);
  assert.ok(p.chart.rules.every((r) => !r.evaluated && !r.hit));
  assert.match(p.warnings.join(" "), /No published shift statistics/);
});

test("All keeps PCR and TBR identities separate and never sums metric rows", () => {
  const input = [...rows(), ...rows().map((r) => ({ ...r, tyre_type: "TBR" }))];
  const all = transform(input);
  assert.equal(all.processes.length, 2);
  assert.notEqual(all.processes[0].id, all.processes[1].id);
  assert.ok(all.processes.every((p) => p.metrics.Cp.value === 1.422));
  assert.equal(transform(input, { tyre: "TBR" }).processes.length, 1);
});

test("selected empty days and latest-empty source never substitute a different day", () => {
  const result = transform(rows(), { date: "2026-11-09" });
  assert.equal(result.context.date, "2026-11-09");
  assert.equal(result.context.data_date, null);
  assert.equal(result.processes.length, 0);
  assert.equal(transform([]).context.date, null);
});

test("missing, malformed and non-finite source cells do not become zero or Healthy", () => {
  for (const value of [null, "", " ", "null", "NaN", "Infinity"]) {
    const p = transform([
      row("Cp", value, {
        actual_value: value,
        status: "Insufficient Data",
        plot_data: "bad-json",
      }),
    ]).processes[0];
    assert.equal(p.metrics.Cp.value, null);
    assert.equal(p.chart.chart_ooc, null);
    assert.equal(p.mean.value, null);
    assert.equal(p.headline_status, "Insufficient Data");
  }
  assert.equal(
    transform([row("Cp", "1.1", { status: "New source status" })]).processes[0]
      .headline_status,
    "New source status",
  );
});

test("missing or asymmetric baselines do not invent limits or evaluate invalid sigma rules", () => {
  const missing = rows();
  missing[5].plot_data = JSON.stringify({ points: [point(14)] });
  const p = transform(missing).processes[0];
  assert.equal(p.chart.ucl, null);
  assert.ok(p.chart.rules.every((r) => !r.evaluated));
  missing[5].plot_data = JSON.stringify({
    CL: 10,
    UCL: 13,
    LCL: 8,
    points: [point(7)],
  });
  const q = transform(missing).processes[0];
  assert.equal(q.chart.rules[0].hit, true);
  assert.ok(q.chart.rules.slice(1).every((r) => !r.evaluated));
});

test("shift-only metadata does not create a capability process", () => {
  assert.equal(
    transform([row("Shift Stats", "24", { granularity: "SHIFT A" })], {
      shift: "A",
    }).processes.length,
    0,
  );
});

test("duplicate records are explicit and never merged/summed", () => {
  const p = transform([...rows(), row("Cp", "0.5", { record_id: "999" })])
    .processes[0];
  assert.equal(p.metrics.Cp.value, 0.5);
  assert.match(p.warnings[0], /Duplicate/);
});

// Controller dependencies are replaced: no credentials or production requests.
process.env.AWS_DATA_URL ??= "http://127.0.0.1:1";
process.env.AWS_DATA_API_KEY ??= "fixture-only";
process.env.CACHE_DRIVER = "memory";
const { createSpcWorkspaceHandler } = await import("./spc.controller.js");
const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("controller rejects invalid inputs without querying the source", async () => {
  let called = false;
  const handler = createSpcWorkspaceHandler({
    run: async () => {
      called = true;
      return [];
    },
  });
  const res = response();
  await handler({ query: { tyre: "BANMORE" } }, res, (err) => {
    throw err;
  });
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test("controller cache keys isolate tyre/day/shift and manual Refresh bypasses read cache", async () => {
  const keys = [],
    writes = [];
  let calls = 0;
  const handler = createSpcWorkspaceHandler({
    run: async () => {
      calls++;
      return rows();
    },
    read: async (key, load, ttl) => {
      keys.push(key);
      assert.equal(ttl, 60_000);
      return load();
    },
    store: async (key, body, ttl) => {
      writes.push(key);
      assert.equal(ttl, 60_000);
      assert.ok(body.fetched_at);
    },
  });
  for (const query of [
    { date: DAY },
    { date: DAY, tyre: "PCR" },
    { date: DAY, shift: "A" },
    { date: DAY, refresh: "1" },
  ]) {
    const res = response();
    await handler({ query }, res, (err) => {
      throw err;
    });
    assert.equal(res.body.context.plant, "CTP");
  }
  assert.equal(calls, 4);
  assert.equal(new Set(keys).size, 3);
  assert.equal(writes[0], keys[0]);
});

test("upstream failure is forwarded, not converted into empty or stale data", async () => {
  const error = new Error("source unavailable");
  const handler = createSpcWorkspaceHandler({
    run: async () => {
      throw error;
    },
    read: async (_key, load) => load(),
  });
  const res = response();
  let forwarded;
  await handler({ query: {} }, res, (err) => {
    forwarded = err;
  });
  assert.equal(forwarded, error);
  assert.equal(res.body, null);
});

test("mounted CTP route executes scoped SQL, caches reads and force-refreshes without touching BTP", async () => {
  const { default: express } = await import("express");
  const { spcRouter } = await import("./routes.js");
  const app = express();
  app.use("/quality/ctp/spc", spcRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch;
  const queries = [];
  // Only the backend's upstream boundary uses this replacement; client HTTP
  // below uses nativeFetch. No production endpoint can be contacted.
  globalThis.fetch = async (_url, options) => {
    queries.push(JSON.parse(options.body).sql);
    return new Response(JSON.stringify({ rows: rows() }), { status: 200 });
  };
  try {
    const path = `${origin}/quality/ctp/spc/workspace?date=${DAY}&tyre=PCR`;
    const first = await nativeFetch(path);
    assert.equal(first.status, 200);
    const body = await first.json();
    assert.equal(body.processes[0].metrics.Cpk.value, -0.123);
    assert.equal(body.context.data_date, DAY);
    assert.ok(body.fetched_at);
    await (await nativeFetch(path)).json();
    assert.equal(queries.length, 1);
    await (await nativeFetch(`${path}&refresh=1`)).json();
    assert.equal(queries.length, 2);
    assert.match(queries[0], /plant = 'CTP'/);
    assert.doesNotMatch(queries[0], /BANMORE|CHENNAI/);
    assert.equal((await nativeFetch(`${path}&shift=invalid`)).status, 400);
    assert.equal(
      (await nativeFetch(`${origin}/quality/spc/workspace`)).status,
      404,
    );
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise((resolve) => server.close(resolve));
  }
});
