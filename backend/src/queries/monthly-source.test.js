import test from "node:test";
import assert from "node:assert/strict";
import { goldSource } from "./gold-source.js";
import {
  buildFetchQuery,
  buildDrillAggregateQuery,
  buildProductOptionsQuery,
} from "./dashboard-query.js";
import {
  kpiGridQuery,
  productionDrillQuery,
  trendQuery,
} from "./queries.js";
import {
  buildMaterializePullQuery,
  buildMaterializeCountQuery,
} from "./materialize-query.js";

// Reproduce the month-start failure regardless of when these tests run:
// November's MONTH anchor (Nov 1) is inside the fresh window on Nov 2.
function atMonthStart(t) {
  t.mock.method(Date, "now", () => Date.parse("2026-11-02T07:00:00Z"));
}

function assertBaseOnly(sql) {
  assert.match(sql, /FROM gold\.gold\s/);
  assert.ok(!sql.includes("gold_daily"), sql);
  assert.ok(sql.includes("granularity = 'MONTH'"), sql);
}

test("MONTH always uses base for fresh, straddling and unbounded windows", (t) => {
  atMonthStart(t);
  for (const window of [
    { fromKey: "20261101", toKey: "20261101" },
    { fromKey: "20261001", toKey: "20261130" },
    {},
  ]) {
    assert.equal(goldSource({ plantId: "banmore", granularity: "MONTH", ...window }), "gold.gold");
  }
  assert.equal(goldSource({ plantId: "chennai", granularity: "MONTH" }), "gold.ctp_gold");
});

test("Production and Quality Scrap cards, drills and histories read MONTH from base", (t) => {
  atMonthStart(t);
  for (const [category, kpi] of [["Productivity", "Production"], ["Quality", "Scrap"]]) {
    const context = { section: "Curing", category, granularity: "MONTH" };
    assertBaseOnly(buildFetchQuery({ context, date: "2026-11-01", landingKpis: [kpi] }));
    assertBaseOnly(buildFetchQuery({
      context, date: "2026-11-01", landingKpis: [kpi], drillKpis: [`${kpi}_m`],
    }));
    assertBaseOnly(buildFetchQuery({
      context, from: "2026-05-01", to: "2026-11-01", landingKpis: [kpi],
    }));
  }
  assertBaseOnly(buildDrillAggregateQuery({
    context: { section: "Curing", category: "Productivity", granularity: "MONTH" },
    date: "2026-11-01", kpiName: "Production_m", groupBy: ["machine"],
  }));
  assertBaseOnly(buildProductOptionsQuery({
    context: { section: "Curing", granularity: "MONTH" }, date: "2026-11-01",
  }));
});

test("legacy grids/drills and monthly trends also use base, including MTD aliases", (t) => {
  atMonthStart(t);
  const input = {
    plant: "banmore", section: "Curing", category: "Productivity",
    granularity: "MTD", from: "2026-11-01", to: "2026-11-30",
  };
  assertBaseOnly(kpiGridQuery(input));
  assertBaseOnly(productionDrillQuery(input));
  assertBaseOnly(trendQuery({ ...input, kpiName: "Production", range: "month" }));
  assertBaseOnly(buildFetchQuery({
    date: "2026-11-01", context: { section: "Curing", granularity: "MTD" },
  }));
});

test("DAY and shifts keep their existing fresh/historical source split", (t) => {
  atMonthStart(t);
  for (const granularity of ["DAY", "SHIFT A", "SHIFT B", "SHIFT C"]) {
    assert.equal(goldSource({
      plantId: "banmore", fromKey: "20261101", toKey: "20261102", granularity,
    }), "gold.gold_daily");
    assert.equal(goldSource({
      plantId: "banmore", fromKey: "20261001", toKey: "20261002", granularity,
    }), "gold.gold");
    const sql = buildFetchQuery({
      date: "2026-11-01", context: { section: "Curing", granularity },
    });
    assert.ok(sql.includes("FROM gold.gold_daily "));
    assert.ok(!sql.includes("UNION ALL"));
  }
});

test("mixed-grain pulls retain fresh MONTH rows from base and exclude them from daily", (t) => {
  atMonthStart(t);
  for (const sql of [
    goldSource({ plantId: "banmore" }),
    goldSource({ plantId: "banmore", fromKey: "20261101", toKey: "20261102" }),
    buildMaterializePullQuery(),
    buildMaterializeCountQuery(),
  ]) {
    const [base, daily] = sql.split(" UNION ALL ");
    assert.ok(base.includes("FROM gold.gold "));
    assert.ok(base.includes("OR UPPER(TRIM(granularity)) = 'MONTH'"));
    assert.ok(daily.includes("FROM gold.gold_daily "));
    assert.ok(daily.includes("NOT (UPPER(TRIM(granularity)) = 'MONTH')"));
  }
});
