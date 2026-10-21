import assert from "node:assert/strict";
import test from "node:test";

import { resolveGranularity } from "./normalize.js";
import {
  PRODUCT_CARD_KPIS,
  isAllowedProductDrillKpi,
  productChildrenQuery,
  productScopePredicate,
  productSummaryQuery,
} from "./queries/product.queries.js";
import {
  toProductChildren,
  toProductSummary,
} from "./transformers/product.transformers.js";

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
