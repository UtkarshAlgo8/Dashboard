import assert from "node:assert/strict";
import test from "node:test";
import {
  MACHINE_NAME_COLUMN,
  machineLabel,
  machineName,
} from "./machineName.js";

test("machine name and label read eqname", () => {
  const row = { machine: "0201", eqname: "Bead Apex" };
  assert.equal(machineName(row), "Bead Apex");
  assert.equal(machineLabel(row), "0201 · Bead Apex");
  assert.equal(MACHINE_NAME_COLUMN.render(row), "Bead Apex");
});

test("gold's empty sentinels read as no name", () => {
  for (const eqname of [null, undefined, "", "nan", "NULL"]) {
    const row = { machine: "0201", eqname };
    assert.equal(machineName(row), null);
    assert.equal(machineLabel(row), "0201");
    assert.equal(MACHINE_NAME_COLUMN.render(row), "—");
  }
});

test("a missing row does not throw", () => {
  assert.equal(machineName(undefined), null);
  assert.equal(machineLabel(undefined), undefined);
});
