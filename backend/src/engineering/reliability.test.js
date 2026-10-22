/**
 * Engineering Reliability drill tests (spec 16/17). Covers the two pieces
 * the DATE-WISE Failure level rests on: the composite `group_by`
 * ("remarks,date") that keys one row per (failure, day), and the optional
 * `date_from`/`date_to` window `kpiChildrenQuery` reads it over.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  toKpiChildren,
  toLossTree,
} from "./transformers/reliability.transformers.js";
import { kpiChildrenQuery } from "./queries/reliability.queries.js";

const KPIS = ["Breakdown_Pct_m_Failure", "BreakdownMin_m_Failure"];

/** One gold row at the Failure leaf's grain (ancestor dims already pinned). */
function row(remarks, date, kpiName, value) {
  return {
    date,
    status: "A",
    section: "Mixing",
    sub_section: "Electrical",
    machine: "0201",
    remarks,
    kpi_name: kpiName,
    actual_value: value,
    drill_down_attribute: "",
  };
}

/* ------------------------- happy path ------------------------- */

test("toKpiChildren: 'remarks,date' yields one row per (failure, day)", () => {
  const rows = [
    row("DUMP MILL", "2026-08-04", "Breakdown_Pct_m_Failure", 0.21),
    row("DUMP MILL", "2026-08-04", "BreakdownMin_m_Failure", 50),
    row("DUMP MILL", "2026-08-17", "Breakdown_Pct_m_Failure", 0.3),
    row("DUMP MILL", "2026-08-17", "BreakdownMin_m_Failure", 70),
    row("BATCH-OFF MILL", "2026-08-09", "BreakdownMin_m_Failure", 42),
  ];

  const out = toKpiChildren(rows, { kpiNames: KPIS, groupBy: "remarks,date" });

  assert.equal(out.group_by, "remarks,date");
  assert.equal(out.rows.length, 3);
  // Each dimension stays its own field, so the table labels the pair with
  // one column each.
  assert.deepEqual(
    out.rows.map((r) => [r.remarks, r.date, r.BreakdownMin_m_Failure]),
    [
      ["DUMP MILL", "2026-08-04", 50],
      ["DUMP MILL", "2026-08-17", 70],
      ["BATCH-OFF MILL", "2026-08-09", 42],
    ],
  );
  // Absent, not zero-filled — the Engineering gap rule.
  assert.equal(out.rows[2].Breakdown_Pct_m_Failure, null);
});

test("kpiChildrenQuery: from/to widen the level to a window; date alone pins one day", () => {
  const windowed = kpiChildrenQuery({
    kpiNames: KPIS,
    date: "2026-08-01",
    from: "2026-08-01",
    to: "2026-08-31",
    granularity: "DAY",
    machine: "0201",
  });
  assert.match(windowed, />= '20260801'/);
  assert.match(windowed, /<= '20260831'/);
  // `END) = ` — the equality form, not the tail of `>=`/`<=`.
  assert.doesNotMatch(windowed, /END\) = '/);

  const single = kpiChildrenQuery({
    kpiNames: KPIS,
    date: "2026-08-01",
    granularity: "MONTH",
  });
  assert.match(single, /END\) = '20260801'/);
  assert.doesNotMatch(single, />=/);
});

/* --------------------------- edge case --------------------------- */

test("toKpiChildren: a timestamped date groups with its bare-date twin", () => {
  const rows = [
    row("DUMP MILL", "2026-08-04 00:00:00", "BreakdownMin_m_Failure", 50),
    row("DUMP MILL", "2026-08-04", "Breakdown_Pct_m_Failure", 0.21),
  ];

  const out = toKpiChildren(rows, { kpiNames: KPIS, groupBy: "remarks,date" });

  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].date, "2026-08-04");
  assert.equal(out.rows[0].BreakdownMin_m_Failure, 50);
  assert.equal(out.rows[0].Breakdown_Pct_m_Failure, 0.21);
});

test("toKpiChildren: a single group_by is unchanged by the composite path", () => {
  const rows = [
    row("DUMP MILL", "2026-08-04", "BreakdownMin_m_Failure", 50),
    row("DUMP MILL", "2026-08-17", "BreakdownMin_m_Failure", 70),
  ];

  const out = toKpiChildren(rows, { kpiNames: KPIS, groupBy: "remarks" });

  // One row for the failure: the JOIN path takes the first published row per
  // kpi_name, exactly as it did before dates were a key.
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].remarks, "DUMP MILL");
  assert.equal(out.rows[0].BreakdownMin_m_Failure, 50);
});

/* --------------------------- error case --------------------------- */

test("toKpiChildren: a row missing part of the key is dropped, not blank-grouped", () => {
  const rows = [
    row("DUMP MILL", "2026-08-04", "BreakdownMin_m_Failure", 50),
    // No failure text, and no date: neither belongs to a (failure, day).
    row("", "2026-08-05", "BreakdownMin_m_Failure", 99),
    row("DUMP MILL", null, "BreakdownMin_m_Failure", 77),
  ];

  const out = toKpiChildren(rows, { kpiNames: KPIS, groupBy: "remarks,date" });

  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].BreakdownMin_m_Failure, 50);
});

test("toKpiChildren: no rows for the scope yields an empty table, not a throw", () => {
  const out = toKpiChildren([], { kpiNames: KPIS, groupBy: "remarks,date" });
  assert.deepEqual(out, { group_by: "remarks,date", rows: [] });
});

test("toLossTree: summed range rows retain machine display dimensions", () => {
  const out = toLossTree(
    [
      row("DUMP MILL", "2026-08-04", "BreakdownMin_m", 50),
      {
        ...row("DUMP MILL", "2026-08-05", "BreakdownOcc_m", 2),
        machine: "0201",
        status: "A",
        section: "Mixing",
      },
      {
        ...row("DUMP MILL", "2026-08-05", "BreakdownMin_m", 30),
        machine: "0201",
        status: "A",
        section: "Mixing",
      },
    ],
    { kpiNames: ["BreakdownMin_m", "BreakdownOcc_m"], groupBy: "machine" },
  );

  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].BreakdownMin_m, 80);
  assert.equal(out.rows[0].BreakdownOcc_m, 2);
  assert.equal(out.rows[0].section, "Mixing");
  assert.equal(out.rows[0].status, "A");
});

test("toLossTree: a tuple group_by sums per (machine, failure, discipline)", () => {
  const out = toLossTree(
    [
      row("LEAKAGE", "2026-08-04", "BreakdownMin_m_Failure", 40),
      row("LEAKAGE", "2026-08-05", "BreakdownMin_m_Failure", 20),
      {
        ...row("LEAKAGE", "2026-08-05", "BreakdownMin_m_Failure", 15),
        sub_section: "Mechanical",
      },
      {
        ...row("LEAKAGE", "2026-08-05", "BreakdownMin_m_Failure", 5),
        machine: "",
      },
    ],
    {
      kpiNames: ["BreakdownMin_m_Failure"],
      groupBy: "machine,remarks,sub_section",
    },
  );

  assert.deepEqual(
    out.rows.map((r) => [
      r.machine,
      r.remarks,
      r.sub_section,
      r.BreakdownMin_m_Failure,
    ]),
    [
      ["0201", "LEAKAGE", "Electrical", 60],
      ["0201", "LEAKAGE", "Mechanical", 15],
    ],
  );
  assert.equal(out.rows[0].status, "A");
  assert.equal(out.rows[0].section, "Mixing");
});

test("kpiChildrenQuery: include_unmapped drops the Unmapped exclusion", () => {
  const base = {
    kpiNames: ["BreakdownMin_m"],
    date: "2026-08-01",
    granularity: "MONTH",
  };
  assert.match(kpiChildrenQuery(base), /Unmapped/);
  assert.doesNotMatch(
    kpiChildrenQuery({ ...base, includeUnmapped: true }),
    /Unmapped/,
  );
});
