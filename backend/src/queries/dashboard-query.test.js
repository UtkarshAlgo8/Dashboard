/**
 * Unit tests for the dashboard query builder — new_change.md C1/C2/C4/C9.
 *
 * Pure SQL-shape assertions: no network, no credentials. The numeric
 * acceptance values live in test/acceptance.test.js, which queries the real
 * gold table and is skipped when upstream credentials are absent.
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDrillAggregateQuery,
  buildFetchQuery,
  buildLatestDateQuery,
  buildSectionMachinesQuery,
  buildShiftComparisonQuery,
  previousWindowGranularity,
  previousWindow,
  resolveDatePredicate,
  resolveGranularity,
  QueryValidationError,
  NO_DATA,
} from "./dashboard-query.js";
import { normalizeUnit, unitPredicate } from "../utils/normalize.js";

const CURING = { section: "Curing", granularity: "DAY" };

/**
 * goldSource() embeds its OWN date predicates inside a UNION ALL table
 * subquery whenever a window straddles the fresh/historical cutoff (see
 * gold-source.js) — this happens for any query whose window is open-ended
 * toward "today", which drifts with the real calendar. Strip that
 * subquery out before asserting on date literals / the outer WHERE, so
 * these SQL-shape assertions test the query builder's OWN predicates,
 * not goldSource's, and stay stable as "today" moves forward.
 */
function stripGoldSourceUnion(sql) {
  const marker = sql.indexOf(" UNION ALL ");
  if (marker === -1) return sql;
  let depth = 0;
  let start = -1;
  for (let i = marker; i >= 0; i--) {
    if (sql[i] === ")") depth++;
    else if (sql[i] === "(") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start === -1) return sql;
  depth = 0;
  let end = -1;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return sql;
  return sql.slice(0, start) + "__GOLD_SOURCE_UNION__" + sql.slice(end + 1);
}

/** Extract the YYYYMMDD date comparisons a built query emits. */
function dateLiterals(sql) {
  return [...stripGoldSourceUnion(sql).matchAll(/END\) (=|>=|<=) '(\d{8})'/g)].map(
    (m) => `${m[1]} ${m[2]}`,
  );
}

/* ---------------- C1 — a range must beat a stale single date --------------- */

test("C1: a range wins over a leftover single date", () => {
  // The frontend used to send both; the single date silently won and every
  // request was pinned to the same day no matter what the user picked.
  const sql = buildFetchQuery({
    context: CURING,
    date: "2026-07-20",
    from: "2026-07-01",
    to: "2026-07-16",
  });
  assert.deepEqual(dateLiterals(sql), [">= 20260701", "<= 20260716"]);
  assert.ok(!sql.includes("20260720"), "the stale single date must be ignored");
});

test("C1: from == to collapses to a single day, not a range", () => {
  const scope = resolveDatePredicate({ from: "2026-07-16", to: "2026-07-16" });
  assert.equal(scope.mode, "SINGLE_DAY");
  assert.equal(scope.date, "2026-07-16");
});

test("C1: from > to is rejected rather than silently returning nothing", () => {
  assert.throws(
    () => resolveDatePredicate({ from: "2026-07-16", to: "2026-07-01" }),
    QueryValidationError,
  );
});

test("C1: a partial range stays open-ended", () => {
  assert.deepEqual(dateLiterals(buildFetchQuery({ context: CURING, from: "2026-07-01" })), [
    ">= 20260701",
  ]);
  assert.deepEqual(dateLiterals(buildFetchQuery({ context: CURING, to: "2026-07-16" })), [
    "<= 20260716",
  ]);
});

test("C1: picker formats are accepted, not rejected as bad dates", () => {
  // An ISO timestamp or a slash-formatted date used to 400 and blank the card.
  for (const input of ["2026-07-16", "2026-07-16T00:00:00.000Z", "16-07-2026"]) {
    assert.deepEqual(
      dateLiterals(buildFetchQuery({ context: CURING, date: input })),
      ["= 20260716"],
      `failed for ${input}`,
    );
  }
});

/* ---------------- C2 — exactly one granularity, always ---------------- */

test("C2: granularity is pinned even when absent, empty, or 'all'", () => {
  // Omitting the predicate unions DAY + SHIFT A/B/C (+ MONTH). Because
  // SHIFT A+B+C == DAY exactly, that is a silent 2x-3.21x over-count.
  for (const context of [
    { section: "Curing" },
    { section: "Curing", granularity: "" },
    { section: "Curing", granularity: "all" },
    { section: "Curing", granularity: "nonsense-value" },
  ]) {
    const sql = buildFetchQuery({ context, date: "2026-07-16" });
    assert.ok(
      sql.includes("granularity = 'DAY'"),
      `no granularity pin for ${JSON.stringify(context)}`,
    );
  }
});

test("C2: a disabled Year returns no rows rather than every granularity", () => {
  assert.equal(resolveGranularity("Year"), NO_DATA);
  const sql = buildFetchQuery({
    context: { section: "Curing", granularity: "Year" },
    date: "2026-07-16",
  });
  assert.ok(sql.includes("1 = 0"), "disabled feature must return empty");
});

test("C2: an explicit shift granularity survives a date range (C11)", () => {
  // Shift rows exist at DAY level only, so a month/range shift total is the
  // SUM of the daily SHIFT rows. Forcing DAY here would make every shift cell
  // report the whole day's production.
  const sql = buildFetchQuery({
    context: { section: "Curing", granularity: "SHIFT A" },
    from: "2026-07-01",
    to: "2026-07-16",
  });
  assert.ok(sql.includes("granularity = 'SHIFT A'"));
});

/* ---------------- C4 — product-split levels pin one product ---------------- */

test("C4: product-split rows require an exact product, others stay lenient", () => {
  // These levels store the aggregate row AND its per-product children under
  // one kpi_name, so an unpinned read sums both halves = exactly 2x.
  const sql = buildFetchQuery({
    context: { ...CURING, product_type: "Cured Tyre" },
    date: "2026-07-16",
    drillKpis: ["Production_m"],
  });
  assert.ok(
    sql.includes("kpi_name IN ('Production_m'"),
    "split levels must be identified by row type",
  );
  assert.ok(
    sql.includes("NOT kpi_name IN ('Production_m'"),
    "non-split rows must keep the empty/agnostic fallbacks",
  );
  // Section-level KPIs (OEE) carry no product_type and must survive a pin.
  assert.ok(sql.includes("product_type IS NULL"));
});

/* ---------------- C9 — unit aliases ---------------- */

test("C9: duplicate unit spellings merge, genuinely different units do not", () => {
  assert.equal(normalizeUnit("Meters"), "M");
  assert.equal(normalizeUnit("NUM"), "NOS");
  assert.equal(normalizeUnit("null"), null, '"null" is the empty sentinel');
  assert.equal(normalizeUnit("(unset)"), null);
  // KG and Batch measure the same production two ways — never merge them.
  assert.equal(normalizeUnit("KG"), "KG");
  assert.notEqual(normalizeUnit("Batch"), normalizeUnit("KG"));
});

test("C9: the unit predicate matches every spelling of the same unit", () => {
  const sql = unitPredicate("M");
  assert.ok(sql.includes("'M'") && sql.includes("'METERS'"));
});

/* ---------------- C15 — the spike baseline window ---------------- */

test("C15: each time filter gets its defined previous period", () => {
  const at = (args) => resolveDatePredicate(args);
  // Day-wise -> the previous day, same shift.
  assert.deepEqual(previousWindow(at({ date: "2026-07-19" }), "DAY"), {
    date: "2026-07-18",
  });
  assert.deepEqual(previousWindow(at({ date: "2026-07-19" }), "SHIFT A"), {
    date: "2026-07-18",
  });
  // Custom range -> the immediately preceding window of EQUAL length.
  // 1-16 July is 16 days, so the baseline is 15-30 June.
  assert.deepEqual(
    previousWindow(at({ from: "2026-07-01", to: "2026-07-16" }), "DAY"),
    { from: "2026-06-15", to: "2026-06-30" },
  );
  // Month-wise -> the previous COMPLETE calendar month.
  assert.deepEqual(previousWindow(at({ date: "2026-07-01" }), "MONTH"), {
    from: "2026-06-01",
    to: "2026-06-30",
  });
  // Month-to-date ranges are aggregated as MONTH rows for the card, but the
  // comparison must use the same day span in the previous month.
  assert.deepEqual(
    previousWindow(at({ from: "2026-10-01", to: "2026-10-05" }), "MONTH"),
    { from: "2026-09-01", to: "2026-09-05" },
  );
  assert.equal(
    previousWindowGranularity(
      at({ from: "2026-10-01", to: "2026-10-05" }),
      "MONTH",
    ),
    "DAY",
  );
  assert.deepEqual(
    previousWindow(at({ from: "2026-09-01", to: "2026-09-30" }), "MONTH"),
    { from: "2026-08-01", to: "2026-08-31" },
  );
  assert.equal(
    previousWindowGranularity(
      at({ from: "2026-09-01", to: "2026-09-30" }),
      "MONTH",
    ),
    "MONTH",
  );
  // Month picker -> a full calendar month arrives as a DAY range (1st -> last
  // day). Its baseline is the previous WHOLE month so the label reads "vs Jun",
  // not the equal-length day-shifted "31 May - 30 Jun".
  assert.deepEqual(
    previousWindow(at({ from: "2026-07-01", to: "2026-07-31" }), "DAY"),
    { from: "2026-06-01", to: "2026-06-30" },
  );
  // Leap February stays a valid full month; its predecessor is January.
  assert.deepEqual(
    previousWindow(at({ from: "2024-02-01", to: "2024-02-29" }), "DAY"),
    { from: "2024-01-01", to: "2024-01-31" },
  );
  // A month-to-date partial (not the last day) is NOT a full month -> it keeps
  // the equal-length preceding window.
  assert.deepEqual(
    previousWindow(at({ from: "2026-07-01", to: "2026-07-05" }), "DAY"),
    { from: "2026-06-26", to: "2026-06-30" },
  );
});

test("C15: an undefinable baseline is null, so the UI blanks it", () => {
  // Open-ended ranges have no length, so no equal-length predecessor exists.
  // Returning null makes the card render blank rather than 0% or -100%.
  assert.equal(previousWindow(resolveDatePredicate({ from: "2026-07-01" }), "DAY"), null);
});

test("C15: baseline arithmetic crosses month and year boundaries", () => {
  assert.deepEqual(previousWindow(resolveDatePredicate({ date: "2026-03-01" }), "DAY"), {
    date: "2026-02-28",
  });
  assert.deepEqual(previousWindow(resolveDatePredicate({ date: "2026-01-01" }), "DAY"), {
    date: "2025-12-31",
  });
});

/* ---------------- C6 / C10 — anchors and de-duplication ---------------- */

test("C6: the anchor query resolves a latest date per section + kpi", () => {
  const sql = buildLatestDateQuery();
  assert.match(sql, /GROUP BY section, kpi_name/);
  assert.ok(sql.includes("granularity = 'DAY'"));
});

test("de-dup: additive rows collapse, rate rows are exempt", () => {
  const sql = buildFetchQuery({ context: CURING, date: "2026-07-16" });
  assert.ok(sql.includes("ROW_NUMBER() OVER"), "duplicates must be collapsed");
  assert.ok(
    sql.includes("__dedupe_rn = 1 OR kpi_name IN ('OEE_o'"),
    "rate KPIs must be exempt from the unproven collapse rule",
  );
  assert.ok(!sql.includes("SELECT *"), "the helper column must not leak");
});

/* -------- drill-aggregate — one result row per DISPLAYED row -------- */

test("drill-aggregate groups and sums server-side, so a page is N machines", () => {
  // The whole point: paging raw rows sliced (machine, DAY) records, so a page
  // of 25 rendered as ~6 machines and a machine's days could straddle the
  // boundary, showing a partial total on each page.
  const sql = buildDrillAggregateQuery({
    context: { section: "Curing", granularity: "DAY" },
    from: "2026-07-01",
    to: "2026-07-16",
    kpiName: "Production_m",
    groupBy: ["machine"],
    limit: 25,
    offset: 50,
  });
  assert.match(sql, /GROUP BY 1/);
  assert.ok(sql.includes("SUM(TRY_CAST(actual_value AS DOUBLE))"));
  assert.ok(sql.includes("SUM(TRY_CAST(threshold_value AS DOUBLE))"));
  assert.ok(sql.includes("kpi_name = 'Production_m'"));
  assert.ok(sql.includes("OFFSET 50 LIMIT 25"));
  // De-dup must run BEFORE the SUM or the shadow rows inflate every total.
  assert.ok(sql.indexOf("ROW_NUMBER() OVER") < sql.indexOf("GROUP BY"));
  assert.ok(sql.includes("__dedupe_rn = 1"));
});

test("drill-aggregate groups by both dimensions for the Machine + SKU lens", () => {
  const sql = buildDrillAggregateQuery({
    context: { section: "Mixing", granularity: "DAY" },
    date: "2026-07-16",
    kpiName: "Production_m_sku",
    groupBy: ["machine", "itemcode"],
  });
  assert.match(sql, /GROUP BY 1, 2/);
  assert.match(sql, /ORDER BY machine, itemcode/);
});

test("drill-aggregate drops machine-less rows from a machine lens", () => {
  // CTP's gold table carries Production_m rows with no machine; grouped,
  // they collapse into one anonymous bucket that belongs to no machine.
  const sql = buildDrillAggregateQuery({
    context: { section: "Mixing", granularity: "DAY" },
    date: "2026-07-16",
    kpiName: "Production_m",
    groupBy: ["machine"],
  });
  assert.match(sql, /NOT \(machine IS NULL OR LOWER\(machine\) = 'nan'/);
});

test("drill-aggregate leaves a SKU-only lens unfiltered by machine", () => {
  const sql = buildDrillAggregateQuery({
    context: { section: "Mixing", granularity: "DAY" },
    date: "2026-07-16",
    kpiName: "Production_sku",
    groupBy: ["itemcode"],
  });
  assert.ok(!sql.includes("NOT (machine IS NULL"));
});

test("drill-aggregate refuses a KPI that SUM would misaggregate", () => {
  // A rate KPI needs AVERAGE and a level KPI the latest day — summing either
  // yields a plausible, silently wrong number, so they are rejected outright.
  for (const kpiName of ["OEE_m", "Inventory_item", "Production"]) {
    assert.throws(
      () =>
        buildDrillAggregateQuery({
          context: { section: "Mixing" },
          date: "2026-07-16",
          kpiName,
          groupBy: ["machine"],
        }),
      QueryValidationError,
      `${kpiName} must not be summable`,
    );
  }
});

test("drill-aggregate rejects an unknown group-by column", () => {
  assert.throws(
    () =>
      buildDrillAggregateQuery({
        context: { section: "Mixing" },
        date: "2026-07-16",
        kpiName: "Production_m",
        groupBy: ["remarks"],
      }),
    QueryValidationError,
  );
  assert.throws(
    () =>
      buildDrillAggregateQuery({
        context: { section: "Mixing" },
        date: "2026-07-16",
        kpiName: "Production_m",
        groupBy: [],
      }),
    QueryValidationError,
  );
});

/* ------- landingKpis — fetch only the KPIs the grid actually renders ------- */

/**
 * The scan's WHERE clause only. The ORDER BY carries its own `kpi_name IN
 * (...)` priority CASE listing the OEE family, so a whole-SQL match cannot
 * tell a filter from a sort key.
 */
function scopeWhere(sql) {
  const stripped = stripGoldSourceUnion(sql);
  const start = stripped.indexOf(" WHERE ");
  const end = stripped.indexOf(") WHERE (__dedupe_rn");
  assert.ok(start > -1 && end > start, "unexpected query shape");
  return stripped.slice(start, end);
}

test("landingKpis narrows the landing band to the rendered KPIs", () => {
  const sql = buildFetchQuery({
    context: { section: "Mixing", granularity: "DAY" },
    date: "2026-07-16",
    landingKpis: ["OEE_o", "Production", "Plan_Compliance"],
  });
  assert.ok(
    sql.includes("kpi_name IN ('OEE_o', 'Production', 'Plan_Compliance')"),
    "the allow-list must reach the WHERE",
  );
  // The level gate still applies — the allow-list narrows the band, it does
  // not replace it, so a drill-level row sharing one of these names stays out.
  assert.ok(sql.includes("drill_down_level IN ('1', '1.0')"));
});

test("landingKpis unions with drillKpis rather than excluding them", () => {
  // C7: TBM/Curing ride `Production_product` on the landing payload, and it is
  // NOT in the grid catalogue. Intersecting would blank the Production card.
  const sql = buildFetchQuery({
    context: { section: "Curing", granularity: "DAY" },
    date: "2026-07-16",
    drillKpis: ["Production_product"],
    landingKpis: ["OEE_o", "Production"],
  });
  assert.ok(sql.includes("'Production_product'"), "the C7 KPI must survive");
  assert.ok(sql.includes("'OEE_o'") && sql.includes("'Production'"));
});

test("landingKpis is ignored under drillOnly, where drillKpis is tighter", () => {
  const sql = buildFetchQuery({
    context: { section: "Mixing", granularity: "DAY" },
    date: "2026-07-16",
    drillKpis: ["Production_m"],
    drillOnly: true,
    landingKpis: ["OEE_o", "Production"],
  });
  const where = scopeWhere(sql);
  assert.ok(where.includes("kpi_name IN ('Production_m')"));
  assert.ok(
    !where.includes("'OEE_o'"),
    "the landing allow-list must not widen a drill page",
  );
});

test("landingKpis omitted keeps every landing-level kpi_name", () => {
  const sql = buildFetchQuery({
    context: { section: "Mixing", granularity: "DAY" },
    date: "2026-07-16",
  });
  assert.ok(
    !/kpi_name IN/.test(scopeWhere(sql)),
    "no allow-list means no kpi_name filter",
  );
});

test("landingKpis rejects an empty array rather than returning nothing", () => {
  // [] would build `kpi_name IN ()` — invalid SQL, or worse, zero rows
  // presented as a real empty state. The client sends nothing instead.
  assert.throws(
    () =>
      buildFetchQuery({
        context: { section: "Mixing", granularity: "DAY" },
        date: "2026-07-16",
        landingKpis: [],
      }),
    QueryValidationError,
  );
  assert.throws(
    () =>
      buildFetchQuery({
        context: { section: "Mixing", granularity: "DAY" },
        date: "2026-07-16",
        landingKpis: Array.from({ length: 65 }, (_, i) => `K${i}`),
      }),
    QueryValidationError,
  );
});

/* ------- projection — only the columns a row needs to reach the UI -------- */

test("the response projection drops the columns no consumer reads", () => {
  const sql = buildFetchQuery({
    context: { section: "Mixing", granularity: "DAY" },
    date: "2026-07-16",
  });
  const outer = sql.slice(0, sql.indexOf(" FROM ("));
  for (const col of [
    "record_id",
    "plant",
    "department",
    "tyre_type",
    "production_ids",
    "previous_values",
    "plot_data",
  ]) {
    assert.ok(!outer.includes(col), `${col} must not be projected`);
  }
  for (const col of [
    "date",
    "section",
    "machine",
    "kpi_name",
    "actual_value",
    "threshold_value",
    "drill_down_attribute",
    "status",
    "remarks",
  ]) {
    assert.ok(outer.includes(col), `${col} is read by the UI and must survive`);
  }
  // The dedupe partition reads plant/department/remarks/status, so the INNER
  // scan must still carry them — narrowing the projection must not change
  // which duplicate row wins.
  assert.ok(sql.includes("PARTITION BY date, plant, department"));
});

test("buildShiftComparisonQuery: Banmore + Quality keeps a strict category='Quality' predicate", () => {
  const sql = buildShiftComparisonQuery({
    plantId: "banmore",
    section: "Curing",
    category: "Quality",
    date: "2026-07-16",
  });
  assert.match(
    sql,
    /category = 'Quality'/,
    "Banmore path must keep the strict Quality category filter",
  );
  assert.doesNotMatch(
    sql,
    /OR category = 'Scrap'/,
    "Banmore path must not widen to Scrap",
  );
});

test("buildShiftComparisonQuery: CTP + Quality widens to include Scrap (gold.ctp_gold vocabulary)", () => {
  // CTP's gold layer stores Scrap-family rows under category='Scrap'
  // while Banmore uses 'Quality'. The frontend always sends 'Quality'
  // for the shift-comparison Scrap/Rework charts; on CTP we widen the
  // predicate so the chart reflects the actual data instead of always
  // returning empty. Rework rows still don't exist at CTP — that's a
  // data-side gap, not a filter mismatch.
  const sql = buildShiftComparisonQuery({
    plantId: "chennai",
    section: "TBM",
    category: "Quality",
    date: "2026-08-30",
  });
  assert.match(
    sql,
    /\(category = 'Quality' OR category = 'Scrap'\)/,
    "CTP Quality must widen to Scrap",
  );
});

test("buildShiftComparisonQuery: CTP + non-Quality category keeps a strict predicate", () => {
  const sql = buildShiftComparisonQuery({
    plantId: "chennai",
    section: "Curing",
    category: "Productivity",
    date: "2026-07-16",
  });
  assert.match(sql, /category = 'Productivity'/);
  assert.doesNotMatch(sql, /OR category = 'Scrap'/);
});

test("section machines: production machine names since the lookback date", () => {
  const sql = buildSectionMachinesQuery({ sinceIso: "2026-07-01" });
  assert.match(sql, /^SELECT DISTINCT section, machine FROM /);
  assert.ok(sql.includes("kpi_name = 'Production_m'"));
  assert.ok(sql.includes("machine IS NOT NULL"));
  assert.ok(sql.includes("machine NOT IN ('', 'nan', 'null')"));
  assert.ok(sql.includes(">= '20260701'"));
  assert.match(sql, /ORDER BY section, machine$/);
});

test("section machines: scoped to the requested plant", () => {
  const banmore = buildSectionMachinesQuery({
    plantId: "banmore",
    sinceIso: "2026-07-01",
  });
  const other = buildSectionMachinesQuery({
    plantId: "chennai",
    sinceIso: "2026-07-01",
  });
  assert.notEqual(banmore, other);
});

test("section machines: rejects a missing or malformed lookback date", () => {
  assert.throws(() => buildSectionMachinesQuery(), QueryValidationError);
  assert.throws(
    () => buildSectionMachinesQuery({ sinceIso: "July" }),
    QueryValidationError,
  );
});
