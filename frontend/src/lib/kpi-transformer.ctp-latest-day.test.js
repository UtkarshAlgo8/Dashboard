import { test } from "node:test";
import assert from "node:assert/strict";
import { toKpiGrid } from "./kpi-transformer.js";

// CTP: OEE / Downtime / Scrap / Rework / NCM land behind Production, so under
// the Today preset they read their own newest day instead of "—".
const row = (over) => ({
  date: "2026-10-06",
  section: "Curing",
  sub_section: "",
  tyre_type: "",
  machine: "",
  product_type: "",
  itemcode: "",
  granularity: "DAY",
  category: "Productivity",
  kpi_name: "OEE_o",
  unit_of_measurement: "%",
  drill_down_level: "1",
  actual_value: "52.86",
  ...over,
});

const card = (rows, rawName, extra = {}) =>
  toKpiGrid(rows, {
    section: "Curing",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    headlineDate: "2026-10-07",
    ...extra,
  }).find((k) => k.rawName === rawName);

test("CTP OEE card shows its newest day when today has no row yet", () => {
  const oee = card([row()], "OEE_o", { plantId: "chennai" });
  assert.equal(oee.value, 52.86);
  assert.equal(oee.resolvedDate, "2026-10-06");
  assert.equal(oee.asOfDate, "2026-10-06");
});

test("Banmore keeps the dash for a pinned day with no row", () => {
  const oee = card([row()], "OEE_o", { plantId: "banmore" });
  assert.equal(oee.value, "—");
});

test("CTP Production still shows a dash for a missing day", () => {
  const rows = [
    row({
      kpi_name: "Production_product",
      product_type: "Cured Tyre",
      unit_of_measurement: "NOS",
      drill_down_level: "3",
      actual_value: "16898",
    }),
  ];
  const grid = toKpiGrid(rows, {
    section: "Curing",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    headlineDate: "2026-10-07",
    plantId: "chennai",
  });
  // The "—" placeholder carries the card's own name, not the series it read.
  const prod = grid.find((k) => k.rawName === "Production");
  assert.equal(prod.value, "—");
});

test("CTP Carcass under All sums both tyre lines", () => {
  const carcass = (tyre_type, actual_value) =>
    row({
      section: "TBM",
      sub_section: "Carcass",
      tyre_type,
      kpi_name: "Production",
      product_type: "Carcass",
      unit_of_measurement: "NOS",
      actual_value,
    });
  const prod = toKpiGrid([carcass("PCR", "13648"), carcass("TBR", "3397")], {
    section: "TBM",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    productType: "Carcass",
    plantId: "chennai",
  }).find((k) => k.rawName === "Production");
  assert.equal(prod.value, 17045);
});

test("CTP Scrap sums the day's rows across lines and departments", () => {
  const scrap = (tyre_type, status, actual_value) =>
    row({
      date: "2026-10-07",
      tyre_type,
      status,
      category: "Quality",
      kpi_name: "Scrap",
      product_type: "Cured Tyre",
      unit_of_measurement: "NOS",
      actual_value,
    });
  const rows = [
    scrap("PCR", "Unknown", "38"),
    scrap("TBR", "DEVELOPMENT", "2"),
    scrap("TBR", "ENGINEERING", "2"),
    scrap("TBR", "CURING", "3"),
    scrap("TBR", "BUILDING", "6"),
  ];
  const opts = {
    section: "Curing",
    category: "Q",
    granularity: "DAY",
    mode: "snapshot",
  };
  const pick = (plantId) =>
    toKpiGrid(rows, { ...opts, plantId }).find((k) => k.rawName === "Scrap");
  assert.equal(pick("chennai").value, 51);
  // Banmore is untouched: it still reads one row, never the sum.
  assert.notEqual(pick("banmore").value, 51);
});

test("CTP TBM Green Tyre reads Production, not the drifting product level", () => {
  // Gold 2026-10-06: Production PCR 13,678 / TBR 3,397; Production_product
  // carries 13,679 / 3,387 for the same day.
  const tbm = (kpi_name, tyre_type, actual_value) =>
    row({
      section: "TBM",
      sub_section: "Green Tyre",
      tyre_type,
      kpi_name,
      product_type: "Green Tyre",
      unit_of_measurement: "NOS",
      actual_value,
    });
  const rows = [
    tbm("Production", "PCR", "13678"),
    tbm("Production", "TBR", "3397"),
    tbm("Production_product", "PCR", "13679"),
    tbm("Production_product", "TBR", "3387"),
  ];
  const prod = toKpiGrid(rows, {
    section: "TBM",
    category: "P",
    granularity: "DAY",
    mode: "snapshot",
    productType: "Green Tyre",
    plantId: "chennai",
  }).find((k) => k.id === "prod");
  assert.equal(prod.value, 17075);
});
