import assert from "node:assert/strict";
import test from "node:test";
import { withLossCategoryPct } from "../src/engineering/transformers/reliability.transformers.js";

const KPI = "LostTime_Pct_LossCategory";
const tree = {
  group_by: "product_type",
  rows: [
    { product_type: "Other Losses", LostTime_LossCategory: 425262 },
    { product_type: "Engineering Breakdown", LostTime_LossCategory: 127000 },
  ],
};

test("attaches the stored % to each category as read", () => {
  const out = withLossCategoryPct(
    tree,
    [
      { kpi_name: KPI, product_type: "Other Losses", actual_value: "3.57" },
      {
        kpi_name: KPI,
        product_type: "Engineering Breakdown",
        actual_value: "1.07",
      },
    ],
    KPI,
  );
  assert.deepEqual(
    out.rows.map((r) => r[KPI]),
    [3.57, 1.07],
  );
  assert.equal(out.rows[0].LostTime_LossCategory, 425262);
});

test("a category without a stored row gets null, never 0", () => {
  const out = withLossCategoryPct(
    tree,
    [{ kpi_name: KPI, product_type: "Other Losses", actual_value: "3.57" }],
    KPI,
  );
  assert.equal(out.rows[1][KPI], null);
});

test("no pct rows (custom range) leaves every category null", () => {
  const out = withLossCategoryPct(tree, [], KPI);
  assert.ok(out.rows.every((r) => r[KPI] === null));
  assert.equal(out.group_by, "product_type");
});
