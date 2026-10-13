import test from "node:test";
import assert from "node:assert/strict";
import {
  ctpDowntimePayload,
  scopeCtpDowntimeReasonRows,
  sumCtpDowntimeReasons,
} from "./ctpDowntime.js";
import { toKpiGrid } from "./kpi-transformer.js";
import { toDowntimeReasonKpis } from "./technicalKpiSources.js";

const row = (value, extra = {}) => ({
  section: "Curing",
  date: "2026-10-06",
  granularity: "DAY",
  kpi_name: "Total_Downtime",
  unit_of_measurement: "min",
  actual_value: value,
  ...extra,
});
const opts = {
  plantId: "chennai",
  section: "Curing",
  category: "P",
  granularity: "DAY",
  mode: "snapshot",
};
const total = (rows, extra = {}, landing = []) =>
  toKpiGrid(landing, {
    ...opts,
    totalDowntimeRows: rows,
    ...extra,
  }).find((k) => k.id === "downtime");

test("CTP reason scope excludes unassigned dimensions and preserves shared-line rows", () => {
  const rows = [
    row(10, { sub_section: "Trench1", tyre_type: "PCR" }),
    row(15, { sub_section: "Trench1", tyre_type: "Both" }),
    row(20, { sub_section: "Trench1", tyre_type: "TBR" }),
    row(25, { sub_section: null, tyre_type: "PCR" }),
    row(30, { sub_section: "Trench2", tyre_type: "PCR" }),
    row(35, { section: null, sub_section: "Trench1", tyre_type: "PCR" }),
    row(40, { section: "TBM", sub_section: "Trench1", tyre_type: "PCR" }),
  ];
  const scoped = scopeCtpDowntimeReasonRows(rows, {
    section: "Curing",
    subSection: "Trench1",
    tyreType: "PCR",
  });
  assert.deepEqual(scoped.map((r) => r.actual_value), [10, 15]);

  const alias = scopeCtpDowntimeReasonRows(
    [row(50, { sub_section: "Three Roll", tyre_type: "TBR" })],
    { section: "Curing", subSection: "3 Roll", tyreType: "TBR" },
  );
  assert.deepEqual(alias.map((r) => r.actual_value), [50]);
});

test("CTP reason breakdown sums raw machine values and filters a selected machine", () => {
  const rows = [
    row(60, { machine: "A", kpi_name: "Breakdown" }),
    row(30, { machine: "B", kpi_name: "Breakdown" }),
    row(15, { machine: "A", kpi_name: "Setup & Change" }),
    row(500, { machine: "A", granularity: "SHIFT A", kpi_name: "Breakdown" }),
    row(900, { section: "TBM", machine: "A", kpi_name: "Breakdown" }),
  ];
  const totalRows = sumCtpDowntimeReasons(rows, {
    section: "Curing",
    granularity: "DAY",
  });
  assert.equal(totalRows.find((r) => r.reason === "Breakdown").sum, 90);
  assert.equal(totalRows.find((r) => r.reason === "Setup & Change").sum, 15);

  const machineRows = sumCtpDowntimeReasons(rows, {
    section: "Curing",
    granularity: "DAY",
    selectedMachine: "A",
  });
  assert.equal(machineRows.find((r) => r.reason === "Breakdown").sum, 60);
});

test("CTP total request keeps section/sub-section/tyre and pins DAY or the selected shift", () => {
  for (const plantId of ["ctp", "chennai"]) {
    for (const granularity of ["DAY", "MONTH", "SHIFT B"]) {
      const request = ctpDowntimePayload({
        plantId,
        category: "p",
        context: {
          section: "Curing",
          sub_section: "Trench1",
          tyre_type: "PCR",
          product_type: "Cured Tyre",
          unit_of_measurement: "NOS",
          category: "Productivity",
          granularity,
        },
        dates: { from: "2026-10-01", to: "2026-10-06" },
        withBaseline: true,
      });
      assert.deepEqual(request.context, {
        section: "Curing",
        sub_section: "Trench1",
        tyre_type: "PCR",
        granularity: granularity.startsWith("SHIFT") ? granularity : "DAY",
      });
      assert.deepEqual(request.drillKpis, ["Total_Downtime"]);
      assert.equal(request.from, "2026-10-01");
      assert.equal(request.to, "2026-10-06");
      assert.equal(request.withBaseline, true);
      assert.equal(request.drillOnly, true);
    }
  }
  assert.equal(ctpDowntimePayload({ plantId: "banmore", category: "p" }), null);
  assert.equal(ctpDowntimePayload({ plantId: "ctp", category: "q" }), null);
});

test("CTP Production reads the stored sum, never a machine average or reason sum", () => {
  for (const section of ["Mixing", "Stock", "TBM", "Curing"]) {
    const rows = [
      row(60, { section, machine: "A" }),
      row(30, { section, machine: "B" }),
    ];
    const card = total(rows, {
      section,
      productType: "Anything",
      unitOfMeasurement: "NOS",
      downtimeRows: [
        row(1000, { section, machine: "X", kpi_name: "Breakdown" }),
      ],
    });
    assert.equal(card.value, 90);
    assert.equal(card.unit, "min");
    assert.deepEqual(card.spark, [90]);
    assert.equal(card.topMachine, null);
  }
});

test("CTP month and custom range sum every day and use summed sparklines/baselines", () => {
  const rows = [row(90), row(60, { date: "2026-10-05" })];
  for (const extra of [{ granularity: "MONTH" }, { mode: "aggregate" }]) {
    const card = total(rows, {
      ...extra,
      baselineTotalDowntimeRows: [row(100, { date: "2026-09-06" })],
      totalDowntimeBaselineWindow: { from: "2026-09-01", to: "2026-09-30" },
    });
    assert.equal(card.value, 150);
    assert.deepEqual(card.spark, [60, 90]);
    assert.equal(card.trend, 50);
    assert.ok(card.trendBaseline);
  }
});

test("CTP DAY snapshot reads its own latest date and compares day totals", () => {
  const card = total([row(90), row(60, { date: "2026-10-05" })], {
    headlineDate: "2026-10-07",
  });
  assert.equal(card.value, 90);
  assert.equal(card.resolvedDate, "2026-10-06");
  assert.equal(card.asOfDate, "2026-10-06");
  assert.equal(card.trend, 50);
});

test("CTP single-day stored total uses a dedicated previous-day baseline", () => {
  const card = total([row(90)], {
    headlineDate: "2026-10-06",
    baselineTotalDowntimeRows: [row(60, { date: "2026-10-05" })],
  });
  assert.equal(card.trend, 50);
});

test("CTP selected shift uses only that shift, for snapshots and custom ranges", () => {
  const rows = [
    row(900),
    row(20, { granularity: "SHIFT B" }),
    row(30, { granularity: "SHIFT B", date: "2026-10-05" }),
    row(500, { granularity: "SHIFT A" }),
  ];
  assert.equal(total(rows, { granularity: "SHIFT B" }).value, 20);
  assert.equal(
    total(rows, { granularity: "SHIFT B", mode: "aggregate" }).value,
    50,
  );
});

test("stored totals are section-scoped, not deduped, and not doubled by an open drill", () => {
  const rows = [row(30), row(30), row(900, { section: "TBM" })];
  assert.equal(total(rows, {}, rows).value, 60);
});

test("missing CTP stored totals show a dash rather than falling back to reasons", () => {
  const card = total([], {
    downtimeRows: [row(90, { kpi_name: "Breakdown", machine: "A" })],
  });
  assert.equal(card.value, "—");
  assert.equal(card.trend, null);
  assert.equal(total([row(null)]).value, "—");
  assert.equal(total([row(0)]).value, 0);
});

test("Banmore and CTP Technical single-reason cards retain their per-machine averages", () => {
  const reasons = [
    row(60, { kpi_name: "Breakdown", machine: "A" }),
    row(30, { kpi_name: "Setup & Change", machine: "B" }),
  ];
  assert.equal(
    total([row(900)], { plantId: "banmore", downtimeRows: reasons }).value,
    45,
  );
  const cards = toDowntimeReasonKpis(reasons, opts);
  assert.equal(cards.find((k) => k.id === "bdown").value, 30);
  assert.equal(cards.find((k) => k.id === "bcs").value, 15);
});
