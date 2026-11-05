import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { UNIFORMITY_CARDS, uniformityScope } from "./contract.js";
import { recordedClock, uniformityQuery } from "./queries.js";
import { uniformityHandler, uniformityPage } from "./controller.js";
import { GOLD_ALL_COLUMNS } from "../../queries/gold-source.js";

const input = (changes = {}) => ({
  plant: "BANMORE",
  card: "mtms",
  from: "2026-01-31",
  to: "2026-01-31",
  period: "day",
  shift: "ALL",
  level: "machine",
  ...changes,
});
const scope = (changes = {}, kind = "gold") =>
  uniformityScope(input(changes), kind);
const sql = (changes = {}, kind = "gold") =>
  uniformityQuery(scope(changes, kind));
function table(columns, rows = []) {
  return {
    columns: Object.fromEntries(
      columns.map((name) => [
        name,
        ["actual_value", "rfv_cw", "upper"].includes(name) ? "REAL" : "TEXT",
      ]),
    ),
    rows,
  };
}
function execute(queries, extra = {}) {
  const columns = [
    "date",
    "machine",
    "itemcode",
    "remarks",
    "kpi_name",
    "actual_value",
    "plant",
    "department",
    "category",
    "granularity",
  ];
  const tables = {
    "gold.gold": table(columns),
    "gold.gold_daily": table(columns),
    ...extra,
  };
  const result = spawnSync(
    "python",
    [new URL("./test-support/execute-sqlite.py", import.meta.url).pathname],
    { input: JSON.stringify({ queries, tables }), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function gold(kpi_name, actual_value, changes = {}) {
  return {
    plant: "BANMORE",
    department: "Quality",
    category: "Uniformity Testing",
    granularity: "DAY",
    date: "2026-01-31",
    machine: "MICROPOISE",
    itemcode: null,
    remarks: null,
    kpi_name,
    actual_value,
    ...changes,
  };
}
const mc = UNIFORMITY_CARDS.mtms;
const silverColumns = [
  "event_time",
  "barcode",
  "plant_code",
  "machine_name",
  "item_code",
  "rfv_cw",
  "grade_rfv_cw",
  "record_id",
];
function tyre(barcode, event_time, changes = {}) {
  return {
    barcode,
    event_time,
    plant_code: "BTP",
    machine_name: "Micropoise",
    item_code: "SIZE",
    rfv_cw: 12,
    grade_rfv_cw: "C",
    record_id: "1",
    ...changes,
  };
}
function silver(tyres, recipes = []) {
  return {
    "silver.fct_productiondatatuo": table(silverColumns, tyres),
    "silver.dim_recipemaster": table(
      ["plant_code", "tyre_size", "description"],
      recipes,
    ),
  };
}
const selection = { machine: "MICROPOISE", sku: "SAP", parameter: "RFV CW" };
const recipe = [
  { plant_code: "BTP", tyre_size: "SIZE", description: "SAP" },
  { plant_code: "CTP", tyre_size: "SIZE", description: "AAA-WRONG" },
];

test("prescribed KPI maps, shared ZF tested counts and TUO Gold-only", () => {
  assert.equal(
    UNIFORMITY_CARDS["zf-balancing"].machineTested,
    "Zf_Uniformity_Production",
  );
  assert.equal(
    UNIFORMITY_CARDS["zf-balancing"].skuTested,
    "Zf_Uniformity_Production_m_sku",
  );
  assert.equal(
    UNIFORMITY_CARDS.dbm.machineTested,
    "Dbm_Balancing_Production_m",
  );
  for (const [card, c] of Object.entries(UNIFORMITY_CARDS))
    for (const level of ["machine", "sku"]) {
      const query = sql({
        card,
        level,
        ...(level === "sku" ? { machine: "M" } : {}),
      });
      assert.ok(
        query.includes(c[level === "sku" ? "skuYield" : "machineYield"]),
      );
      assert.ok(
        query.includes(c[level === "sku" ? "skuTested" : "machineTested"]),
      );
    }
  assert.throws(
    () => scope({ card: "tuo", ...selection }, "barcodes"),
    (e) => e.status === 503 && e.code === "TUO_SOURCE_UNAVAILABLE",
  );
  assert.throws(() =>
    scope({ card: "tuo", level: "parameter", machine: "M", sku: "S" }),
  );
});

test("strict allowlists, calendar/range/shift validation and complete identity", () => {
  for (const changes of [
    { plant: "CHENNAI" },
    { card: "__proto__" },
    { card: "Scrap" },
    { from: "2026-02-30" },
    { from: "2026-02-01", to: "2026-01-31" },
    { from: "2024-01-01", to: "2026-01-31", period: "range" },
    { shift: "SHIFT A" },
    { shift: ["A", "B"] },
    { period: "month", shift: "A" },
    { period: "day", to: "2026-02-01" },
    { period: "month", from: "2026-01-02" },
    { period: "year", from: "2026-02-01" },
    { level: "sku" },
    { level: "parameter", machine: "M" },
    { level: "machine", machine: "M" },
    { limit: "0" },
    { limit: "201" },
    { offset: "1; DROP" },
    { offset: "-1" },
    { from: ["2026-01-31"] },
  ])
    assert.throws(() => scope(changes), JSON.stringify(changes));
  assert.equal(
    scope({ from: "2024-02-29", to: "2024-02-29", shift: "B" }).granularity,
    "SHIFT B",
  );
  for (const card of ["zf-uniformity", "zf-balancing"])
    assert.throws(() =>
      scope(
        {
          card,
          ...selection,
          parameter: card === "zf-balancing" ? "Upper Unbalance" : "RFV CW",
        },
        "points",
      ),
    );
  assert.throws(() =>
    scope(
      { ...selection, parameter: "RFV CW'; DROP TABLE gold.gold" },
      "barcodes",
    ),
  );
  assert.throws(() => scope({ ...selection, sku: ["SAP"] }, "barcodes"));
});

test("query shape: selected KPI/level only, full scope, escaping, no AVG or preloads", () => {
  const query = sql({ level: "sku", machine: "M' OR 1=1 --" });
  assert.match(query, /UPPER\(machine\) = UPPER\('M'' OR 1=1 --'\)/);
  for (const filter of [
    "plant = 'BANMORE'",
    "department = 'Quality'",
    "category = 'Uniformity Testing'",
    "LIMIT 101",
  ])
    assert.ok(query.includes(filter));
  assert.doesNotMatch(query, /AVG\(|silver\.|Param_OffSpec/);
  for (const shift of ["A", "B", "C"])
    assert.ok(sql({ shift }).includes(`granularity = 'SHIFT ${shift}'`));
  assert.ok(
    sql({ period: "month", from: "2026-01-01" }).includes(
      "granularity = 'MONTH'",
    ),
  );
  assert.ok(
    sql({ period: "year", from: "2026-01-01" }).includes(
      "granularity = 'YEAR'",
    ),
  );
  const silverQuery = sql(
    { ...selection, machine: "M'--", sku: "S'--", limit: "20", offset: "40" },
    "barcodes",
  );
  assert.match(silverQuery, /UPPER\(machine\) = UPPER\('M''--'\)/);
  assert.match(silverQuery, /OFFSET 40 LIMIT 21/);
  assert.doesNotMatch(silverQuery, /gold\.|AVG\(|CROSS JOIN \(VALUES/);
  assert.ok(
    silverQuery.indexOf("plant_code = 'BTP'") <
      silverQuery.indexOf("ROW_NUMBER()"),
  );
  assert.match(silverQuery, /WHERE plant_code = 'BTP' GROUP BY tyre_size/);
  const ranked = silverQuery.slice(
    silverQuery.indexOf("), t AS"),
    silverQuery.indexOf("), d AS"),
  );
  assert.doesNotMatch(ranked, /UPPER\(machine|UPPER\(sku|shift =|test_clock </);
  assert.match(silverQuery, /ORDER BY test_time DESC, barcode ASC NULLS LAST/);
});

test("Gold weighted range arithmetic and no invented rows/zeros, including empty scope", () => {
  const rows = [
    gold(mc.machineYield, 100),
    gold(mc.machineTested, 10),
    gold(mc.machineYield, 50, { date: "2026-02-01" }),
    gold(mc.machineTested, 90, { date: "2026-02-01" }),
    gold(mc.machineYield, 1, { plant: "CTP" }),
    gold(mc.machineYield, 2, { category: "SPC" }),
  ];
  const tables = { "gold.gold": table(Object.keys(rows[0]), rows) };
  const [[range], [day], empty] = execute(
    [
      sql({ period: "range", to: "2026-02-01" }),
      sql(),
      sql({ level: "sku", machine: "MICROPOISE" }),
    ],
    tables,
  );
  assert.equal(range.yield_pct, 55);
  assert.equal(range.tyres_tested, 100);
  assert.equal(day.yield_pct, 100);
  assert.equal(day.tyres_tested, 10);
  assert.deepEqual(empty, []);
  rows.splice(1, 1);
  const [[missing]] = execute([sql()], {
    "gold.gold": table(Object.keys(rows[0]), rows),
  });
  assert.equal(missing.tyres_tested, null);
});

test("parameter range denominator includes days without parameter rows; stored pct not recomputed", () => {
  const sku = { itemcode: "SAP" };
  const rows = [
    gold(mc.qty, 2, { ...sku, remarks: "RFV CW" }),
    gold(mc.pct, 99, { ...sku, remarks: "RFV CW" }),
    gold(mc.skuTested, 10, sku),
    gold(mc.skuTested, 90, { ...sku, date: "2026-02-01" }),
  ];
  const [[day], [range]] = execute(
    [
      sql({ level: "parameter", machine: "MICROPOISE", sku: "SAP" }),
      sql({
        level: "parameter",
        machine: "MICROPOISE",
        sku: "SAP",
        period: "range",
        to: "2026-02-01",
      }),
    ],
    { "gold.gold": table(Object.keys(rows[0]), rows) },
  );
  assert.equal(day.failed_pct, 99);
  assert.equal(range.failed_pct, 2);
  assert.equal(range.failed_tyres, 2);
});

test("latest tests across machines, SKUs, shifts and after-window retests; distinct barcode parity", () => {
  const rows = [
    tyre("kept", "2026-01-31 08:00:00"),
    tyre("repeat", "2026-01-31 09:00:00"),
    tyre("repeat", "2026-01-31 10:00:00", {
      record_id: "2",
      grade_rfv_cw: "A",
    }),
    tyre("later", "2026-01-31 11:00:00"),
    tyre("later", "2026-02-01 07:00:00", { record_id: "2" }),
    tyre("machine", "2026-01-31 08:00:00"),
    tyre("machine", "2026-01-31 12:00:00", {
      machine_name: "OTHER",
      record_id: "2",
    }),
    tyre("sku", "2026-01-31 08:00:00"),
    tyre("sku", "2026-01-31 13:00:00", { item_code: "OTHER", record_id: "2" }),
    tyre("kept", "2026-02-02 12:00:00", { plant_code: "CTP" }),
    tyre("no-reading", "2026-01-31 08:01:00", {
      rfv_cw: null,
      grade_rfv_cw: "A",
    }),
  ];
  const [barcodes, points] = execute(
    [sql(selection, "barcodes"), sql(selection, "points")],
    silver(rows, recipe),
  );
  assert.deepEqual(
    barcodes.map((r) => r.barcode),
    ["kept"],
  );
  assert.equal(points.length, 2);
  assert.equal(
    points.filter((r) => r.is_off_spec === 1).length,
    barcodes.length,
  );
  assert.equal(new Set(points.map((r) => r.barcode)).size, points.length);
  assert.ok(points.every((r) => r.sku === "SAP"));
});

test("recorded clock boundaries 07/15/23/midnight/month edge and explicit offsets", () => {
  assert.equal(
    recordedClock("event_time"),
    "CAST(format_datetime(event_time, 'yyyy-MM-dd HH:mm:ss.SSS') AS timestamp)",
  );
  const times = [
    "2026-01-31 06:59:59+05:30",
    "2026-01-31 07:00:00+05:30",
    "2026-01-31 14:59:59+00:00",
    "2026-01-31 15:00:00+00:00",
    "2026-01-31 22:59:59-04:00",
    "2026-01-31 23:00:00-04:00",
    "2026-02-01 00:00:00+05:30",
    "2026-02-01 06:59:59+05:30",
    "2026-02-01 07:00:00+05:30",
  ];
  const rows = times.map((time, i) => tyre(String(i), time));
  const [all, a, b, c] = execute(
    ["ALL", "A", "B", "C"].map((shift) =>
      sql({ ...selection, shift }, "points"),
    ),
    silver(rows, recipe),
  );
  assert.deepEqual(
    all.map((r) => r.barcode),
    ["1", "2", "3", "4", "5", "6", "7"],
  );
  assert.deepEqual(
    a.map((r) => r.barcode),
    ["1", "2"],
  );
  assert.deepEqual(
    b.map((r) => r.barcode),
    ["3", "4"],
  );
  assert.deepEqual(
    c.map((r) => r.barcode),
    ["5", "6", "7"],
  );
  assert.ok(all.every((r) => r.production_date === "2026-01-31"));
});

test("ZF grades only and DBM numeric OE grade translation / supplied machine map", () => {
  const z = sql({ card: "zf-uniformity", ...selection }, "barcodes");
  assert.match(z, /CAST\(NULL AS DOUBLE\) AS actual_value/);
  const d = sql(
    { card: "dbm", ...selection, parameter: "Upper Unbalance" },
    "points",
  );
  assert.match(d, /wc_id = 278 THEN 'Micropoise'/);
  assert.match(d, /CAST\(b\."upper_grade" AS VARCHAR\) IN \('0', '1'\)/);
  const fixtures = silver([], recipe);
  fixtures["silver.fct_productiondatapcrdbnew"] = table(
    [
      "event_time",
      "barcode",
      "plant_code",
      "wc_id",
      "item_code",
      "upper",
      "upper_grade",
      "record_id",
    ],
    [
      {
        event_time: "2026-01-31 08:00:00",
        barcode: "oe",
        plant_code: "BTP",
        wc_id: "278",
        item_code: "SIZE",
        upper: 5,
        upper_grade: "1",
        record_id: "1",
      },
      {
        event_time: "2026-01-31 09:00:00",
        barcode: "bad",
        plant_code: "BTP",
        wc_id: "278",
        item_code: "SIZE",
        upper: 7,
        upper_grade: "2",
        record_id: "2",
      },
    ],
  );
  // SQLite test schema must retain wc_id as numeric, just like verified Athena metadata.
  fixtures["silver.fct_productiondatapcrdbnew"].columns.wc_id = "INTEGER";
  const [[oe, bad]] = execute([d], fixtures);
  assert.equal(oe.is_off_spec, 0);
  assert.equal(bad.is_off_spec, 1);
});

test("pagination is bounded, stable, count-honest; truncation/duplicate/numeric errors are explicit", () => {
  const s = scope({ limit: "2" });
  const raw = [1, 2, 3].map((n) => ({
    machine: `M${n}`,
    tyres_tested: "0",
    yield_pct: null,
    _total: "3",
    _duplicates: 0,
  }));
  const page = uniformityPage(raw, s);
  assert.equal(page.rows.length, 2);
  assert.equal(page.total, 3);
  assert.equal(page.has_more, true);
  assert.equal(page.rows[0].tyres_tested, 0);
  assert.equal(page.rows[0].yield_pct, null);
  assert.throws(() => uniformityPage(raw.slice(0, 1), s), /truncated/);
  assert.throws(
    () => uniformityPage([{ ...raw[0], _total: undefined }], s),
    /consistent total/,
  );
  assert.throws(
    () =>
      uniformityPage(
        raw.map((r) => ({ ...r, _duplicates: 1 })),
        s,
      ),
    /Duplicate Gold/,
  );
  assert.throws(
    () =>
      uniformityPage(
        raw.map((r) => ({ ...r, tyres_tested: "nan" })),
        s,
      ),
    /Invalid numeric/,
  );
  assert.deepEqual(uniformityPage([], s).rows, []);
  const tyres = [
    tyre("c", "2026-01-31 08:00:00"),
    tyre("a", "2026-01-31 08:00:00"),
    tyre("b", "2026-01-31 08:00:00"),
  ];
  const [first, next] = execute(
    [
      sql({ ...selection, limit: "1" }, "points"),
      sql({ ...selection, limit: "1", offset: "1" }, "points"),
    ],
    silver(tyres, recipe),
  );
  assert.deepEqual(
    first.map((r) => r.barcode),
    ["a", "b"],
  );
  assert.deepEqual(
    next.map((r) => r.barcode),
    ["b", "c"],
  );
  assert.equal(first[0]._total, 3);
});

test("preserved references retain provenance; every allowed parameter generates one scoped query", () => {
  const root = new URL(
    "../../../../docs/references/uniformity-v1.2/",
    import.meta.url,
  );
  const manifest = JSON.parse(
    readFileSync(new URL("provenance.json", root), "utf8"),
  );
  for (const [name, expected] of Object.entries(manifest.files)) {
    assert.equal(
      createHash("sha256")
        .update(readFileSync(new URL(name, root)))
        .digest("hex"),
      expected,
    );
  }
  assert.equal(
    createHash("sha256")
      .update(readFileSync(new URL("Uniformity_Drilldown_Dev_Guide.md", root)))
      .digest("hex"),
    manifest.guide.sha256,
  );
  for (const [card, cfg] of Object.entries(UNIFORMITY_CARDS))
    for (const parameter of cfg.parameters) {
      const query = sql({ card, ...selection, parameter }, "barcodes");
      assert.ok(query.includes(cfg.table));
      assert.ok(query.includes(`'${parameter}' AS parameter`));
      assert.doesNotMatch(
        query,
        /:from_date|:to_date|:machine|:sku|:parameter|SELECT \*, CAST\(format_datetime/,
      );
    }
});

test("shift filtering follows latest-test ranking; a retest in B removes A's failure", () => {
  const rows = [
    tyre("moved-shift", "2026-01-31 08:00:00"),
    tyre("moved-shift", "2026-01-31 15:00:00", { record_id: "2" }),
  ];
  const [a, b] = execute(
    [
      sql({ ...selection, shift: "A" }, "barcodes"),
      sql({ ...selection, shift: "B" }, "barcodes"),
    ],
    silver(rows, recipe),
  );
  assert.deepEqual(a, []);
  assert.equal(b.length, 1);
  assert.equal(b[0].shift, "B");
});

test("stored MONTH/YEAR values stay stored; missing range denominators and duplicate Gold stay explicit", () => {
  const rows = [
    gold(mc.machineYield, 87, { granularity: "MONTH", date: "2026-01-01" }),
    gold(mc.machineTested, 900, { granularity: "MONTH", date: "2026-01-01" }),
    gold(mc.machineYield, 82, { granularity: "YEAR", date: "2026-01-01" }),
    gold(mc.machineTested, 5000, { granularity: "YEAR", date: "2026-01-01" }),
    gold(mc.machineYield, 99),
    gold(mc.machineTested, 10),
  ];
  const [[month], [year]] = execute(
    [
      sql({ period: "month", from: "2026-01-01" }),
      sql({ period: "year", from: "2026-01-01" }),
    ],
    { "gold.gold": table(Object.keys(rows[0]), rows) },
  );
  assert.equal(month.yield_pct, 87);
  assert.equal(month.tyres_tested, 900);
  assert.equal(year.yield_pct, 82);
  const paramRows = [
    gold(mc.qty, 2, { itemcode: "SAP", remarks: "RFV CW" }),
    gold(mc.skuTested, 90, { itemcode: "SAP", date: "2026-02-01" }),
  ];
  const [[param]] = execute(
    [
      sql({
        period: "range",
        to: "2026-02-01",
        level: "parameter",
        machine: "MICROPOISE",
        sku: "SAP",
      }),
    ],
    { "gold.gold": table(Object.keys(paramRows[0]), paramRows) },
  );
  assert.equal(param.failed_tyres, 2);
  assert.equal(param.failed_pct, null);
  const duplicateRows = [
    gold(mc.machineYield, 80),
    gold(mc.machineYield, 90),
    gold(mc.machineTested, 10),
  ];
  const [duplicated] = execute([sql()], {
    "gold.gold": table(Object.keys(duplicateRows[0]), duplicateRows),
  });
  assert.throws(() => uniformityPage(duplicated, scope()), /Duplicate Gold/);
});

test("independent: strict Gold companion scope, zero denominators and duplicate parameter rows", () => {
  const selected = { itemcode: "SAP", remarks: "RFV CW" };
  const rows = [
    gold(mc.machineYield, 0),
    gold(mc.machineTested, 0),
    gold(mc.machineTested, 999, { plant: "CTP" }),
    gold(mc.machineTested, 999, { department: "Production" }),
    gold(mc.machineTested, 999, { category: "Other" }),
    gold(mc.machineTested, 999, { granularity: "SHIFT A" }),
    gold(mc.qty, 0, selected),
    gold(mc.skuTested, 0, { itemcode: "SAP" }),
    gold(mc.skuTested, 999, { itemcode: "OTHER" }),
  ];
  const parameter = { level: "parameter", machine: "MICROPOISE", sku: "SAP" };
  const [[day], [range], [failed]] = execute(
    [sql(), sql({ period: "range" }), sql({ ...parameter, period: "range" })],
    { "gold.gold": table(Object.keys(rows[0]), rows) },
  );
  assert.equal(day.yield_pct, 0);
  assert.equal(day.tyres_tested, 0);
  assert.equal(range.yield_pct, null);
  assert.equal(range.tyres_tested, 0);
  assert.equal(failed.failed_tyres, 0);
  assert.equal(failed.failed_pct, null);
  rows.push(gold(mc.pct, 0, selected), gold(mc.pct, 0, selected));
  const [duplicate] = execute([sql(parameter)], {
    "gold.gold": table(Object.keys(rows[0]), rows),
  });
  assert.throws(
    () => uniformityPage(duplicate, scope(parameter)),
    /Duplicate Gold/,
  );
});

test("independent: Uniformity range uses disjoint historical/fresh sources, not stale counterparts", (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-01-31T09:00:00Z"));
  const old = { date: "2026-01-28" };
  const fresh = { date: "2026-01-29" };
  const baseRows = [
    gold(mc.machineYield, 100, old),
    gold(mc.machineTested, 10, old),
    gold(mc.machineYield, 1, fresh),
    gold(mc.machineTested, 999, fresh),
  ];
  const dailyRows = [
    gold(mc.machineYield, 1, old),
    gold(mc.machineTested, 999, old),
    gold(mc.machineYield, 50, fresh),
    gold(mc.machineTested, 90, fresh),
  ];
  const [[result]] = execute(
    [sql({ from: old.date, to: fresh.date, period: "range" })],
    {
      "gold.gold": table(GOLD_ALL_COLUMNS, baseRows),
      "gold.gold_daily": table(GOLD_ALL_COLUMNS, dailyRows),
    },
  );
  assert.equal(result.yield_pct, 55);
  assert.equal(result.tyres_tested, 100);
  assert.equal(result._duplicates, 0);
});

test("independent: latest-test ties, recipe duplicate collapse/fallback, missing readings and null grades", () => {
  const rows = [
    tyre("tied", "2026-01-31 08:00:00", { record_id: "1" }),
    tyre("tied", "2026-01-31 08:00:00", { record_id: "2", grade_rfv_cw: "B" }),
    tyre("null-grade", "2026-01-31 09:00:00", { grade_rfv_cw: null }),
    tyre("no-reading", "2026-01-31 10:00:00", { rfv_cw: null }),
    tyre("fallback", "2026-01-31 11:00:00", { item_code: "SAP" }),
  ];
  const recipes = [
    ...recipe,
    { plant_code: "BTP", tyre_size: "SIZE", description: "ZZZ" },
    recipe[0],
  ];
  const [barcodes, points] = execute(
    [sql(selection, "barcodes"), sql(selection, "points")],
    silver(rows, recipes),
  );
  assert.deepEqual(
    barcodes.map((r) => r.barcode),
    ["fallback", "no-reading", "null-grade"],
  );
  assert.deepEqual(
    points.map((r) => r.barcode),
    ["tied", "null-grade", "fallback"],
  );
  assert.equal(points[0].grade, "B");
  assert.equal(points[0].is_off_spec, 0);
  assert.equal(points[1].is_off_spec, 1);
  assert.equal(barcodes[1].actual_value, null);
  assert.ok(points.every((r) => r._total === 3));
});

test("handler cache isolates free-text identities containing cache field separators", async () => {
  const delimiter =
    "&offset=0&parameter=null&period=day&plant=BANMORE&shift=ALL&sku=";
  const a = input({
    level: "parameter",
    machine: `M${delimiter}S`,
    sku: "T",
  });
  const b = input({
    level: "parameter",
    machine: "M",
    sku: `S${delimiter}T`,
  });
  const cache = new Map();
  const queries = [];
  const handler = uniformityHandler("gold", {
    runQuery: async (query) => {
      queries.push(query);
      return [];
    },
    cached: async (key, load) => {
      if (!cache.has(key)) cache.set(key, await load());
      return cache.get(key);
    },
  });
  const contexts = [];
  const response = { json: (body) => contexts.push(body.data.context) };
  const next = (error) => {
    throw error;
  };
  await handler({ query: a }, response, next);
  await handler({ query: b }, response, next);
  await handler({ query: a }, response, next);
  assert.equal(queries.length, 2);
  assert.notEqual(queries[0], queries[1]);
  assert.equal(cache.size, 2);
  assert.equal(contexts[0].machine, a.machine);
  assert.equal(contexts[1].machine, b.machine);
  assert.equal(contexts[1].sku, b.sku);
  assert.deepEqual(contexts[2], contexts[0]);
});

test("handler performs one exact-scope Athena read; no query on invalid/TUO requests; errors propagate", async () => {
  const calls = [];
  const keys = [];
  const handler = uniformityHandler("gold", {
    runQuery: async (...args) => {
      calls.push(args);
      return [];
    },
    cached: async (key, load) => {
      keys.push(key);
      return load();
    },
  });
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler({ query: input() }, response, (err) => {
    throw err;
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { engine: "athena", tables: [] });
  assert.equal(response.body.data.total, 0);
  await handler(
    { query: input({ level: "sku", machine: "OTHER" }) },
    response,
    (err) => {
      throw err;
    },
  );
  assert.notEqual(keys[0], keys[1]);
  await handler({ query: input({ card: "Scrap" }) }, response, () => {});
  assert.equal(response.statusCode, 400);
  assert.equal(calls.length, 2);
  await uniformityHandler("barcodes", {
    runQuery: async () => {
      throw new Error("must not call");
    },
  })({ query: input({ card: "tuo", ...selection }) }, response, (err) => {
    throw err;
  });
  assert.equal(response.statusCode, 503);
  const expected = new Error("upstream failed");
  let forwarded;
  await uniformityHandler("gold", {
    runQuery: async () => {
      throw expected;
    },
    cached: async (_, load) => load(),
  })({ query: input() }, response, (err) => {
    forwarded = err;
  });
  assert.equal(forwarded, expected);
});
