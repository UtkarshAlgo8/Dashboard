/**
 * Acceptance tests — new_change.md "Verification values".
 *
 * These query the REAL gold table through the real query builder, so they
 * catch the class of defect the spec is about: a query that returns a
 * plausible-looking number that is silently 2x or 3.21x too large.
 *
 * Skipped automatically when upstream credentials are absent (CI without
 * secrets), so `npm test` stays green offline.
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

let buildFetchQuery, runQuery;
let available = true;
try {
  ({ buildFetchQuery } = await import("../src/queries/dashboard-query.js"));
  ({ runQuery } = await import("../src/utils/upstream.js"));
} catch {
  available = false; // missing AWS_DATA_* env — nothing to talk to
}

const skip = available ? false : "upstream credentials not configured";

const NOS = (granularity) => ({
  section: "Curing",
  granularity,
  unit_of_measurement: "NOS",
});

/** Sum actual_value for one kpi_name out of a built-and-executed query. */
async function fetchSum(args, kpiName) {
  const rows = await runQuery(buildFetchQuery({ ...args, limit: 10000 }));
  return rows
    .filter((r) => r.kpi_name === kpiName)
    .map((r) => (r.actual_value == null ? null : Number(r.actual_value)))
    .filter((v) => v != null && Number.isFinite(v))
    .reduce((a, b) => a + b, 0);
}

/* ---------------- Cards: granularity pinning (C1 + C2) ---------------- */

test("Curing Production 1-16 July = 301,530", { skip }, async () => {
  // The three failure modes this guards: 603,060 (DAY+SHIFT, C2),
  // 967,407 (DAY+SHIFT+MONTH, C2), 721,497 (duplicate rows, de-dup).
  const got = await fetchSum(
    { context: NOS("DAY"), from: "2026-07-01", to: "2026-07-16" },
    "Production",
  );
  assert.equal(got, 301530);
});

test("Curing Production 2026-07-16 = 22,300", { skip }, async () => {
  const got = await fetchSum({ context: NOS("DAY"), date: "2026-07-16" }, "Production");
  assert.equal(got, 22300);
});

/* ---------------- Shift-wise (C11 + C13) ---------------- */

test("shift totals over 1-16 July match, and re-sum to the day total", { skip }, async () => {
  const range = { from: "2026-07-01", to: "2026-07-16" };
  const expected = { "SHIFT A": 101348, "SHIFT B": 99127, "SHIFT C": 101055 };

  let total = 0;
  for (const [shift, want] of Object.entries(expected)) {
    const got = await fetchSum({ context: NOS(shift), ...range }, "Production");
    assert.equal(got, want, `${shift} over the range`);
    total += got;
  }
  // C13: A + B + C == DAY. Drift here signals a shift-window or date
  // attribution change in the ETL.
  assert.equal(total, 301530, "A + B + C must equal the DAY total");
});

test("C13: A + B + C == DAY on 2026-07-16", { skip }, async () => {
  const perShift = {};
  for (const shift of ["SHIFT A", "SHIFT B", "SHIFT C"]) {
    perShift[shift] = await fetchSum(
      { context: NOS(shift), date: "2026-07-16" },
      "Production",
    );
  }
  assert.deepEqual(perShift, {
    "SHIFT A": 7702,
    "SHIFT B": 6760,
    "SHIFT C": 7838,
  });
  const day = await fetchSum({ context: NOS("DAY"), date: "2026-07-16" }, "Production");
  assert.equal(
    perShift["SHIFT A"] + perShift["SHIFT B"] + perShift["SHIFT C"],
    day,
  );
});

/* ---------------- Product-wise (C4 + C7) ---------------- */

test("product-wise Production changes with the selection", { skip }, async () => {
  // The bug this guards: every product selection showed the overall figure,
  // because `Production` carries only the overall row in TBM/Curing.
  const cases = [
    ["Curing", "Cured Tyre", 22300],
    ["Curing", "Passenger Radial", 14785],
    ["Curing", "LCV", 3869],
    ["Curing", "Unknown", 3646],
    ["TBM", "Green Tyre", 23947],
    ["TBM", "Passenger Radial", 16084],
    ["TBM", "LCV", 4005],
    ["TBM", "Unknown", 3858],
  ];

  for (const [section, product, want] of cases) {
    const got = await fetchSum(
      {
        context: { section, granularity: "DAY", product_type: product },
        date: "2026-07-16",
        drillKpis: ["Production_product"],
        drillOnly: true,
      },
      "Production_product",
    );
    assert.equal(got, want, `${section} / ${product}`);
  }
});

/* ---------------- Per-KPI anchors + partial days (C6 + C14) ---------------- */

test("C6: each KPI anchors to its own latest date, not a global one", { skip }, async () => {
  // A single global latest (2026-07-20, from Production) matches zero OEE rows
  // in every section — blank card, dead drill. Each KPI must use its own.
  const { buildLatestDateQuery } = await import("../src/queries/dashboard-query.js");
  const rows = await runQuery(buildLatestDateQuery());

  const anchors = {};
  for (const r of rows) {
    const s = String(r.latest_date ?? "");
    if (/^\d{8}$/.test(s)) {
      anchors[`${r.section}|${r.kpi_name}`] =
        `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
  }

  assert.equal(anchors["Curing|OEE_o"], "2026-07-16", "Curing OEE lags furthest");
  for (const section of ["Mixing", "Stock", "TBM"]) {
    assert.equal(anchors[`${section}|OEE_o`], "2026-07-17");
    assert.equal(anchors[`${section}|Production`], "2026-07-20");
  }
  assert.notEqual(
    anchors["Curing|OEE_o"],
    anchors["Curing|Production"],
    "the lag is exactly why a global date fails",
  );
});

test("C14: the latest day is flagged partial while shifts are incomplete", { skip }, async () => {
  const { buildShiftCoverageQuery, buildLatestDateQuery } = await import(
    "../src/queries/dashboard-query.js"
  );
  const toIso = (v) => {
    const s = String(v ?? "");
    return /^\d{8}$/.test(s)
      ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
      : null;
  };

  const [anchorRows, coverage] = await Promise.all([
    runQuery(buildLatestDateQuery()),
    runQuery(buildShiftCoverageQuery()),
  ]);
  const latest = {};
  for (const r of anchorRows) {
    if (r.kpi_name === "Production") latest[r.section] = toIso(r.latest_date);
  }

  const partial = {};
  for (const r of coverage) {
    const iso = toIso(r.day);
    if (iso && Number(r.shift_count) < 3 && latest[r.section] === iso) {
      partial[`${r.section}|${iso}`] = Number(r.shift_count);
    }
  }

  // 2026-07-20 is in progress: SHIFT A and SHIFT C present, SHIFT B absent.
  // Comparing it against a full previous day gives about -75%, a pure artefact.
  assert.equal(partial["Curing|2026-07-20"], 2);
  // Older days with sparse shifts are MISSING data, not in-progress days, and
  // must not be flagged — Stock has such gaps going back to 2024.
  assert.ok(!Object.keys(partial).some((k) => k.includes("2024")));
});

/* ---------------- Spike baseline (C15 + C16) ---------------- */

test("C15: day-wise spike compares the same shift on the previous day", { skip }, async () => {
  const { previousWindow, resolveDatePredicate } = await import(
    "../src/queries/dashboard-query.js"
  );
  // Spec: 19 July vs 18 July, Curing, overall, NOS.
  const cases = [
    ["SHIFT A", 6368, 5279, 20.6],
    ["SHIFT B", 6806, 5257, 29.5],
    ["SHIFT C", 6031, 5802, 3.9],
  ];

  for (const [shift, wantCurrent, wantBaseline, wantSpike] of cases) {
    const context = NOS(shift);
    const window = previousWindow(
      resolveDatePredicate({ date: "2026-07-19" }),
      shift,
    );
    // C16: only the date window moves — every other pin is reused verbatim.
    const current = await fetchSum({ context, date: "2026-07-19" }, "Production");
    const baseline = await fetchSum({ context, ...window }, "Production");

    assert.equal(current, wantCurrent, `${shift} current`);
    assert.equal(baseline, wantBaseline, `${shift} baseline`);
    const spike = ((current - baseline) / Math.abs(baseline)) * 100;
    assert.ok(
      Math.abs(spike - wantSpike) < 0.05,
      `${shift} spike ${spike.toFixed(1)}% != ${wantSpike}%`,
    );
  }
});

test("C4: the aggregate product equals the sum of its children", { skip }, async () => {
  // Never ADD the aggregate to its children — that is the 2x drill bug.
  const read = (product) =>
    fetchSum(
      {
        context: { section: "Curing", granularity: "DAY", product_type: product },
        date: "2026-07-16",
        drillKpis: ["Production_product"],
        drillOnly: true,
      },
      "Production_product",
    );

  const [aggregate, passenger, lcv, unknown] = await Promise.all([
    read("Cured Tyre"),
    read("Passenger Radial"),
    read("LCV"),
    read("Unknown"),
  ]);
  assert.equal(passenger + lcv + unknown, aggregate);
});
