import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breakdownDiscipline,
  distinctValues,
  groupTotals,
  parseDowntimeRemark,
  rowsOf,
  toDowntimeEvents,
  totalOf,
  withNumericValues,
} from "./technicalDrills.js";

const row = (kpi_name, actual_value, extra = {}) => ({
  kpi_name,
  actual_value,
  section: "Curing",
  date: "2026-09-01",
  granularity: "MONTH",
  ...extra,
});

test("groups scrap by reason, largest first, with share and cumulative", () => {
  const rows = [
    row("Scrap_reason", 30, { remarks: "Bead Damage" }),
    row("Scrap_reason", 50, { remarks: "Tread Edge Open" }),
    row("Scrap_reason", 20, { remarks: "Bead Damage" }),
  ];
  assert.deepEqual(
    groupTotals(rows, (r) => r.remarks),
    [
      { key: "Bead Damage", value: 50, share: 50, cumulative: 50 },
      { key: "Tread Edge Open", value: 50, share: 50, cumulative: 100 },
    ],
  );
  assert.equal(totalOf(rows), 100);
});

test("blank keys group under Unspecified; empty input gives no groups", () => {
  const rows = [row("Scrap_m", 5, { machine: "nan" }), row("Scrap_m", 2)];
  assert.deepEqual(
    groupTotals(rows, (r) => r.machine).map((g) => [g.key, g.value]),
    [["Unspecified", 7]],
  );
  assert.deepEqual(
    groupTotals([], (r) => r.machine),
    [],
  );
});

test("rowsOf keeps one kpi in one section and drops non-numeric values", () => {
  const rows = [
    row("NCM_Hold_sku", 3),
    row("NCM_Hold_sku", null),
    row("NCM_Hold_sku", 4, { section: "Mixing" }),
    row("Scrap_m", 9),
  ];
  assert.deepEqual(
    rowsOf(rows, "NCM_Hold_sku", "Curing").map((r) => r.actual_value),
    [3],
  );
  assert.deepEqual(rowsOf(null, "NCM_Hold_sku", "Curing"), []);
});

test("distinctValues lists non-blank values once, sorted", () => {
  const rows = [
    row("Production_m", 1, { product_type: "LCV" }),
    row("Production_m", 1, { product_type: "Cured Tyre" }),
    row("Production_m", 1, { product_type: "LCV" }),
    row("Production_m", 1, { product_type: "" }),
  ];
  assert.deepEqual(distinctValues(rows, "product_type"), ["Cured Tyre", "LCV"]);
});

test("splits a downtime remark into category and detail", () => {
  assert.deepEqual(
    parseDowntimeRemark("Electronic / Control Breakdown - MAIN MOTOR"),
    { category: "Electronic / Control Breakdown", detail: "MAIN MOTOR" },
  );
  assert.deepEqual(parseDowntimeRemark("Power dip"), {
    category: "Power dip",
    detail: "Power dip",
  });
  assert.deepEqual(parseDowntimeRemark(null), {
    category: "Unspecified",
    detail: "Unspecified",
  });
  assert.equal(
    breakdownDiscipline("Electronic / Control Breakdown"),
    "Electronic / Control",
  );
  assert.equal(breakdownDiscipline("Breakdown"), "Breakdown");
});

test("builds one section's reason events at the fetched granularity", () => {
  const downtimeRows = [
    row("Breakdown", 40, {
      granularity: "DAY",
      date: "2026-09-28",
      machine: "14801",
      remarks: "Mechanical Breakdown - BLADDER LEAK",
    }),
    row("Breakdown", 15, {
      granularity: "DAY",
      date: "2026-09-27",
      machine: "14802",
      remarks: "Electrical Breakdown - HEATER",
    }),
    row("Breakdown", 99, { granularity: "SHIFT A", date: "2026-09-28" }),
    row("Breakdown", 99, { granularity: "DAY", section: "" }),
    row("Setup & Change", 30, { granularity: "DAY", date: "2026-09-28" }),
  ];
  const scope = { section: "Curing", reason: "Breakdown", granularity: "DAY" };
  assert.deepEqual(toDowntimeEvents(downtimeRows, scope), [
    {
      date: "2026-09-28",
      machine: "14801",
      category: "Mechanical Breakdown",
      detail: "BLADDER LEAK",
      minutes: 40,
    },
    {
      date: "2026-09-27",
      machine: "14802",
      category: "Electrical Breakdown",
      detail: "HEATER",
      minutes: 15,
    },
  ]);
  assert.deepEqual(
    toDowntimeEvents(downtimeRows, { ...scope, date: "2026-09-27" }).map(
      (e) => e.machine,
    ),
    ["14802"],
  );
  assert.deepEqual(toDowntimeEvents(null, scope), []);
});

test("withNumericValues turns Athena strings into numbers, blanks into null", () => {
  assert.deepEqual(
    withNumericValues([
      { actual_value: "12.5" },
      { actual_value: 3 },
      { actual_value: "" },
    ]).map((r) => r.actual_value),
    [12.5, 3, null],
  );
  assert.deepEqual(withNumericValues(null), []);
});

test("rowsOf counts a row that arrived from two fetches once", () => {
  const row = {
    kpi_name: "Production_m",
    section: "Stock",
    date: "2026-10-01",
    granularity: "MONTH",
    machine: "5601",
    product_type: "Tread",
    unit_of_measurement: "Meter",
    actual_value: 623901.15,
  };
  const other = { ...row, machine: "5602", actual_value: 10 };
  assert.deepEqual(
    rowsOf([row, { ...row }, other], "Production_m", "Stock").map(
      (r) => r.machine,
    ),
    ["5601", "5602"],
  );
});
