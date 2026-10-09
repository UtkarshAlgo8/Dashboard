import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTechnicalKpi,
  toDowntimeReasonKpis,
  toMachineProductionKpi,
} from "./technicalKpiSources.js";
import { toKpiGrid } from "./kpi-transformer.js";

const kpisByCategory = {
  p: [{ id: "prod", name: "Production", value: "1,200" }],
  q: [
    { id: "scrap", name: "Scrap", value: "216" },
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

test("builds Breakdown and Setup & Change averaged over the downtime fleet", () => {
  const cards = toDowntimeReasonKpis(downtimeRows, monthOpts);
  assert.deepEqual(
    cards.map((k) => [k.id, k.value, k.unit]),
    [
      ["bdown", 30, "min"],
      ["bcs", 15, "min"],
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
