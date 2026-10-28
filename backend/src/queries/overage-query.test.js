/**
 * Unit tests for the Overage Material reads (overage-query.js) and their
 * transformer (transformers.js#toOverage). Pure string / shape checks; no
 * upstream call. Spec: frontend/specs/17-overage-material.md.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildOverageTotalsSql, buildOverageSkuSql } from "./overage-query.js";
import { goldSource } from "./gold-source.js";
import { toOverage } from "../utils/transformers.js";

const PLANT = { plantId: "banmore" };

test("overage SQL: reads DAY Overage rows of the right KPI for the plant", () => {
  const totals = buildOverageTotalsSql(PLANT);
  const skus = buildOverageSkuSql(PLANT);
  for (const sql of [totals, skus]) {
    assert.match(sql, /status = 'Overage'/);
    assert.match(sql, /UPPER\(granularity\) = 'DAY'/);
    assert.match(sql, /UPPER\(plant\) = 'BANMORE'/);
  }
  assert.match(totals, /kpi_name = 'Inventory'/);
  assert.match(skus, /kpi_name = 'Inventory_item'/);
});

test("overage SQL: no date filter — every production date counts", () => {
  for (const sql of [buildOverageTotalsSql(PLANT), buildOverageSkuSql(PLANT)]) {
    // Unbounded gold source: both tables, split only at the daily cutoff.
    assert.ok(sql.includes(`FROM ${goldSource(PLANT)}`));
    const filters = sql.slice(
      sql.indexOf("WHERE UPPER(plant)"),
      sql.indexOf("GROUP BY"),
    );
    assert.ok(!/date/i.test(filters), filters);
  }
});

test("overage SQL: one value per cell before summing", () => {
  const sql = buildOverageTotalsSql(PLANT);
  assert.match(sql, /MIN\(actual_value\) AS qty/);
  assert.match(
    sql,
    /GROUP BY section, sub_section, product_type, unit_of_measurement,\s*machine, itemcode,/,
  );
  assert.match(sql, /SUM\(qty\) AS overage_qty/);
});

test("overage SQL: totals group every level by unit", () => {
  const sql = buildOverageTotalsSql(PLANT);
  assert.match(sql, /\(section, unit_of_measurement\)/);
  assert.match(sql, /\(section, sub_section, unit_of_measurement\)/);
  assert.match(sql, /\(section, sub_section, product_type, unit_of_measurement\)/);
  assert.match(sql, /GROUPING\(sub_section, product_type\)/);
});

test("overage SQL: SKU rows grouped by unit and itemcode, largest first", () => {
  const sql = buildOverageSkuSql(PLANT);
  assert.match(
    sql,
    /GROUP BY section, sub_section, product_type, unit_of_measurement, itemcode\s/,
  );
  assert.match(sql, /ORDER BY overage_qty DESC/);
});

test("toOverage: keeps each unit as its own row and cleans values", () => {
  const { totals, skus } = toOverage(
    [
      { level: "section", section: "Stock", sub_section: "nan", product_type: "nan",
        unit_of_measurement: "m", overage_qty: "7240000", oldest_lot_date: "20260930",
        production_days: "21" },
      { level: "section", section: "Stock", sub_section: "nan", product_type: "nan",
        unit_of_measurement: "nos", overage_qty: 3910, oldest_lot_date: "20261002",
        production_days: 4 },
    ],
    [
      { section: "Stock", sub_section: "Cutter", product_type: "Belt",
        unit_of_measurement: "m", itemcode: "BLT-001", overage_qty: "5201",
        oldest_lot_date: "20261009", production_days: "1" },
    ],
  );
  assert.equal(totals.length, 2);
  assert.deepEqual(totals[0], {
    level: "section",
    section: "Stock",
    sub_section: null,
    product_type: null,
    unit: "M",
    overage_qty: 7240000,
    oldest_lot_date: "2026-09-30",
    production_days: 21,
  });
  assert.equal(totals[1].unit, "NOS");
  assert.equal(skus[0].itemcode, "BLT-001");
  assert.equal(skus[0].overage_qty, 5201);
  assert.equal(skus[0].oldest_lot_date, "2026-10-09");
});

test("toOverage: empty or missing input gives empty lists", () => {
  assert.deepEqual(toOverage([], []), { totals: [], skus: [] });
  assert.deepEqual(toOverage(null, undefined), { totals: [], skus: [] });
});

test("toOverage: unreadable quantity or date becomes 0 / null, not NaN", () => {
  const { totals } = toOverage(
    [{ level: "component", section: "Stock", sub_section: "Cutter",
       product_type: "Belt", unit_of_measurement: "m", overage_qty: "nan",
       oldest_lot_date: "not-a-date", production_days: null }],
    [],
  );
  assert.equal(totals[0].overage_qty, 0);
  assert.equal(totals[0].oldest_lot_date, null);
  assert.equal(totals[0].production_days, 0);
});
