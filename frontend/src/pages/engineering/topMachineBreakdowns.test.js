import assert from "node:assert/strict";
import test from "node:test";
import {
  topMachineBreakdownRequest,
  topMachineBreakdownRows,
} from "./topMachineBreakdowns.js";

test("published period reads machine rates and sorts the top ten", () => {
  const request = topMachineBreakdownRequest({
    kind: "month",
    date: "2026-09-01",
    granularity: "MONTH",
  });
  assert.deepEqual(request.kpiNames, [
    "BreakdownMin_m",
    "BreakdownOcc_m",
    "MTBF_m",
    "MTTR_m",
  ]);
  assert.equal(request.agg, undefined);
  assert.equal(request.limit, 10);

  const rows = topMachineBreakdownRows(
    [
      { machine: "B", BreakdownMin_m: 20, MTBF_m: 300 },
      { machine: "A", BreakdownMin_m: 50, MTBF_m: 900 },
      { machine: "C", BreakdownMin_m: 0 },
    ],
    false,
  );
  assert.deepEqual(
    rows.map((r) => r.machine),
    ["A", "B"],
  );
  assert.equal(rows[0].MTBF_m, 900);
});

test("custom range pools machine components rather than summing rates", () => {
  const request = topMachineBreakdownRequest({
    kind: "range",
    date: "2026-09-03",
    from: "2026-09-03",
    to: "2026-09-15",
    granularity: "DAY",
  });
  assert.deepEqual(request.kpiNames, [
    "BreakdownMin_m",
    "BreakdownOcc_m",
    "OperatingMin_m",
  ]);
  assert.equal(request.agg, "sum");
  assert.equal(request.from, "2026-09-03");
  assert.equal(request.to, "2026-09-15");

  const rows = topMachineBreakdownRows(
    [
      {
        machine: "0201",
        section: "Mixing",
        BreakdownMin_m: 80,
        BreakdownOcc_m: 2,
        OperatingMin_m: 600,
      },
      { machine: "0202", BreakdownMin_m: 5, BreakdownOcc_m: null },
    ],
    true,
  );
  assert.equal(rows[0].MTBF_m, 300);
  assert.equal(rows[0].MTTR_m, 40);
  assert.equal(rows[0].section, "Mixing");
  assert.equal(rows[1].MTBF_m, null);
  assert.equal(rows[1].MTTR_m, null);
});

test("missing, zero-downtime and unmapped machine IDs do not produce a leader", () => {
  assert.deepEqual(topMachineBreakdownRows(null, true), []);
  assert.deepEqual(
    topMachineBreakdownRows(
      [
        { machine: "", BreakdownMin_m: 10 },
        { machine: "0201", BreakdownMin_m: null },
        { machine: "0202", BreakdownMin_m: 0 },
      ],
      false,
    ),
    [],
  );
});
