import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  resolveSilver,
  sourceForMachine,
  paramsForSource,
  machinesForSource,
  SILVER_SOURCES,
  baselineKey,
} from "./mapping.js";
import {
  silverPointsQuery,
  silverBoardQuery,
  silverSampleSizeQuery,
} from "../queries/silver.queries.js";
import { subgroups } from "./engine.js";
import { toSpcDetail, toSpcWidgets } from "../transformers/spc.transformers.js";

const machine = "NEWCHINAPAINTING";
const parameter = "Painted Tyre Weight";
const recipe = "SAP-123";
const src = resolveSilver(machine, parameter);
const scope = { machine, recipe, shift: "All", readings: 10 };
const params = paramsForSource(src);

// Execute generated SQL, not just string assertions. SQLite supports the window
// functions used here; register Athena's HOUR for shift predicates.
const sqlRunner = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.execute("ATTACH DATABASE ':memory:' AS silver")
db.create_function('HOUR', 1, lambda value: int(value[11:13]))
db.executescript('''
CREATE TABLE silver.dim_wcmaster (record_id INTEGER, plant_code TEXT, source_machine TEXT, database_name TEXT, name TEXT, _bronze_ingest_ts TEXT);
CREATE TABLE silver.dim_recipemaster (record_id INTEGER, plant_code TEXT, source_machine TEXT, database_name TEXT, description TEXT, _bronze_ingest_ts TEXT);
CREATE TABLE silver.dim_tyre_spec_weight (sap_code TEXT, spec_weight REAL, plant_code TEXT, database_name TEXT, _bronze_ingest_ts TEXT);
CREATE TABLE silver.fct_paintingdata (record_id INTEGER, event_time TEXT, weight REAL, wc_id INTEGER, recipe_id INTEGER, plant_code TEXT, source_machine TEXT, database_name TEXT);
''')
for table, rows in payload['tables'].items():
    for row in rows:
        db.execute('INSERT INTO silver.' + table + ' VALUES (' + ','.join('?' for _ in row) + ')', row)
print(json.dumps([[dict(r) for r in db.execute(sql)] for sql in payload['queries']]))
`;

const specRow = (
  weight,
  stamp = "2026-11-04",
  plant = "BTP",
  database = "sap",
  code = recipe,
) => [code, weight, plant, database, stamp];
const defaultSpecs = [
  specRow(9, "2026-10-01"),
  specRow(10),
  specRow(10),
  specRow(999, "2026-11-05", "CTP"),
  specRow(888, "2026-11-05", "BTP", "mes"),
  specRow(500, "2026-11-04", "BTP", "sap", "OTHER-SAP"),
];

function execute(queries, specs = defaultSpecs) {
  const identity = ["BTP", "dbo", "mes"];
  const wc = (id, name, stamp = "2026-11-01", source = identity) => [
    id,
    ...source,
    name,
    stamp,
  ];
  const rm = (id, code, stamp = "2026-11-01", source = identity) => [
    id,
    ...source,
    code,
    stamp,
  ];
  const fact = (
    id,
    value,
    wcId = 263,
    recipeId = 10,
    plant = "BTP",
    time = `2026-11-01 10:00:${String(Math.floor(id / 2)).padStart(2, "0")}`,
  ) => [id, time, value, wcId, recipeId, plant, "dbo", "mes"];
  const tables = {
    dim_wcmaster: [
      wc(263, "Old lookup name", "2026-01-01"),
      wc(263, " NewChinaPainting "),
      wc(263, machine, "2026-11-01", ["CTP", "dbo", "mes"]),
      wc(263, machine, "2026-11-01", ["BTP", "other", "mes"]),
      wc(413, "GISLOTICA-PaintingMachine"),
      wc(618, "MR_Painting01"),
      wc(748, "MR_Painting01"),
    ],
    dim_tyre_spec_weight: specs,
    dim_recipemaster: [
      rm(10, "old SAP code", "2026-01-01"),
      rm(10, ` ${recipe} `),
      rm(11, "OTHER-SAP"),
      rm(10, recipe, "2026-11-01", ["CTP", "dbo", "mes"]),
      rm(10, recipe, "2026-11-01", ["BTP", "dbo", "other"]),
    ],
    fct_paintingdata: [
      ...Array.from({ length: 12 }, (_, i) => fact(i + 1, i + 1)),
      fact(13, 999, 263, 10, "CTP"),
      fact(14, 500, 263, 11),
      fact(15, null),
      fact(16, 900, 99),
      fact(17, 900, 263, 999),
      fact(18, 101, 413),
      fact(19, 102, 618),
      fact(20, 103, 748),
      fact(21, 201, 263, 10, "BTP", "2026-10-01 23:00:00"),
      fact(22, 202, 263, 10, "BTP", "2026-10-02 06:59:00"),
    ],
  };
  const result = spawnSync("python3", ["-c", sqlRunner], {
    input: JSON.stringify({ tables, queries }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("PAINTING: explicit machine mapping routes to the ID-based weight source", () => {
  assert.equal(src.table, "silver.fct_paintingdata");
  assert.equal(src.valueColumn, "weight");
  assert.equal(src.setpointColumn, "spec_weight");
  assert.equal(src.unit, null);
  assert.equal(src.tolerance, null);
  assert.equal(SILVER_SOURCES.filter((s) => s.kind === "painting").length, 1);
  for (const name of [
    "GISLOTICA-PaintingMachine",
    "NewChinaPainting",
    "OldChinaPainting",
    "MR_Painting01",
    "Manual Painting",
  ]) {
    assert.equal(resolveSilver(name, parameter).table, src.table);
    assert.equal(sourceForMachine(name).kind, "painting");
  }
  assert.equal(machinesForSource(src).length, 5);
  assert.equal(resolveSilver("OTHER-PAINTING", parameter), null);
  assert.equal(resolveSilver(machine, "Unknown Parameter"), null);
});

test("PAINTING SQL uses verified machine/recipe joins and a left-joined BTP SAP setpoint", () => {
  for (const sql of [
    silverPointsQuery(src, scope),
    silverBoardQuery(src, params, scope),
    silverSampleSizeQuery(src, params, scope),
  ]) {
    assert.match(sql, /silver\.fct_paintingdata p/);
    assert.match(sql, /silver\.dim_wcmaster/);
    assert.match(sql, /silver\.dim_recipemaster/);
    assert.match(sql, /p\.wc_id = w\.record_id/);
    assert.match(sql, /p\.recipe_id = r\.record_id/);
    assert.match(sql, /p\.plant_code = 'BTP'/);
    assert.match(sql, /p\.source_machine = w\.source_machine/);
    assert.match(sql, /p\.database_name = r\.database_name/);
    assert.match(sql, /w\.version_rank = 1/);
    assert.match(sql, /r\.version_rank = 1/);
  }
  const detail = silverPointsQuery(src, scope);
  assert.match(detail, /LEFT JOIN/);
  assert.match(detail, /silver\.dim_tyre_spec_weight/);
  assert.match(detail, /TRIM\(r\.description\) = s\.sap_code/);
  assert.match(detail, /p\.plant_code = s\.plant_code/);
  assert.match(detail, /database_name = 'sap'/);
  assert.match(detail, /spec_weight AS setpoint/);
  // Board/count queries do not depend on the setpoint table or pay for its join.
  assert.doesNotMatch(
    silverBoardQuery(src, params, scope),
    /dim_tyre_spec_weight/,
  );
  assert.doesNotMatch(
    silverSampleSizeQuery(src, params, scope),
    /dim_tyre_spec_weight/,
  );
});

test("PAINTING detail reads the right machine and SAP recipe once, with stable timestamp ties", () => {
  const [rows] = execute([silverPointsQuery(src, scope)]);
  assert.deepEqual(
    rows.map((r) => r.value),
    [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
  assert.deepEqual(
    rows.map((r) => r.reading_id),
    [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
  assert.ok(rows.every((r) => r.setpoint === 10));
});

test("PAINTING missing, invalid and foreign setpoints never drop weight readings or reuse older specs", () => {
  for (const specs of [
    [],
    [specRow(null)],
    [specRow(0)],
    [specRow(-1)],
    [specRow(9, "2026-10-01"), specRow(0)],
    [specRow(999, "2026-11-04", "CTP")],
    [specRow(888, "2026-11-04", "BTP", "mes")],
  ]) {
    const [points] = execute([silverPointsQuery(src, scope)], specs);
    assert.equal(points.length, 10);
    assert.deepEqual(
      points.map((p) => p.value),
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
    assert.ok(points.every((p) => p.setpoint == null));
    const detail = toSpcDetail([], {
      points,
      limits: { valid: true, ucl: 20, cl: 10, lcl: 0 },
      snapshot: "2026-11-04",
      scope,
      selection: { machine, recipe, parameter },
    });
    assert.equal(detail.histogram.target, null);
    assert.equal(detail.histogram.sample_size, 10);
    assert.match(detail.histogram.spec_note, /no positive setpoint available/);
  }
});

test("PAINTING duplicate latest specs do not multiply weights; conflicting latest weights have no target", () => {
  for (const specs of [
    [specRow(10), specRow(11)],
    [specRow(10), specRow(null)],
  ]) {
    const [points] = execute([silverPointsQuery(src, scope)], specs);
    assert.equal(points.length, 10);
    assert.ok(points.every((p) => p.setpoint == null));
  }
  const [points] = execute(
    [silverPointsQuery(src, scope)],
    [specRow(10), specRow(10)],
  );
  assert.deepEqual(
    points.map((p) => p.reading_id),
    [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
  assert.ok(points.every((p) => p.setpoint === 10));
});

test("PAINTING setpoint SAP codes are trimmed consistently with the recipe master", () => {
  const [points] = execute(
    [silverPointsQuery(src, scope)],
    [specRow(10, "2026-11-04", "BTP", "sap", ` ${recipe} `)],
  );
  assert.ok(points.length === 10 && points.every((p) => p.setpoint === 10));
});

test("PAINTING board sparklines agree with the same latest detail subgroups", () => {
  const [points, board] = execute([
    silverPointsQuery(src, scope),
    silverBoardQuery(src, params, { ...scope, size: 5, points: 2 }),
  ]);
  const sg = subgroups(
    points.map((p) => ({ event_time: p.event_time, value: p.value })),
    5,
  );
  assert.deepEqual(
    board.map((r) => r.weight),
    sg.means,
  );
  assert.deepEqual(
    board.map((r) => r.event_time),
    sg.times,
  );
  assert.ok(
    board.every(
      (r) => r.machine === machine && r.recipe === recipe && r.n_weight === 2,
    ),
  );
  const [all] = execute([silverSampleSizeQuery(src, params, { recipe })]);
  assert.equal(all.find((r) => r.machine === machine).weight, 14); // 12 recent + two older C-shift readings
  assert.equal(all.find((r) => r.machine === "MR_PAINTING01").weight, 2); // both verified work-centre IDs
});

test("PAINTING shift C preserves the midnight wrap without mixing other shifts", () => {
  const [rows] = execute([silverPointsQuery(src, { ...scope, shift: "C" })]);
  assert.deepEqual(
    rows.map((p) => p.value),
    [201, 202],
  );
});

test("PAINTING limits are recipe-specific; legacy source limits stay machine-level", () => {
  const key = baselineKey(machine, parameter, recipe);
  assert.notEqual(key, baselineKey(machine, parameter, "OTHER-SAP"));
  assert.equal(
    baselineKey("VMI_MAXX_01", "Belt 1 Length", recipe),
    "VMI_MAXX_01|||Belt 1 Length",
  );
  const rows = [recipe, "OTHER-SAP"].flatMap((itemcode) =>
    ["Cp", "Cpk", "Pp", "Ppk"].map((m) => ({
      machine,
      itemcode,
      kpi_name: `${parameter} ${m}`,
      actual_value: 2,
      status: "Healthy",
    })),
  );
  const limitsIndex = new Map([
    [key, { ucl: 12, lcl: 8 }],
    [baselineKey(machine, parameter, "OTHER-SAP"), { ucl: 102, lcl: 98 }],
  ]);
  const seriesIndex = new Map(
    [recipe, "OTHER-SAP"].map((r) => [
      `${machine}|||${r}|||${parameter}`,
      { means: [10], times: ["t1"], readings: 5 },
    ]),
  );
  const widgets = toSpcWidgets(rows, { limitsIndex, seriesIndex }).widgets;
  assert.equal(widgets.find((w) => w.recipe === recipe).control_chart.cl, 10);
  assert.equal(
    widgets.find((w) => w.recipe === "OTHER-SAP").control_chart.cl,
    100,
  );
});

test("PAINTING transformer draws X/R/histogram from weights and keeps GOLD values/limits", () => {
  const [points] = execute([silverPointsQuery(src, scope)]);
  const rows = ["Cp", "Cpk", "Pp", "Ppk"].map((m) => ({
    machine,
    itemcode: recipe,
    kpi_name: `${parameter} ${m}`,
    actual_value: 1.75,
    status: "Healthy",
  }));
  const detail = toSpcDetail(rows, {
    points,
    limits: { valid: true, ucl: 20, cl: 10, lcl: 0 },
    snapshot: "2026-11-01",
    scope: { shift: "All" },
    selection: { machine, recipe, parameter },
  });
  assert.equal(detail.measurement.source, "silver.fct_paintingdata");
  assert.equal(detail.capability.cp.value, 1.75);
  assert.deepEqual(
    detail.x_chart.points.map((p) => p.value),
    [5, 10],
  );
  assert.equal(detail.x_chart.ucl, 20);
  assert.equal(detail.r_chart.points.length, 2);
  assert.equal(detail.histogram.sample_size, 10);
  assert.equal(detail.histogram.target, 10);
  assert.equal(detail.histogram.usl, null);
  assert.equal(detail.histogram.lsl, null);
  assert.equal(detail.histogram.spec_limits_available, false);
  assert.match(detail.histogram.spec_note, /no tolerance defined/);
  assert.equal(detail.x_chart.unit, null);
});
