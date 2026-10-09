import { test } from "node:test";
import assert from "node:assert/strict";
import { toExportTable, toFileSlug } from "./tableExport.js";

test("exports rendered text cell for cell, in the given row order", () => {
  const columns = [
    { key: "machine", label: "Machine" },
    { key: "min", label: "Downtime", render: (r) => `${r.min} min` },
  ];
  const rows = [
    { machine: "B2", min: 40 },
    { machine: "A1", min: 90 },
  ];
  assert.deepEqual(toExportTable(columns, rows), {
    headers: ["Machine", "Downtime"],
    rows: [
      { Machine: "B2", Downtime: "40 min" },
      { Machine: "A1", Downtime: "90 min" },
    ],
  });
});

test("render receives the full row set, so share-of-total columns export correctly", () => {
  const columns = [
    {
      key: "min",
      label: "Share",
      render: (r, all) =>
        `${(r.min / all.reduce((s, x) => s + x.min, 0)) * 100}%`,
    },
  ];
  const all = [{ min: 25 }, { min: 75 }];
  assert.deepEqual(toExportTable(columns, [all[1]], all).rows, [
    { Share: "75%" },
  ]);
});

test("a column that renders an element falls back to the raw value, or blank", () => {
  const chip = { $$typeof: Symbol.for("react.element") };
  const columns = [
    { key: "status", label: "Machine Category", render: () => chip },
    { key: "missing", label: "Note", render: () => chip },
  ];
  assert.deepEqual(toExportTable(columns, [{ status: "A" }]).rows, [
    { "Machine Category": "A", Note: null },
  ]);
});

test("no rows exports headers only", () => {
  assert.deepEqual(toExportTable([{ key: "x", label: "X" }], []), {
    headers: ["X"],
    rows: [],
  });
});

test("file slugs drop separators and punctuation", () => {
  assert.equal(
    toFileSlug("engineering-Machine · Curing"),
    "engineering-machine-curing",
  );
  assert.equal(toFileSlug("  ·  "), "download");
});
