/**
 * Unit tests for the Quality fresh/historical table split (gold.gold vs
 * gold.gold_daily). Pure SQL-shape assertions: no network, no workbook.
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import { config } from "../../config.js";
import { freshCutoffKey } from "../../queries/gold-source.js";
import {
  qualitySource,
  qualitySourceForDate,
  qualitySourceForRange,
} from "./gold-source.js";
import { kpiValueQuery, kpiHistoryQuery } from "./process.queries.js";
import { productSummaryQuery } from "./product.queries.js";
import { spcCapabilityRowsQuery } from "./spc.queries.js";

const CUTOFF = freshCutoffKey();

/** CUTOFF shifted by whole days, as an ISO yyyy-mm-dd date. */
function isoFromCutoff(days) {
  const dt = new Date(
    Date.UTC(
      Number(CUTOFF.slice(0, 4)),
      Number(CUTOFF.slice(4, 6)) - 1,
      Number(CUTOFF.slice(6, 8)),
    ),
  );
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Run `fn` with config.quality temporarily patched, then restore. */
function withQualityConfig(patch, fn) {
  const saved = { ...config.quality };
  Object.assign(config.quality, patch);
  try {
    return fn();
  } finally {
    Object.assign(config.quality, saved);
  }
}

const DB = { dataSource: "db", sqlTable: "gold.gold", dailySqlTable: "gold.gold_daily" };

/* ------------------------------ happy path ------------------------------- */

test("a historical date reads the base table only", () => {
  withQualityConfig(DB, () => {
    const sql = qualitySourceForDate(isoFromCutoff(-10));
    assert.equal(sql, "gold.gold");
  });
});

test("a fresh date reads the daily table only", () => {
  withQualityConfig(DB, () => {
    const sql = qualitySourceForDate(isoFromCutoff(1));
    assert.equal(sql, "gold.gold_daily");
  });
});

test("a range straddling the cutoff unions both tables on disjoint, adjacent predicates", () => {
  withQualityConfig(DB, () => {
    const sql = qualitySourceForRange(isoFromCutoff(-5), isoFromCutoff(2));

    assert.ok(sql.startsWith("("), "must be a parenthesized subquery");
    assert.ok(sql.includes(" UNION ALL "));
    assert.ok(sql.includes("FROM gold.gold "));
    assert.ok(sql.includes("FROM gold.gold_daily "));
    // Disjoint and adjacent at the same cutoff: never both, never a gap.
    assert.ok(sql.includes(`< '${CUTOFF}'`));
    assert.ok(sql.includes(`>= '${CUTOFF}'`));
  });
});

/* -------------------------------- edges ---------------------------------- */

test("the cutoff date itself is fresh, not historical", () => {
  withQualityConfig(DB, () => {
    const at = isoFromCutoff(0);
    assert.equal(qualitySourceForDate(at), "gold.gold_daily");
    assert.equal(qualitySourceForDate(isoFromCutoff(-1)), "gold.gold");
  });
});

test("an unbounded read (SPC limits) unions both tables", () => {
  withQualityConfig(DB, () => {
    const sql = qualitySource();
    assert.ok(sql.includes(" UNION ALL "));
    assert.ok(sql.includes("FROM gold.gold "));
    assert.ok(sql.includes("FROM gold.gold_daily "));
  });
});

test("the excel source stays single-table — a union would self-join the one alasql table", () => {
  withQualityConfig({ ...DB, dataSource: "excel" }, () => {
    assert.equal(qualitySourceForDate(isoFromCutoff(1)), "gold.gold");
    assert.ok(!qualitySource().includes("UNION"));
  });
});

test("a blank QUALITY_SQL_TABLE_DAILY disables the split entirely", () => {
  withQualityConfig({ ...DB, dailySqlTable: "" }, () => {
    assert.equal(qualitySourceForDate(isoFromCutoff(1)), "gold.gold");
    assert.equal(qualitySource(), "gold.gold");
  });
});

test("MONTH/YEAR reads stay on the base table — the rolling table has no Quality aggregates", () => {
  withQualityConfig(DB, () => {
    const fresh = isoFromCutoff(1);
    assert.equal(qualitySourceForDate(fresh, "MONTH"), "gold.gold");
    assert.equal(qualitySourceForDate(fresh, "YEAR"), "gold.gold");
    assert.equal(qualitySource({ granularity: ["DAY", "MONTH"] }), "gold.gold");
    // DAY / SHIFT still split as normal.
    assert.equal(qualitySourceForDate(fresh, "DAY"), "gold.gold_daily");
    assert.equal(qualitySourceForDate(fresh, "SHIFT A"), "gold.gold_daily");
  });
});

test("a current-month read on the 1st of a month does not fall into the empty fresh window", () => {
  withQualityConfig(DB, () => {
    // MONTH rows are stamped with the first of the month; when that stamp
    // lands inside the fresh window the daily table has nothing to return.
    const sql = kpiValueQuery({
      kpiName: "Process Audit Score",
      date: isoFromCutoff(1),
      granularity: "MONTH",
    });
    assert.ok(sql.includes("FROM gold.gold "));
    assert.ok(!sql.includes("gold_daily"));
  });
});

/* ------------------- the builders actually use the source ---------------- */

test("Process builders route their own date window through the split", () => {
  withQualityConfig(DB, () => {
    const fresh = kpiValueQuery({
      kpiName: "Process Audit Score",
      date: isoFromCutoff(1),
      granularity: "DAY",
    });
    assert.ok(fresh.includes("FROM gold.gold_daily "));
    assert.ok(!fresh.includes("UNION ALL"));

    const straddling = kpiHistoryQuery({
      kpiName: "Process Audit Score",
      from: isoFromCutoff(-30),
      to: isoFromCutoff(1),
      granularity: "DAY",
    });
    assert.ok(straddling.includes(" UNION ALL "));
    // The trailing ORDER BY must survive the subquery substitution.
    assert.ok(straddling.trim().endsWith("ORDER BY date ASC"));
  });
});

test("SPC capability rows route the snapshot date through the split", () => {
  withQualityConfig(DB, () => {
    const sql = spcCapabilityRowsQuery({
      snapshot: isoFromCutoff(1),
      granularity: "Day",
    });
    assert.ok(sql.includes("FROM gold.gold_daily "));
    assert.ok(sql.includes("category = 'SPC'"), "scope predicate must survive");
  });
});

test("Product Uniformity summary uses the same fresh/historic source split", () => {
  withQualityConfig(DB, () => {
    const fresh = productSummaryQuery({
      date: isoFromCutoff(1),
      granularity: "DAY",
    });
    const historic = productSummaryQuery({
      date: isoFromCutoff(-10),
      granularity: "DAY",
    });
    assert.ok(fresh.includes("FROM gold.gold_daily "));
    assert.ok(historic.includes("FROM gold.gold "));
    assert.ok(fresh.includes("category = 'Uniformity Testing'"));
  });
});

/* -------------------------------- errors --------------------------------- */

test("an unknown data source is not silently treated as excel", () => {
  withQualityConfig({ ...DB, dataSource: "bogus" }, () => {
    // Unknown sources are rejected at the datasource switch, not here; this
    // resolver must not quietly fall back to single-table behaviour.
    assert.ok(qualitySourceForDate(isoFromCutoff(1)).includes("gold_daily"));
  });
});
