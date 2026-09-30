import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCtpInventoryModel,
  emptyCtpFilter,
  sectionHasNoStock,
  zeroStockItemRows,
} from "./ctpInventory.js";

const STATUSES = [
  { key: "READY", usable: true, blocked: false },
  { key: "HOLD", usable: false, blocked: true },
];

const item = (item_code, tyre_type, lots = [], daily_consumption = 0) => ({
  item_code,
  tyre_type,
  uom: "NOS",
  daily_consumption,
  lots,
});

const lot = (status, quantity) => ({ lot_id: `L-${status}`, status, quantity });

function model(sections) {
  return buildCtpInventoryModel({ status_master: STATUSES, sections });
}

const TYRE_BUILDING = {
  name: "Tyre Building",
  product_types: [
    {
      name: "Carcass",
      items: [item("C-2", "TBR"), item("C-1", "PCR", [], 12185)],
    },
  ],
};

const STOCK = {
  name: "Stock",
  product_types: [
    { name: "PCR Belt", items: [item("B-1", "PCR", [lot("READY", 30)])] },
  ],
};

test("sectionHasNoStock: true when a section has items but no stock", () => {
  const m = model([TYRE_BUILDING, STOCK]);
  assert.equal(sectionHasNoStock(m, "Tyre Building"), true);
});

test("sectionHasNoStock: false for a section with stock or with no items", () => {
  const m = model([TYRE_BUILDING, STOCK]);
  assert.equal(sectionHasNoStock(m, "Stock"), false);
  assert.equal(sectionHasNoStock(m, "Mixing"), false);
});

test("zeroStockItemRows: lists the section's items at zero for every status", () => {
  const m = model([TYRE_BUILDING, STOCK]);
  const rows = zeroStockItemRows(m, {
    ...emptyCtpFilter(),
    sec: "Tyre Building",
  });
  assert.deepEqual(
    rows.map((r) => [r.item, r.qty, r.st.READY, r.st.HOLD, r.lots]),
    [
      ["C-2", 0, 0, 0, 0],
      ["C-1", 0, 0, 0, 0],
    ],
  );
});

test("zeroStockItemRows: respects the tyre-type filter and ignores status", () => {
  const m = model([TYRE_BUILDING]);
  const rows = zeroStockItemRows(m, {
    ...emptyCtpFilter("PCR"),
    st: ["HOLD"],
    sec: "Tyre Building",
  });
  assert.deepEqual(
    rows.map((r) => r.item),
    ["C-1"],
  );
});

test("zeroStockItemRows: an item code on two tyre types appears once", () => {
  const m = model([
    {
      name: "Tyre Building",
      product_types: [
        { name: "Carcass", items: [item("C-1", "PCR"), item("C-1", "TBR")] },
      ],
    },
  ]);
  const rows = zeroStockItemRows(m, { ...emptyCtpFilter(), sec: "Tyre Building" });
  assert.equal(rows.length, 1);
});
