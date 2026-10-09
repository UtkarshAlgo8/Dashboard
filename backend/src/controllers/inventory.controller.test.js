/**
 * Unit tests for `ctpInventoryMasterSql()` — the CTP inventory master
 * read. Pure string checks; no upstream call.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ctpInventoryMasterSql,
  ctpInventoryGranularity,
} from "./inventory.controller.js";

const DAY_SQL = { plantId: "chennai", granularity: "DAY" };

test("ctpInventoryMasterSql: reads every live per-status inventory KPI from gold.ctp_gold", () => {
  const sql = ctpInventoryMasterSql(DAY_SQL);
  assert.match(sql, /FROM gold\.ctp_gold/);
  for (const kpi of [
    "Total_Inventory",
    "Ready_To_Use",
    "Part_Use",
    "About_To_Expire",
    "Expired",
    "Held",
    "MHE_Count",
    "Daily_Consumption",
    "Oldest_Blocked_Lot_Days",
  ]) {
    assert.ok(sql.includes(`'${kpi}'`), `missing ${kpi}`);
  }
});

test("ctpInventoryMasterSql: no longer asks for the retired Inventory / Inventory_item KPIs", () => {
  const sql = ctpInventoryMasterSql(DAY_SQL);
  assert.ok(!sql.includes("'Inventory_item'"));
  assert.ok(!/kpi_name IN \([^)]*'Inventory'[,)]/.test(sql));
});

test("ctpInventoryMasterSql: one grain only, each series at its own latest date", () => {
  const sql = ctpInventoryMasterSql(DAY_SQL);
  assert.match(sql, /UPPER\(granularity\) = 'DAY'/);
  assert.match(
    sql,
    /MAX\(date\) OVER \(\s*PARTITION BY section, product_type, tyre_type, kpi_name\s*\)/,
  );
  assert.match(sql, /WHERE is_latest/);
});

test("ctpInventoryMasterSql: scopes on plant + category, not department", () => {
  const sql = ctpInventoryMasterSql(DAY_SQL);
  assert.match(sql, /UPPER\(plant\) = 'CHENNAI'/);
  assert.match(sql, /category = 'Inventory'/);
  assert.ok(!/department/i.test(sql));
});

test("ctpInventoryMasterSql: level 1 for Total_Inventory / MHE_Count, level 2 for breakdowns", () => {
  const sql = ctpInventoryMasterSql(DAY_SQL);
  assert.match(
    sql,
    /CASE WHEN kpi_name IN \('Total_Inventory', 'MHE_Count'\) THEN '1' ELSE '2' END/,
  );
});

test("ctpInventoryMasterSql: Month reads MONTH rows inside the selected window", () => {
  const sql = ctpInventoryMasterSql({
    plantId: "chennai",
    granularity: "MONTH",
    fromKey: "20260901",
    toKey: "20260930",
  });
  assert.match(sql, /UPPER\(granularity\) = 'MONTH'/);
  assert.ok(!sql.includes("'DAY'"));
  assert.match(sql, />= '20260901'/);
  assert.match(sql, /<= '20260930'/);
});

test("ctpInventoryMasterSql: no window → no date clamp (latest ever)", () => {
  const sql = ctpInventoryMasterSql(DAY_SQL);
  assert.ok(!/>= '\d{8}'/.test(sql));
  assert.ok(!/<= '\d{8}'/.test(sql));
});

test("ctpInventoryGranularity: header grains pass through, normalized", () => {
  assert.equal(ctpInventoryGranularity("DAY"), "DAY");
  assert.equal(ctpInventoryGranularity("MONTH"), "MONTH");
  assert.equal(ctpInventoryGranularity("SHIFT A"), "SHIFT A");
});

test("ctpInventoryGranularity: missing or unknown grain falls back to DAY", () => {
  assert.equal(ctpInventoryGranularity(undefined), "DAY");
  assert.equal(ctpInventoryGranularity(""), "DAY");
  assert.equal(ctpInventoryGranularity("DAY'; DROP TABLE x --"), "DAY");
});
