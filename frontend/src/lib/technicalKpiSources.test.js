import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildingAttributedRows,
  resolveTechnicalKpi,
  toBuildingAttributedKpis,
  toDowntimeReasonKpis,
  toMachineProductionKpi,
  toBuildingTrendKpi,
  toTrendKpi,
} from "./technicalKpiSources.js";
import { toKpiGrid } from "./kpi-transformer.js";

const kpisByCategory = {
  p: [{ id: "prod", name: "Production", value: "1,200" }],
  q: [
    { id: "scrap", name: "Scrap", value: "216" },
    { id: "rw", name: "Rework", value: "34" },
    { id: "ncm", name: "NCM Hold", value: "12" },
  ],
};

test("maps Held / NCR to Production NCM Hold under the Technical label", () => {
  const card = resolveTechnicalKpi(
    { id: "ncr", name: "Held / NCR Material" },
    kpisByCategory,
  );
  assert.deepEqual(card, {
    id: "ncr",
    name: "Held / NCR Material",
    value: "12",
  });
});

test("maps Curing Cured Tyre Scrap and Production to their sources", () => {
  assert.equal(
    resolveTechnicalKpi(
      { id: "ctscrap", name: "Cured Tyre Scrap" },
      kpisByCategory,
    )?.value,
    "216",
  );
  assert.equal(
    resolveTechnicalKpi({ id: "prod", name: "Production" }, kpisByCategory)
      ?.value,
    "1,200",
  );
});

test("maps Rework to Production Rework under the Technical id", () => {
  assert.deepEqual(
    resolveTechnicalKpi({ id: "rwk", name: "Rework" }, kpisByCategory),
    { id: "rwk", name: "Rework", value: "34" },
  );
  assert.equal(
    resolveTechnicalKpi(
      { id: "rwk", name: "Rework" },
      { q: [{ id: "scrap", value: "216" }] },
    ),
    null,
  );
});

test("returns null for a Technical KPI with no Production source", () => {
  assert.equal(
    resolveTechnicalKpi(
      { id: "bctscrap", name: "Cured Tyre Scrap" },
      kpisByCategory,
    ),
    null,
  );
  assert.equal(
    resolveTechnicalKpi({ id: "rej", name: "Rejection" }, kpisByCategory),
    null,
  );
});

test("returns null when the source category has not loaded or lacks the card", () => {
  assert.equal(
    resolveTechnicalKpi({ id: "scrap", name: "Scrap" }, { p: [] }),
    null,
  );
  assert.equal(
    resolveTechnicalKpi(
      { id: "ncr", name: "Held / NCR Material" },
      {
        q: [{ id: "scrap" }],
      },
    ),
    null,
  );
  assert.equal(
    resolveTechnicalKpi({ id: "prod", name: "Production" }, null),
    null,
  );
});

const reasonRow = (kpi_name, machine, actual_value, section = "Curing") => ({
  kpi_name,
  machine,
  actual_value,
  section,
  date: "2026-09-10",
  granularity: "DAY",
  unit_of_measurement: "min",
});
const downtimeRows = [
  reasonRow("Breakdown", "P1", 60),
  reasonRow("Setup & Change", "P2", 30),
  reasonRow("No Schedule", "P3", 100),
  reasonRow("Breakdown", "X9", 500, "TBM"),
];
const monthOpts = {
  section: "Curing",
  granularity: "MONTH",
  mode: "snapshot",
  plantId: "banmore",
};

test("builds Breakdown and Setup & Change as reason totals, not per-machine averages", () => {
  const cards = toDowntimeReasonKpis(downtimeRows, monthOpts);
  assert.deepEqual(
    cards.map((k) => [k.id, k.value, k.unit]),
    [
      ["bdown", 60, "min"],
      ["bcs", 30, "min"],
    ],
  );
  const total = toKpiGrid([], {
    ...monthOpts,
    category: "P",
    downtimeRows,
  }).find((k) => k.id === "downtime");
  assert.equal(total.value, 45);
});

test("returns no downtime cards when the reason rows are absent", () => {
  assert.deepEqual(toDowntimeReasonKpis(null, monthOpts), []);
  assert.deepEqual(toDowntimeReasonKpis([], monthOpts), []);
});

test("a section with no reason rows yields no cards (page shows NA)", () => {
  assert.deepEqual(
    toDowntimeReasonKpis(downtimeRows, { ...monthOpts, section: "Stock" }),
    [],
  );
});

const machineRow = (product_type, actual_value, extra = {}) => ({
  kpi_name: "Production_m",
  section: "TBM",
  machine: "VMI1MAXX",
  product_type,
  actual_value,
  unit_of_measurement: "NOS",
  granularity: "MONTH",
  date: "2026-09-01",
  ...extra,
});
const machineOpts = {
  granularity: "MONTH",
  mode: "snapshot",
  plantId: "banmore",
};

test("machine Production card reads the Green Tyre aggregate, not a sum", () => {
  const card = toMachineProductionKpi(
    [
      machineRow("Green Tyre", 26551),
      machineRow("Passenger Radial", 26550),
      machineRow("Unknown", 1),
    ],
    machineOpts,
  );
  assert.equal(card.id, "prod");
  assert.equal(card.value, 26551);
  assert.equal(card.unit, "NOS");
  assert.equal(card.drillable, true);
});

test("machine Production card is null when the machine has no rows", () => {
  assert.equal(toMachineProductionKpi([], machineOpts), null);
  assert.equal(toMachineProductionKpi(null, machineOpts), null);
});

test("machine Production card ignores rows at another granularity", () => {
  const card = toMachineProductionKpi(
    [machineRow("Green Tyre", 900, { granularity: "DAY" })],
    machineOpts,
  );
  assert.equal(card?.value ?? "—", "—");
});

const disciplineRow = (kpi_name, sub_section, actual_value, date) => ({
  kpi_name,
  sub_section,
  actual_value,
  date,
  section: "Curing",
  category: "Quality",
  granularity: "MONTH",
  unit_of_measurement: "NOS",
  product_type: "Cured Tyre",
  tyre_type: "PCR",
  drill_down_level: "3.0",
});

test("builds Building Cured Tyre Scrap and Rework from Curing BUILDING rows", () => {
  const cards = toBuildingAttributedKpis(
    [
      disciplineRow("Scrap_s", "BUILDING", 3145, "2026-10-01"),
      disciplineRow("Scrap_s", "CURING", 2000, "2026-10-01"),
      disciplineRow("Rework_s", "BUILDING", 14784, "2026-10-01"),
      disciplineRow("Rework_s", "ENGINEERING", 300, "2026-10-01"),
    ],
    { granularity: "MONTH", mode: "snapshot", plantId: "banmore" },
  );
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
  assert.equal(byId.bctscrap.value, 3145);
  assert.equal(byId.rwk.value, 14784);
  assert.equal(byId.bctscrap.drillable, true);
});

test("returns no Building cards when Curing has no BUILDING rows", () => {
  assert.deepEqual(
    toBuildingAttributedKpis(
      [disciplineRow("Scrap_s", "CURING", 2000, "2026-10-01")],
      { granularity: "MONTH", mode: "snapshot", plantId: "banmore" },
    ),
    [],
  );
  assert.deepEqual(
    toBuildingAttributedKpis(null, {
      granularity: "MONTH",
      mode: "snapshot",
      plantId: "banmore",
    }),
    [],
  );
});

test("buildingAttributedRows matches the discipline case-insensitively", () => {
  const rows = buildingAttributedRows([
    disciplineRow("Scrap_m", " building ", 5, "2026-10-01"),
    disciplineRow("Scrap_m", "CURING", 7, "2026-10-01"),
    disciplineRow("Scrap_m", "", 9, "2026-10-01"),
  ]);
  assert.deepEqual(
    rows.map((row) => row.actual_value),
    [5],
  );
});

test("reason card total sums every machine's minutes on that reason", () => {
  const rows = [
    reasonRow("Setup & Change", "0201", 40, "Mixing"),
    reasonRow("Setup & Change", "0202", 35, "Mixing"),
    reasonRow("Breakdown", "0203", 10, "Mixing"),
  ];
  const bcs = toDowntimeReasonKpis(rows, {
    ...monthOpts,
    section: "Mixing",
  }).find((k) => k.id === "bcs");
  assert.equal(bcs.value, 75);
  assert.equal(bcs.topMachine?.machine, "0201");
});

test("toTrendKpi maps Technical cards to the Production trend ids", () => {
  assert.equal(toTrendKpi({ id: "prod", value: 1 }).id, "prod");
  assert.equal(toTrendKpi({ id: "ncr" }).id, "ncm");
  assert.equal(toTrendKpi({ id: "bdown" }).id, "downtime");
  assert.equal(toTrendKpi({ id: "bcs" }).id, "downtime");
  assert.equal(toTrendKpi({ id: "prod", value: 7 }).value, 7);
});

test("toTrendKpi returns null for a card with no Production source", () => {
  assert.equal(toTrendKpi({ id: "ovg" }), null);
  assert.equal(toTrendKpi(null), null);
});

test("toBuildingTrendKpi trends the Building card's Curing discipline series", () => {
  assert.equal(toBuildingTrendKpi({ id: "bctscrap" }).rawName, "Scrap_s");
  assert.equal(toBuildingTrendKpi({ id: "rwk" }).rawName, "Rework_s");
  assert.equal(toBuildingTrendKpi({ id: "rwk", value: 9 }).value, 9);
});

test("toBuildingTrendKpi returns null for a card that is not Building-attributed", () => {
  assert.equal(toBuildingTrendKpi({ id: "prod" }), null);
  assert.equal(toBuildingTrendKpi(null), null);
});
