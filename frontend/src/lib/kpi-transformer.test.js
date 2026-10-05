import { test } from "node:test";
import assert from "node:assert/strict";
import { toKpiGrid } from "./kpi-transformer.js";

// CTP Curing PCR after the gold reload: Production_product carries only the
// "Others" trench, while Production_sku still carries every trench.
// Values are the gold rows for 2026-09-27/28.
const row = (
  kpi_name,
  date,
  sub_section,
  itemcode,
  actual_value,
  extra = {},
) => ({
  date,
  section: "Curing",
  sub_section,
  machine: "",
  product_type: "Cured Tyre",
  itemcode,
  granularity: "DAY",
  category: "Productivity",
  kpi_name,
  unit_of_measurement: "NOS",
  actual_value,
  ...extra,
});
const productRow = (date, value) =>
  row("Production_product", date, "Others", "", value);
const skuRow = (date, sub, item, value) =>
  row("Production_sku", date, sub, item, value);

const day28 = [
  productRow("2026-09-28", 11738),
  skuRow("2026-09-28", "Others", "SKU1", 11000),
  skuRow("2026-09-28", "Others", "SKU2", 738),
  skuRow("2026-09-28", "Trench1", "SKU3", 1200),
  skuRow("2026-09-28", "Trench2", "SKU4", 388),
];
const day27 = [
  productRow("2026-09-27", 11577),
  skuRow("2026-09-27", "Others", "SKU1", 11577),
  skuRow("2026-09-27", "Trench1", "SKU3", 1536),
];

const ctpOpts = {
  section: "Curing",
  category: "P",
  granularity: "DAY",
  mode: "snapshot",
  plantId: "chennai",
  tyreType: "PCR",
};

const productionCard = (rows, opts = ctpOpts) =>
  toKpiGrid(rows, opts).find((k) => k.id === "prod");

test("Curing PCR Production shows the all-trench SKU total", () => {
  assert.equal(productionCard(day28).value, 13326);
});

test("sparkline and day-on-day trend use the daily SKU totals", () => {
  const card = productionCard([...day28, ...day27]);
  assert.equal(card.value, 13326);
  assert.deepEqual(card.spark, [13113, 13326]);
  assert.ok(card.trend > 1 && card.trend < 2); // (13326 - 13113) / 13113
});

test("an open drill's duplicate SKU rows are not counted twice", () => {
  const drillCopy = day28.filter((r) => r.kpi_name === "Production_sku");
  assert.equal(productionCard([...day28, ...drillCopy]).value, 13326);
});

test("falls back to Production_product when no SKU rows arrived", () => {
  assert.equal(productionCard([productRow("2026-09-28", 11738)]).value, 11738);
});

test("Curing monthly Production_product sums trench-split rows for line filters", () => {
  const septemberRows = [
    row("Production_product", "2026-09-01", "Others", "", 354634, {
      granularity: "MONTH",
    }),
    row("Production_product", "2026-09-01", "Trench1", "", 31369, {
      granularity: "MONTH",
    }),
    row("Production_product", "2026-09-01", "Trench3", "", 32398, {
      granularity: "MONTH",
    }),
    row("Production_product", "2026-09-01", "Trench2", "", 35398, {
      granularity: "MONTH",
    }),
  ];

  assert.equal(
    productionCard(septemberRows.slice(0, 1), {
      ...ctpOpts,
      granularity: "MONTH",
      tyreType: "PCR",
    }).value,
    354634,
  );
  assert.equal(
    productionCard(septemberRows.slice(1), {
      ...ctpOpts,
      granularity: "MONTH",
      tyreType: "TBR",
    }).value,
    99165,
  );
  assert.equal(
    productionCard(septemberRows, {
      ...ctpOpts,
      granularity: "MONTH",
      tyreType: null,
    }).value,
    453799,
  );
});

test("CTP TBM Green Tyre all-line view keeps PCR and TBR rows distinct", () => {
  const tbmRow = (tyre_type, actual_value) => ({
    date: "2026-07-16",
    section: "TBM",
    sub_section: "",
    tyre_type,
    machine: "",
    product_type: "Green Tyre",
    itemcode: "",
    granularity: "DAY",
    category: "Productivity",
    kpi_name: "Production_product",
    unit_of_measurement: "NOS",
    actual_value,
  });
  const rows = [tbmRow("PCR", 11906), tbmRow("TBR", 3405)];

  const allCard = toKpiGrid(rows, {
    section: "TBM",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    plantId: "chennai",
    tyreType: null,
  }).find((k) => k.id === "prod");
  const pcrCard = toKpiGrid(rows.filter((r) => r.tyre_type === "PCR"), {
    section: "TBM",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    plantId: "chennai",
    tyreType: "PCR",
  }).find((k) => k.id === "prod");
  const tbrCard = toKpiGrid(rows.filter((r) => r.tyre_type === "TBR"), {
    section: "TBM",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    plantId: "chennai",
    tyreType: "TBR",
  }).find((k) => k.id === "prod");

  assert.equal(allCard.value, 15311);
  assert.equal(pcrCard.value, 11906);
  assert.equal(tbrCard.value, 3405);
});

test("other lines and sections keep reading Production_product", () => {
  assert.equal(
    productionCard(day28, { ...ctpOpts, tyreType: "TBR" }).value,
    11738,
  );
  assert.equal(
    productionCard(day28, { ...ctpOpts, tyreType: null }).value,
    11738,
  );
  const tbm = day28.map((r) => ({
    ...r,
    section: "TBM",
    product_type: "Green Tyre",
  }));
  const tbmCard = toKpiGrid(tbm, { ...ctpOpts, section: "TBM" }).find(
    (k) => k.id === "prod",
  );
  assert.equal(tbmCard.value, 11738);
});

test("ignores non-numeric SKU values instead of blanking the total", () => {
  const rows = [
    skuRow("2026-09-28", "Others", "SKU1", 11738),
    skuRow("2026-09-28", "Trench1", "SKU3", null),
    skuRow("2026-09-28", "Trench2", "SKU4", "nan"),
  ];
  assert.equal(productionCard(rows).value, 11738);
});
