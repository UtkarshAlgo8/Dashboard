import test from "node:test";
import assert from "node:assert/strict";
import {
  athenaLiteral,
  OVERAGE_LAYOUT,
  OVERAGE_TABLES,
  overageSummaryQuery,
  overageItemsQuery,
  overageBarcodesQuery,
} from "./overage-live.js";

test("live overage uses only Silver Athena sources, one summary aggregation and BTP scope", () => {
  const sql = overageSummaryQuery({ section: "Extruder" });
  for (const table of OVERAGE_TABLES) assert.ok(sql.includes(table));
  assert.doesNotMatch(
    sql,
    /gold\.|CREATE\s|vw_overage|collect_set|unix_timestamp|array_contains|CAST\([^)]*AS STRING/i,
  );
  assert.equal((sql.match(/GROUP BY GROUPING SETS/g) ?? []).length, 1);
  assert.match(sql, /FULL OUTER JOIN agg/);
  assert.match(sql, /WHERE dashboard_section = 'Extruder'/);
  assert.match(sql, /p\.plant_code = 'BTP'/);
  assert.match(sql, /INTERVAL '240' HOUR/);
  assert.match(sql, /CAST\(p\.event_time AS timestamp\) <= k\.as_of/);
  assert.match(sql, /Asia\/Kolkata/);
  assert.match(sql, /COALESCE\(a\.overage_qty, 0\)/);
  assert.match(sql, /COALESCE\(l\.product_order, 99\)/);
  assert.doesNotMatch(sql, /fct_tbmpcr|fct_curingncm/);
  assert.equal(OVERAGE_LAYOUT.length, 13);
});

test("batch summary contains all six layouts but no section restriction or raw detail rows", () => {
  const sql = overageSummaryQuery();
  for (const section of [
    "Mixing",
    "Four Roll",
    "Three Roll",
    "Extruder",
    "Cutter",
    "Slitter",
  ])
    assert.ok(sql.includes(`('total', '${section}'`));
  assert.doesNotMatch(sql, /WHERE dashboard_section =/);
  assert.equal((sql.match(/GROUP BY GROUPING SETS/g) ?? []).length, 1);
});

test("eligibility, latest-record deduplication, assumed qty, own-machine aging and unit rules are SQL-side", () => {
  const sql = overageItemsQuery({ section: "Mixing", limit: 100, offset: 0 });
  assert.match(sql, /PARTITION BY TRIM\(TRANSLATE\(p\.production_id/);
  assert.match(sql, /ORDER BY p\._bronze_ingest_ts DESC NULLS LAST/);
  assert.match(sql, /WHERE barcode_rank = 1/);
  assert.match(
    sql,
    /WHERE l\.st IN \('ready to use', 'decision pending', 'consumed'\)/,
  );
  assert.match(sql, /WHEN l\.st = 'consumed' THEN 0/);
  assert.match(sql, /WHERE live_qty > 0 AND age_hours > max_aging_hours/);
  assert.match(
    sql,
    /WHEN ea\.max_aging_hours IS NOT NULL THEN ea\.max_aging_hours/,
  );
  assert.match(sql, /WHEN bk\.item_key IS NULL THEN ad\.max_aging_hours/);
  assert.match(sql, /LIKE 'day%'[\s\S]*\* 24/);
  assert.match(sql, /LIKE 'min%'[\s\S]*\/ 60/);
  assert.match(sql, /LIKE 'month%'[\s\S]*\* 720/);
  assert.match(
    sql,
    /WHEN s\.source_machine IN \('triplex', 'dualex'\) THEN 'NOS'/,
  );
  assert.match(sql, /WHEN UPPER\(s\.mhe_code\) LIKE 'CST%' THEN 'M'/);
  assert.match(
    sql,
    /COALESCE\(NULLIF\(TRIM\(s\.item_unit\), ''\), 'Not set'\)/,
  );
  assert.match(
    sql,
    /l\.source_machine = 'mm' AND l\.item_key = 'jt444'[\s\S]*THEN l\.component = 'Final Compound'/,
  );
  assert.match(
    sql,
    /COUNT\(\*\) OVER \(PARTITION BY barcode\) > 1 AS classification_conflict/,
  );
  assert.match(
    sql,
    /MAX\(MAX\(CASE WHEN classification_conflict THEN 1 ELSE 0 END\)\) OVER \(\)/,
  );
  assert.match(sql, /try_cast\(au\.record_id AS INTEGER\)/);
  assert.match(sql, /FILTER \(WHERE mc\.mes_name IS NOT NULL\)/);
  assert.match(
    sql,
    /SUM\(CASE WHEN qty_source <> 'Posted' THEN overage_qty ELSE 0 END\) AS assumed_qty/,
  );
  assert.match(sql, /COUNT\(\*\) AS barcodes/);
  assert.match(
    sql,
    /GROUP BY dashboard_section, product_type, item_code, unit/,
  );
  assert.match(sql, /OFFSET 0 ROWS LIMIT 101/);
});

test("item and unit predicates are safely encoded and barcode paging is stable", () => {
  const item = "ABC/('D'); DROP TABLE ignored; --\\";
  const sql = overageBarcodesQuery({
    section: "Extruder",
    productType: "Tread",
    itemCode: item,
    unit: "NOS",
    limit: 25,
    offset: 50,
  });
  assert.equal(athenaLiteral("O'Brien"), "'O''Brien'");
  assert.ok(sql.includes(`= ${athenaLiteral(item)}`));
  assert.match(sql, /AND product_type = 'Tread'/);
  assert.match(sql, /AND unit = 'NOS'/);
  assert.match(sql, /ORDER BY hours_over_limit DESC, barcode, machine, unit/);
  assert.match(sql, /OFFSET 50 ROWS LIMIT 26/);
  assert.match(sql, /hour\(produced_at\) < 7/);
  assert.match(sql, /BETWEEN 7 AND 14 THEN 'A'/);
  assert.match(sql, /BETWEEN 15 AND 22 THEN 'B'/);
});

test("reject unknown sections, mismatched products, malformed strings and unbounded pages", () => {
  for (const section of ["Bead", "Green Tyre", "Mixing' OR 1=1 --", ""]) {
    assert.throws(() => overageSummaryQuery({ section }), TypeError);
  }
  assert.throws(
    () => overageItemsQuery({ section: "Mixing", productType: "Tread" }),
    TypeError,
  );
  for (const value of ["abc\u0000", "abc\n", "x".repeat(513), 12, null])
    assert.throws(() => athenaLiteral(value), TypeError);
  for (const page of [
    { limit: 0 },
    { limit: 201 },
    { limit: "1" },
    { offset: -1 },
    { offset: 100001 },
  ]) {
    assert.throws(
      () => overageItemsQuery({ section: "Cutter", ...page }),
      TypeError,
    );
  }
  assert.throws(
    () => overageBarcodesQuery({ section: "Cutter", productType: "Belt" }),
    TypeError,
  );
});
