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
  buildFetchQuery,
  buildLatestDateQuery,
  previousWindow,
  resolveDatePredicate,
  resolveGranularity,
  QueryValidationError,
  NO_DATA,
} from "./dashboard-query.js";
import { normalizeUnit, unitPredicate } from "../utils/normalize.js";

const CURING = { section: "Curing", granularity: "DAY" };

/** Extract the YYYYMMDD date comparisons a built query emits. */
function dateLiterals(sql) {
  return [...sql.matchAll(/END\) (=|>=|<=) '(\d{8})'/g)].map(
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
