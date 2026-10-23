import { test } from "node:test";
import assert from "node:assert/strict";
import { toKpiGrid } from "./kpi-transformer.js";

const monthRow = (date) => ({
  date,
  section: "Mixing",
  sub_section: "",
  machine: "",
  product_type: "",
  itemcode: "",
  granularity: "MONTH",
  category: "Productivity",
  kpi_name: "Production",
  unit_of_measurement: "NOS",
  actual_value: 500,
});

const grid = (rows, anchors) =>
  toKpiGrid(rows, {
    section: "Mixing",
    category: "P",
    granularity: "MONTH",
    mode: "snapshot",
    anchors,
  }).find((k) => k.rawName === "Production");

test("MONTH card shows the newest day of its month as the as-of date", () => {
  const card = grid([monthRow("2026-10-01")], {
    "Mixing|Production": "2026-10-22",
  });
  assert.equal(card.asOfDate, "2026-10-22");
});

test("MONTH card of a past month shows no as-of date", () => {
  const card = grid([monthRow("2026-08-01")], {
    "Mixing|Production": "2026-10-22",
  });
  assert.equal(card.asOfDate, null);
});

test("MONTH card without an anchor shows no as-of date", () => {
  assert.equal(grid([monthRow("2026-10-01")], null).asOfDate, null);
});
