import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupPaintWeightRows,
  paintWeightValue,
  toGtWeightCard,
} from "./paintWeight.js";

test("groupPaintWeightRows splits overall values from sorted SKU rows", () => {
  const { overall, tableRows } = groupPaintWeightRows([
    { kpi_name: "Paint_Wt_Within3_Pct_overall", actual_value: 97.5 },
    { kpi_name: "Paint_Wt_Tyre_Qty_sku", actual_value: 120, itemcode: "SKU-B" },
    { kpi_name: "Paint_Wt_Tyre_Qty_sku", actual_value: 80, itemcode: "SKU-A" },
    {
      kpi_name: "Paint_Wt_Within1_Pct_sku",
      actual_value: 91.234,
      itemcode: "SKU-A",
    },
  ]);
  assert.equal(overall.get("Paint_Wt_Within3_Pct_overall"), 97.5);
  assert.deepEqual(
    tableRows.map((row) => row[0]),
    ["SKU-A", "SKU-B"],
  );
  assert.equal(tableRows[0][1], "80");
  assert.equal(tableRows[0][5], "91.23%");
  assert.equal(tableRows[1][5], "—");
});

test("groupPaintWeightRows drops SKU-level rows without an itemcode", () => {
  const { overall, tableRows } = groupPaintWeightRows([
    { kpi_name: "Paint_Wt_Tyre_Qty_sku", actual_value: 10 },
  ]);
  assert.equal(overall.size, 0);
  assert.deepEqual(tableRows, []);
});

test("paintWeightValue renders blanks and non-numbers as a dash", () => {
  assert.equal(paintWeightValue(null), "—");
  assert.equal(paintWeightValue("  "), "—");
  assert.equal(paintWeightValue("abc"), "—");
  assert.equal(paintWeightValue(98.456, 2, true), "98.46%");
});

const GTW = { id: "gtw", name: "GT Weight Variation" };

test("toGtWeightCard builds a drillable % card from the gold value", () => {
  const card = toGtWeightCard({ actual_value: "96.4", unit: "" }, GTW);
  assert.equal(card.value, 96.4);
  assert.equal(card.unit, "%");
  assert.equal(card.note, "Paint Weight Within 3%");
  assert.equal(card.drillType, "paintWeight");
  assert.equal(card.drillable, true);
});

test("toGtWeightCard returns null when gold has no usable value", () => {
  assert.equal(toGtWeightCard(undefined, GTW), null);
  assert.equal(toGtWeightCard({ actual_value: null }, GTW), null);
  assert.equal(toGtWeightCard({ actual_value: "n/a" }, GTW), null);
});
