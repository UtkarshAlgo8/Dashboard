/**
 * Engineering Reliability transformer tests (spec 16/17). Pure-unit coverage
 * of the kpi-children group keys, including the COMPOSITE `group_by`
 * ("machine,remarks") the Breakdown Pareto's "Machine × Phenomenon" lens
 * reads — one row per (machine, failure) pair, summed over the disciplines
 * the gold table splits that pair across.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { toKpiChildren, toLossTree } from "./transformers/reliability.transformers.js";

const KPIS = ["BreakdownMin_m_Failure", "BreakdownOcc_m_Failure"];

/** One gold row, with the dimensions the Reliability feed carries. */
function row(machine, subSection, remarks, kpiName, value) {
  return {
    status: "A",
    section: "Mixing",
    sub_section: subSection,
    machine,
    remarks,
    kpi_name: kpiName,
    actual_value: value,
    drill_down_attribute: "",
  };
}

/* ------------------------- happy path ------------------------- */

test("toLossTree: composite group_by sums a (machine, failure) pair across disciplines", () => {
  const rows = [
    row("0201", "Mechanical", "RAM", "BreakdownMin_m_Failure", 15),
    row("0201", "Electronics", "RAM", "BreakdownMin_m_Failure", 25),
    row("0201", "Mechanical", "RAM", "BreakdownOcc_m_Failure", 1),
    row("0201", "Electronics", "RAM", "BreakdownOcc_m_Failure", 2),
    row("0202", "Mechanical", "RAM", "BreakdownMin_m_Failure", 10),
  ];

  const out = toLossTree(rows, { kpiNames: KPIS, groupBy: "machine,remarks" });

  assert.equal(out.group_by, "machine,remarks");
  assert.equal(out.rows.length, 2);
  // Each dimension comes back as its own field, so the UI can label the pair.
  assert.equal(out.rows[0].machine, "0201");
  assert.equal(out.rows[0].remarks, "RAM");
  assert.equal(out.rows[0].BreakdownMin_m_Failure, 40);
  assert.equal(out.rows[0].BreakdownOcc_m_Failure, 3);
  assert.equal(out.rows[1].machine, "0202");
  assert.equal(out.rows[1].BreakdownMin_m_Failure, 10);
  // Absent, not zero-filled — the Engineering gap rule.
  assert.equal(out.rows[1].BreakdownOcc_m_Failure, null);
});

test("toLossTree: a single group_by is unchanged by the composite path", () => {
  const rows = [
    row("0201", "Mechanical", "RAM", "BreakdownMin_m_Failure", 15),
    row("0202", "Mechanical", "RAM", "BreakdownMin_m_Failure", 25),
    row("0202", "Mechanical", "MAIN MOTOR", "BreakdownMin_m_Failure", 5),
  ];

  const out = toLossTree(rows, { kpiNames: KPIS, groupBy: "remarks" });

  assert.deepEqual(
    out.rows.map((r) => [r.remarks, r.BreakdownMin_m_Failure]),
    [
      ["RAM", 40],
      ["MAIN MOTOR", 5],
    ],
  );
});

/* --------------------------- edge case --------------------------- */

test("toKpiChildren/toLossTree: a row missing part of its key is dropped, not blank-grouped", () => {
  const rows = [
    row("0201", "Mechanical", "RAM", "BreakdownMin_m_Failure", 15),
    // No failure text: this minute count belongs to no (machine, failure) pair.
    row("0201", "Mechanical", "", "BreakdownMin_m_Failure", 99),
    row(null, "Mechanical", "RAM", "BreakdownMin_m_Failure", 77),
  ];

  const summed = toLossTree(rows, { kpiNames: KPIS, groupBy: "machine,remarks" });
  assert.equal(summed.rows.length, 1);
  assert.equal(summed.rows[0].BreakdownMin_m_Failure, 15);

  const joined = toKpiChildren(rows, { kpiNames: KPIS, groupBy: "machine,remarks" });
  assert.equal(joined.rows.length, 1);
  assert.equal(joined.rows[0].machine, "0201");
  assert.equal(joined.rows[0].remarks, "RAM");
});

/* --------------------------- error case --------------------------- */

test("toLossTree: no rows for the scope yields an empty table, not a throw", () => {
  const out = toLossTree([], { kpiNames: KPIS, groupBy: "machine,remarks" });
  assert.deepEqual(out, { group_by: "machine,remarks", rows: [] });

  // Rows that carry only OTHER kpi_names are equally not an error.
  const other = toLossTree([row("0201", "Mechanical", "RAM", "MTTR_m_Failure", 5)], {
    kpiNames: KPIS,
    groupBy: "machine,remarks",
  });
  assert.deepEqual(other.rows, []);
});
