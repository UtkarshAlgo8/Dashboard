import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateByItem,
  buildCtpInventoryModel,
  computeInsightCard,
  emptyCtpFilter,
  sectionHasNoStock,
  selectCtpLots,
  sumCtpMheCounts,
  sumCtpUnassignedMheCounts,
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

function model(sections, mhe_unassigned_rows = []) {
  return buildCtpInventoryModel({
    status_master: STATUSES,
    sections,
    mhe_unassigned_rows,
  });
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

test("MHE_Count uses Gold item counts, honors non-status filters, and ignores status filters", () => {
  const m = model([
    {
      name: "Stock",
      product_types: [
        {
          name: "PCR Belt",
          items: [
            {
              ...item("PCR-1", "PCR", [lot("READY", 10), lot("HOLD", 4)]),
              mhe_count: 3,
            },
            { ...item("PCR-2", "PCR", [lot("READY", 5)]), mhe_count: 2 },
          ],
        },
        {
          name: "TBR Belt",
          items: [{ ...item("TBR-1", "TBR", [lot("HOLD", 3)]), mhe_count: 4 }],
        },
      ],
    },
  ]);
  const f = {
    ...emptyCtpFilter("PCR"),
    st: ["HOLD"],
    sec: "Stock",
    pt: { Stock: ["PCR Belt"] },
  };

  assert.equal(sumCtpMheCounts(m, f), 5);
  const rows = aggregateByItem(m, selectCtpLots(m, f), f);
  assert.deepEqual(
    rows.map(({ item, mhe }) => [item, mhe]),
    [["PCR-1", 3]],
  );
  const statusCard = computeInsightCard(m, f, selectCtpLots(m, f), {
    type: "status_qty",
    status: "HOLD",
  });
  assert.equal(statusCard.sub, "1 lot");
});

test("unassigned MHE counts contribute to the headline only within their known filter scope", () => {
  const m = model(
    [],
    [
      {
        section: "Stock",
        product_type: null,
        itemcode: null,
        tyre_type: "PCR",
        mhe_count: 3,
      },
      {
        section: "Stock",
        product_type: "PCR Belt",
        itemcode: null,
        tyre_type: "PCR",
        mhe_count: 2,
      },
      {
        section: "Stock",
        product_type: "TBR Belt",
        itemcode: null,
        tyre_type: "TBR",
        mhe_count: 5,
      },
      {
        section: null,
        product_type: null,
        itemcode: null,
        tyre_type: "PCR",
        mhe_count: 7,
      },
    ],
  );
  const f = { ...emptyCtpFilter("PCR"), st: ["HOLD"], sec: "Stock" };

  assert.equal(sumCtpUnassignedMheCounts(m, f), 5);
  assert.equal(sumCtpMheCounts(m, f), 5);
  assert.equal(sumCtpMheCounts(m, { ...f, pt: { Stock: ["PCR Belt"] } }), 2);
  assert.equal(sumCtpMheCounts(m, { ...f, item: { Stock: ["PCR-1"] } }), 0);
});

test("MHE_Count falls back to distinct fixture lot codes when Gold count is absent", () => {
  const m = model([
    {
      name: "Stock",
      product_types: [
        {
          name: "PCR Belt",
          items: [
            {
              ...item("PCR-1", "PCR", [
                { ...lot("READY", 10), mhe_code: "MHE-1" },
                { ...lot("HOLD", 4), mhe_code: "MHE-1" },
                { ...lot("READY", 5), mhe_code: "MHE-2" },
              ]),
            },
          ],
        },
      ],
    },
  ]);
  assert.equal(sumCtpMheCounts(m, emptyCtpFilter()), 2);
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
  const rows = zeroStockItemRows(m, {
    ...emptyCtpFilter(),
    sec: "Tyre Building",
  });
  assert.equal(rows.length, 1);
});
