import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

import { resolveGranularity } from "./normalize.js";
import {
  PRODUCT_CARD_KPIS,
  isAllowedProductDrillKpi,
  isProductCardKpi,
  productChildrenQuery,
  productHistoryQuery,
  productScopePredicate,
  productSummaryQuery,
  uniformityTrendQuery,
} from "./queries/product.queries.js";
import {
  toProductChildren,
  toProductHistory,
  toProductSummary,
} from "./transformers/product.transformers.js";

function executeProductSql(queries, rows) {
  const columns = [
    "date",
    "machine",
    "kpi_name",
    "actual_value",
    "unit_of_measurement",
    "threshold_value",
    "status",
    "drill_down_attribute",
    "itemcode",
    "plant",
    "department",
    "category",
    "section",
    "granularity",
  ];
  const table = {
    columns: Object.fromEntries(
      columns.map((name) => [name, name === "actual_value" ? "REAL" : "TEXT"]),
    ),
    rows,
  };
  const result = spawnSync(
    "python3",
    [
      new URL("./uniformity/test-support/execute-sqlite.py", import.meta.url)
        .pathname,
    ],
    {
      input: JSON.stringify({
        queries,
        tables: {
          "gold.gold": table,
          "gold.gold_daily": { ...table, rows: [] },
        },
      }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("Product scope is pinned to Banmore Quality Uniformity Testing", () => {
  const predicate = productScopePredicate();
  assert.match(predicate, /LOWER\(department\) = 'quality'/);
  assert.match(predicate, /category = 'Uniformity Testing'/);
  assert.match(predicate, /UPPER\(plant\) = 'BANMORE'/);
});

test("Product summary includes Uniformity and the single Paint Weight headline", () => {
  assert.deepEqual(PRODUCT_CARD_KPIS, [
    "Overall_Production_Yield",
    "Overall_Uniformity_Production",
    "Mtms_Uniformity_Yield",
    "Tuo_Uniformity_Yield",
    "Zf_Uniformity_Yield",
    "Zf_Balancing_Yield_o",
    "Dbm_Balancing_Yield",
    "Paint_Wt_Within3_Pct_overall",
  ]);
  const sql = productSummaryQuery({ date: "2026-10-09", granularity: "DAY" });
  assert.match(sql, /kpi_name IN/);
  assert.match(sql, /granularity = 'DAY'/);
  assert.match(sql, /20261009/);
  assert.match(sql, /LOWER\(department\) = 'production'/);
  assert.match(sql, /section = 'Final Finish'/);
  assert.match(sql, /category = 'Process Audit'/);
  assert.doesNotMatch(sql, /Paint_Wt_Within[12]_Pct_overall/);
});

test("BTP Overall yield stays exclusive while BANMORE siblings/children and Paint Weight stay scoped across Product reads", () => {
  const overall = "Overall_Production_Yield";
  const sibling = "Mtms_Uniformity_Yield";
  const child = "Mtms_Uniformity_Yield_m";
  const paint = "Paint_Wt_Within3_Pct_overall";
  const otherCards = [
    ["Overall_Uniformity_Production", 158487],
    ["Tuo_Uniformity_Yield", 98.29],
    ["Zf_Uniformity_Yield", 93.33],
    ["Zf_Balancing_Yield_o", 99.77],
    ["Dbm_Balancing_Yield", 96.65],
  ];
  const row = (kpi_name, actual_value, changes = {}) => ({
    date: "2026-01-01",
    granularity: "MONTH",
    machine: "",
    itemcode: "",
    plant: "BTP",
    department: "Quality",
    category: "Uniformity Testing",
    section: "",
    kpi_name,
    actual_value,
    unit_of_measurement: "%",
    threshold_value: null,
    status: null,
    drill_down_attribute: "",
    ...changes,
  });
  const rows = [
    row(overall, 97.42),
    row(overall, 42, { plant: "BANMORE" }),
    row(overall, 1, { plant: "CTP" }),
    row(overall, 2, { department: "Production" }),
    row(overall, 3, { category: "Other" }),
    row(overall, 4, { granularity: "DAY" }),
    row(overall, 5, { date: "2026-02-01" }),
    row(sibling, 99.07, { plant: "BANMORE" }),
    row(sibling, 10),
    ...otherCards.flatMap(([name, value]) => [
      row(name, value, { plant: "BANMORE" }),
      row(name, 7),
    ]),
    row(child, 98.5, { plant: "BANMORE", machine: "M1" }),
    row(child, 20, { machine: "M1" }),
    row(paint, 91.4, {
      plant: "BANMORE",
      department: "Production",
      category: "Process Audit",
      section: "Final Finish",
    }),
    row(paint, 1, {
      department: "Production",
      category: "Process Audit",
      section: "Final Finish",
    }),
  ];
  const period = { date: "2026-01-01", granularity: "MONTH" };
  const range = { from: period.date, to: period.date };
  const [summary, children, history, trendPlant, trendMachine] =
    executeProductSql(
      [
        productSummaryQuery(period),
        productChildrenQuery({
          ...period,
          kpiNames: [overall, sibling, child],
        }),
        productHistoryQuery({
          ...range,
          granularity: "MONTH",
          kpiNames: [overall, sibling],
        }),
        uniformityTrendQuery({
          ...range,
          granularities: ["MONTH"],
          rowScope: "plant",
          kpiNames: [overall, sibling, child],
        }),
        uniformityTrendQuery({
          ...range,
          granularities: ["MONTH"],
          rowScope: "machine",
          kpiNames: [overall, sibling, child],
        }),
      ],
      rows,
    );
  assert.deepEqual(
    summary.map((r) => [r.kpi_name, r.actual_value]).sort(),
    [[sibling, 99.07], [overall, 97.42], [paint, 91.4], ...otherCards].sort(),
  );
  const transformed = toProductSummary(summary);
  assert.equal(transformed.values[overall].actual_value, 97.42);
  assert.equal(transformed.values[overall].drill_down.is_leaf, true);
  assert.equal(transformed.values[sibling].actual_value, 99.07);
  assert.deepEqual(
    children.map((r) => [r.kpi_name, r.actual_value]).sort(),
    [
      [sibling, 99.07],
      [child, 98.5],
      [overall, 97.42],
    ].sort(),
  );
  assert.deepEqual(
    history.map((r) => [r.kpi_name, r.actual_value]).sort(),
    [
      [sibling, 99.07],
      [overall, 97.42],
    ].sort(),
  );
  assert.deepEqual(
    trendPlant.map((r) => [r.kpi_name, r.actual_value]).sort(),
    [
      [sibling, 99.07],
      [overall, 97.42],
    ].sort(),
  );
  assert.deepEqual(
    trendMachine.map((r) => [r.kpi_name, r.actual_value]),
    [[child, 98.5]],
  );
  for (const name of [sibling, child, ...otherCards.map(([name]) => name)]) {
    const sql = productChildrenQuery({ ...period, kpiNames: [name] });
    assert.doesNotMatch(sql, /UPPER\(plant\) = 'BTP'/);
  }
  const overallOnly = productChildrenQuery({ ...period, kpiNames: [overall] });
  assert.match(overallOnly, /UPPER\(plant\) = 'BTP'/);
  assert.doesNotMatch(overallOnly, /UPPER\(plant\) = 'BANMORE'/);
  const [plantRows, machineRows] = executeProductSql(
    [
      uniformityTrendQuery({
        ...range,
        granularities: ["MONTH"],
        rowScope: "plant",
        kpiNames: [overall, child],
      }),
      uniformityTrendQuery({
        ...range,
        granularities: ["MONTH"],
        rowScope: "machine",
        kpiNames: [overall, child],
      }),
    ],
    [...rows, row(overall, 88, { machine: "M-EXTRA" })],
  );
  assert.deepEqual(
    plantRows.map((r) => [r.kpi_name, r.actual_value]),
    [[overall, 97.42]],
  );
  assert.deepEqual(
    machineRows.map((r) => [r.kpi_name, r.actual_value]).sort(),
    [
      [child, 98.5],
      [overall, 88],
    ].sort(),
  );
});

test("Overall yield retains exact DAY, SHIFT and date bounds across summary, child, history and trend", () => {
  const name = "Overall_Production_Yield";
  const make = (date, granularity, actual_value, plant = "BTP") => ({
    date,
    granularity,
    actual_value,
    plant,
    kpi_name: name,
    department: "Quality",
    category: "Uniformity Testing",
    machine: "",
    itemcode: "",
  });
  const rows = [
    make("2026-01-02", "DAY", 97),
    make("2026-01-02", "SHIFT A", 96),
    make("2026-01-02", "SHIFT B", 98),
    make("2026-01-02", "SHIFT A", 1, "BANMORE"),
    make("2026-01-03", "SHIFT A", 2),
  ];
  const [day, shift, children, history, trend] = executeProductSql(
    [
      productSummaryQuery({ date: "2026-01-02", granularity: "DAY" }),
      productSummaryQuery({ date: "2026-01-02", granularity: "SHIFT A" }),
      productChildrenQuery({
        date: "2026-01-02",
        granularity: "SHIFT A",
        kpiNames: [name],
      }),
      productHistoryQuery({
        from: "2026-01-02",
        to: "2026-01-02",
        granularity: "DAY",
        kpiNames: [name],
      }),
      uniformityTrendQuery({
        from: "2026-01-02",
        to: "2026-01-02",
        granularities: ["SHIFT A", "SHIFT B"],
        rowScope: "plant",
        kpiNames: [name],
      }),
    ],
    rows,
  );
  assert.deepEqual(
    day.map((r) => r.actual_value),
    [97],
  );
  assert.deepEqual(
    shift.map((r) => r.actual_value),
    [96],
  );
  assert.deepEqual(
    children.map((r) => r.actual_value),
    [96],
  );
  assert.deepEqual(
    history.map((r) => r.actual_value),
    [97],
  );
  assert.deepEqual(trend.map((r) => [r.granularity, r.actual_value]).sort(), [
    ["SHIFT A", 96],
    ["SHIFT B", 98],
  ]);
});

test("Paint Weight drill reads published overall and SKU values from its own scope", () => {
  const names = [
    "Paint_Wt_Within1_Pct_overall",
    "Paint_Wt_Within2_Pct_overall",
    "Paint_Wt_Within3_Pct_overall",
    "Paint_Wt_Tyre_Qty_sku",
    "Paint_Wt_Spec_Kg_sku",
    "Paint_Wt_Avg_Kg_sku",
    "Paint_Wt_Dev_Kg_sku",
    "Paint_Wt_Within1_Pct_sku",
    "Paint_Wt_Within2_Pct_sku",
    "Paint_Wt_Within3_Pct_sku",
  ];
  for (const name of names)
    assert.equal(isAllowedProductDrillKpi(name), true, name);
  assert.equal(isAllowedProductDrillKpi("Paint_Wt_Unknown_sku"), false);
  const sql = productChildrenQuery({
    kpiNames: names,
    date: "2026-10-21",
    granularity: "SHIFT A",
  });
  assert.match(sql, /SELECT itemcode,/);
  assert.match(sql, /LOWER\(department\) = 'production'/);
  assert.match(sql, /section = 'Final Finish'/);
  assert.doesNotMatch(sql, /Uniformity Testing/);
  const { rows } = toProductChildren([
    {
      itemcode: "SKU-01",
      kpi_name: "Paint_Wt_Spec_Kg_sku",
      actual_value: "8.125",
      unit_of_measurement: "KG",
    },
    {
      itemcode: "SKU-02",
      kpi_name: "Paint_Wt_Spec_Kg_sku",
      actual_value: null,
    },
  ]);
  assert.equal(rows[0].itemcode, "SKU-01");
  assert.equal(rows[0].actual_value, "8.125");
  assert.equal(rows[1].itemcode, "SKU-02");
  assert.equal(rows[1].actual_value, null);
});

test("Product child query only accepts the canonical drill tree", () => {
  assert.equal(isAllowedProductDrillKpi("Mtms_Uniformity_Yield_m"), true);
  assert.equal(isAllowedProductDrillKpi("Plant_quality_rating_o"), false);
  const sql = productChildrenQuery({
    kpiNames: ["Mtms_Uniformity_Yield_m"],
    date: "2026-10-09",
    granularity: "DAY",
  });
  assert.match(sql, /ORDER BY kpi_name ASC, machine ASC/);
  assert.match(sql, /Mtms_Uniformity_Yield_m/);
});

test("Product transformers preserve empty card states and row drill metadata", () => {
  const summary = toProductSummary([
    {
      kpi_name: "Overall_Production_Yield",
      actual_value: "97.58",
      unit_of_measurement: "%",
      drill_down_attribute: "['Mtms_Uniformity_Yield', 'Tuo_Uniformity_Yield']",
    },
  ]);
  assert.equal(summary.values.Overall_Production_Yield.actual_value, "97.58");
  assert.deepEqual(
    summary.values.Overall_Production_Yield.drill_down.children,
    ["Mtms_Uniformity_Yield", "Tuo_Uniformity_Yield"],
  );
  assert.equal(summary.values.Dbm_Balancing_Yield.actual_value, null);

  const children = toProductChildren([
    {
      kpi_name: "Mtms_Uniformity_Yield_m",
      machine: "30-0297",
      actual_value: "99.73",
      unit_of_measurement: "%",
      drill_down_attribute: null,
    },
  ]);
  assert.deepEqual(children.rows[0], {
    kpi_name: "Mtms_Uniformity_Yield_m",
    machine: "30-0297",
    actual_value: "99.73",
    unit: "%",
    threshold_value: null,
    status: null,
    drill_down: { is_leaf: true, children: [] },
  });
});

test("Product respects the same shift granularity normalization as Process", () => {
  assert.equal(resolveGranularity({ shift: "B" }), "SHIFT B");
});

test("Product history reads a dated card series at one granularity", () => {
  const sql = productHistoryQuery({
    kpiNames: ["Mtms_Uniformity_Yield", "Paint_Wt_Within3_Pct_overall"],
    from: "2026-10-13",
    to: "2026-10-20",
    granularity: "DAY",
  });
  assert.match(sql, /SELECT date, kpi_name, actual_value/);
  assert.match(sql, /granularity = 'DAY'/);
  assert.match(sql, />= '20261013'/);
  assert.match(sql, /<= '20261020'/);
  assert.match(sql, /category = 'Uniformity Testing'/);
  assert.match(sql, /section = 'Final Finish'/);
  assert.match(sql, /ORDER BY date ASC$/);
});

test("Product history only accepts card KPIs, not drill rows", () => {
  assert.equal(isProductCardKpi("Mtms_Uniformity_Yield"), true);
  assert.equal(isProductCardKpi("Mtms_Uniformity_Yield_m"), false);
  assert.equal(isProductCardKpi("Paint_Wt_Spec_Kg_sku"), false);
});

test("Product history groups rows per KPI and keeps empty series", () => {
  const { series } = toProductHistory(
    [
      { date: "2026-10-12", kpi_name: "Tuo_Uniformity_Yield", actual_value: 98.29 },
      { date: "2026-10-11", kpi_name: "Tuo_Uniformity_Yield", actual_value: 97.92 },
      { date: "2026-10-11", kpi_name: "Tuo_Uniformity_Yield", actual_value: 97.95 },
      { date: "2026-10-11", kpi_name: "Unrequested_Kpi", actual_value: "1" },
      { date: "2026-10-12", kpi_name: "Tuo_Uniformity_Yield", actual_value: null },
    ],
    ["Tuo_Uniformity_Yield", "Zf_Uniformity_Yield"],
  );
  assert.deepEqual(series, {
    Tuo_Uniformity_Yield: [
      { date: "2026-10-11", value: 97.95 },
      { date: "2026-10-12", value: null },
    ],
    Zf_Uniformity_Yield: [],
  });
});

test("Uniformity trend reads plant or machine rows over a granularity list", async () => {
  const { uniformityTrendQuery, isUniformityTrendKpi } = await import(
    "./queries/product.queries.js"
  );
  const plant = uniformityTrendQuery({
    kpiNames: ["Zf_Uniformity_Yield"],
    rowScope: "plant",
    granularities: ["SHIFT A", "SHIFT B", "SHIFT C"],
    from: "2026-10-12",
    to: "2026-10-22",
  });
  assert.match(plant, /category = 'Uniformity Testing'/);
  assert.match(plant, /\(machine IS NULL OR/);
  assert.match(plant, /granularity IN \('SHIFT A', 'SHIFT B', 'SHIFT C'\)/);
  const machine = uniformityTrendQuery({
    kpiNames: ["Zf_Uniformity_Yield_m", "Zf_Uniformity_Production"],
    rowScope: "machine",
    granularities: ["MONTH"],
    from: "2026-10-01",
    to: "2026-10-01",
  });
  assert.match(machine, /NOT \(machine IS NULL OR/);
  assert.ok(isUniformityTrendKpi("Zf_Uniformity_Yield_m"));
  assert.ok(!isUniformityTrendKpi("Paint_Wt_Within3_Pct_overall"));
});
