import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaComponents,
  areaTotals,
  componentSkus,
  toOverageCard,
} from "./overage.js";

const DEFINITION = { id: "ovg", name: "Overage Material" };
const CUTTER = { section: "Stock", subSection: "Cutter" };

const TOTALS = [
  {
    level: "section",
    section: "Stock",
    sub_section: null,
    product_type: null,
    unit: "M",
    overage_qty: 7240000,
    oldest_lot_date: "2026-09-01",
    production_days: 30,
  },
  {
    level: "sub_section",
    section: "Stock",
    sub_section: "Cutter",
    product_type: null,
    unit: "M",
    overage_qty: 20125,
    oldest_lot_date: "2026-09-30",
    production_days: 3,
  },
  {
    level: "sub_section",
    section: "Stock",
    sub_section: "Cutter",
    product_type: null,
    unit: "NOS",
    overage_qty: 3910,
    oldest_lot_date: "2026-09-25",
    production_days: 1,
  },
  {
    level: "component",
    section: "Stock",
    sub_section: "Cutter",
    product_type: "Ply",
    unit: "NOS",
    overage_qty: 3910,
    oldest_lot_date: "2026-09-25",
    production_days: 1,
  },
  {
    level: "component",
    section: "Stock",
    sub_section: "Cutter",
    product_type: "Belt",
    unit: "M",
    overage_qty: 20125,
    oldest_lot_date: "2026-09-30",
    production_days: 3,
  },
  {
    level: "section",
    section: "Mixing",
    sub_section: null,
    product_type: null,
    unit: "KG",
    overage_qty: 3700,
    oldest_lot_date: "2026-10-03",
    production_days: 2,
  },
];

test("areaTotals reads sub-section rows for a chip, section rows for Mixing", () => {
  assert.deepEqual(
    areaTotals(TOTALS, CUTTER).map((r) => r.unit),
    ["M", "NOS"],
  );
  const mixing = areaTotals(TOTALS, { section: "Mixing", subSection: null });
  assert.equal(mixing.length, 1);
  assert.equal(mixing[0].overage_qty, 3700);
});

test("toOverageCard keeps units apart: headline + other units in the note", () => {
  const card = toOverageCard(areaTotals(TOTALS, CUTTER), DEFINITION);
  assert.equal(card.value, 20125);
  assert.equal(card.unit, "M");
  assert.equal(card.note, "+ 3,910 NOS · oldest 25-09-2026");
  assert.equal(card.hideTrend, true);
  assert.equal(card.status, undefined);
});

test("toOverageCard shows KG stock in tonnes", () => {
  const card = toOverageCard(
    areaTotals(TOTALS, { section: "Mixing", subSection: null }),
    DEFINITION,
  );
  assert.equal(card.value, 3.7);
  assert.equal(card.unit, "MT");
  assert.equal(card.note, "Oldest lot 03-10-2026");
});

test("toOverageCard rounds metres to whole numbers", () => {
  const card = toOverageCard(
    [{ unit: "M", overage_qty: 151297212.27, oldest_lot_date: null }],
    DEFINITION,
  );
  assert.equal(card.value, 151297212);
  assert.equal(card.note, "");
});

test("toOverageCard counts units beyond the second instead of listing them", () => {
  const rows = ["M", "NOS", "KG"].map((unit, i) => ({
    unit,
    overage_qty: 300 - i * 100,
    oldest_lot_date: "2026-09-0" + (i + 1),
  }));
  assert.equal(
    toOverageCard(rows, DEFINITION).note,
    "+ 2 more units · oldest 01-09-2026",
  );
});

test("toOverageCard with no rows reads zero, not unavailable", () => {
  const card = toOverageCard([], DEFINITION);
  assert.equal(card.value, 0);
  assert.equal(card.note, "No overage stock");
});

test("areaComponents and componentSkus sort largest first and match unit", () => {
  assert.deepEqual(
    areaComponents(TOTALS, CUTTER).map((r) => r.product_type),
    ["Belt", "Ply"],
  );
  const skus = [
    {
      section: "Stock",
      sub_section: "Cutter",
      product_type: "Belt",
      unit: "M",
      itemcode: "B2",
      overage_qty: 5125,
    },
    {
      section: "Stock",
      sub_section: "Cutter",
      product_type: "Belt",
      unit: "M",
      itemcode: "B1",
      overage_qty: 15000,
    },
    {
      section: "Stock",
      sub_section: "Cutter",
      product_type: "Belt",
      unit: "NOS",
      itemcode: "B3",
      overage_qty: 9,
    },
  ];
  const belt = componentSkus(skus, CUTTER, { productType: "Belt", unit: "M" });
  assert.deepEqual(
    belt.map((r) => r.itemcode),
    ["B1", "B2"],
  );
});

test("helpers tolerate a missing payload", () => {
  assert.deepEqual(areaTotals(undefined, CUTTER), []);
  assert.deepEqual(areaComponents(null, CUTTER), []);
  assert.deepEqual(
    componentSkus(undefined, CUTTER, { productType: "Belt", unit: "M" }),
    [],
  );
});
