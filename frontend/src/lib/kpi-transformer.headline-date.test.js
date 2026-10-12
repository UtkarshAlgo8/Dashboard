import { test } from "node:test";
import assert from "node:assert/strict";
import { toKpiGrid } from "./kpi-transformer.js";

// Today preset: the headline is pinned to one calendar day. A window whose
// newest row is older must show "—", never the latest available day.
const row = (date, actual_value) => ({
  date,
  section: "Mixing",
  sub_section: "",
  machine: "",
  product_type: "",
  itemcode: "",
  granularity: "DAY",
  category: "Productivity",
  kpi_name: "Production",
  unit_of_measurement: "NOS",
  actual_value,
});

const opts = {
  section: "Mixing",
  category: "P",
  granularity: "DAY",
  mode: "snapshot",
};

const productionCard = (rows, extra = {}) =>
  toKpiGrid(rows, { ...opts, ...extra }).find(
    (k) => k.rawName === "Production",
  );

test("headline reads the pinned day when it has a row", () => {
  const rows = [row("2026-10-01", 500), row("2026-09-30", 400)];
  const card = productionCard(rows, { headlineDate: "2026-10-01" });
  assert.equal(card.value, 500);
  assert.equal(card.resolvedDate, "2026-10-01");
});

test("pinned day with no row shows a dash, not the previous day", () => {
  const rows = [row("2026-09-30", 400), row("2026-09-29", 300)];
  const card = productionCard(rows, { headlineDate: "2026-10-01" });
  assert.equal(card.value, "—");
  assert.equal(card.resolvedDate, null);
});

test("without a pinned day the newest row in the window is used", () => {
  const rows = [row("2026-09-30", 400), row("2026-09-29", 300)];
  assert.equal(productionCard(rows).value, 400);
});
