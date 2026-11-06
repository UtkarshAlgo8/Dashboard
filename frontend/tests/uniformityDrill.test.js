import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  appendUniformityPoints,
  compareUniformityCells,
  INITIAL_UNIFORMITY_NAV,
  overallUniformityFamily,
  recordedClockMillis,
  technicalUniformityPeriod,
  uniformityCard,
  uniformityLevel,
  uniformityNavigation,
  uniformityPeriod,
} from "../src/lib/uniformityDrill.js";

const f = {
  preset: "today",
  from: "2026-01-01",
  to: "2026-01-31",
  shift: "B",
  today: "2026-01-31",
};
test("drill period differs from existing trend windows: stored months and weighted DAY ranges", () => {
  assert.deepEqual(uniformityPeriod(f), {
    period: "day",
    from: "2026-01-31",
    to: "2026-01-31",
    shift: "B",
  });
  assert.deepEqual(
    uniformityPeriod({
      ...f,
      preset: "month",
      to: "2026-02-28",
      from: "2026-02-01",
      today: "2026-02-10",
    }),
    { period: "month", from: "2026-02-01", to: "2026-02-10", shift: "ALL" },
  );
  assert.equal(uniformityPeriod({ ...f, preset: "custom" }).period, "range");
  assert.equal(uniformityPeriod({ ...f, preset: "year" }).period, "year");
  assert.equal(uniformityPeriod({ ...f, preset: "day" }).from, f.to);
});
test("Technical drill uses selected range, month, snapshot day and shift without collapsing ranges", () => {
  assert.deepEqual(
    technicalUniformityPeriod(
      {
        from: "2026-01-02",
        to: "2026-01-20",
        mode: "aggregate",
        granularity: "DAY",
      },
      "all",
    ),
    { period: "range", from: "2026-01-02", to: "2026-01-20", shift: "ALL" },
  );
  assert.deepEqual(
    technicalUniformityPeriod(
      {
        from: "2026-01-01",
        to: "2026-01-20",
        mode: "snapshot",
        granularity: "MONTH",
      },
      "all",
    ),
    { period: "month", from: "2026-01-01", to: "2026-01-20", shift: "ALL" },
  );
  assert.deepEqual(
    technicalUniformityPeriod(
      {
        from: "2026-01-13",
        to: "2026-01-20",
        mode: "snapshot",
        granularity: "DAY",
      },
      "b",
    ),
    { period: "day", from: "2026-01-20", to: "2026-01-20", shift: "B" },
  );
  assert.equal(
    technicalUniformityPeriod(
      {
        from: "2026-01-02",
        to: "2026-01-20",
        mode: "aggregate",
        granularity: "DAY",
      },
      "a",
    ),
    null,
  );
  assert.equal(
    technicalUniformityPeriod({ from: null, to: null }, "all"),
    null,
  );
});

test("Overall yield bridge accepts only the five explicit family rows regardless of leaf metadata", () => {
  const families = [
    "Mtms_Uniformity_Yield",
    "Tuo_Uniformity_Yield",
    "Zf_Uniformity_Yield",
    "Zf_Balancing_Yield_o",
    "Dbm_Balancing_Yield",
  ];
  const expectedCards = ["mtms", "tuo", "zf-uniformity", "zf-balancing", "dbm"];
  for (const [i, family] of families.entries()) {
    assert.equal(uniformityCard(family).id, expectedCards[i]);
    for (const drill_down of [null, { is_leaf: true, children: [] }]) {
      const row = { kpi_name: family, machine: null, drill_down };
      assert.equal(
        overallUniformityFamily("Overall_Production_Yield", families, row),
        family,
      );
      assert.equal(
        overallUniformityFamily("Overall_Uniformity_Production", families, row),
        null,
      );
      assert.equal(
        overallUniformityFamily("Overall_Production_Yield", ["other"], row),
        null,
      );
      assert.equal(
        overallUniformityFamily("Overall_Production_Yield", families, {
          ...row,
          machine: "M",
        }),
        null,
      );
    }
  }
  assert.equal(
    overallUniformityFamily("Overall_Production_Yield", ["__proto__"], {
      kpi_name: "__proto__",
      machine: null,
    }),
    null,
  );
});

test("navigation is machine -> SKU -> parameter -> clicked failures, with correct back/page reset", () => {
  let state = INITIAL_UNIFORMITY_NAV;
  assert.equal(uniformityLevel(state), "machine");
  state = uniformityNavigation(state, { type: "machine", value: "M" });
  assert.equal(uniformityLevel(state), "sku");
  state = uniformityNavigation(state, { type: "sku", value: "S" });
  assert.equal(uniformityLevel(state), "parameter");
  state = uniformityNavigation(state, {
    type: "barcodes",
    value: "RFV CW",
    expected: 8,
  });
  assert.equal(uniformityLevel(state), "barcodes");
  state = uniformityNavigation(state, { type: "page", value: 100 });
  state = uniformityNavigation(state, { type: "back", index: 3 });
  assert.equal(state.sku, "S");
  assert.equal(state.parameter, null);
  assert.equal(state.offset, 0);
  state = uniformityNavigation(state, { type: "back", index: 2 });
  assert.equal(state.machine, "M");
  assert.equal(state.sku, null);
  state = uniformityNavigation(state, { type: "back", index: 1 });
  assert.deepEqual(state, INITIAL_UNIFORMITY_NAV);
  assert.equal(uniformityCard("Mtms_Uniformity_Yield").plot, true);
  assert.equal(uniformityCard("Dbm_Balancing_Yield").plot, true);
  for (const kpi of [
    "Zf_Uniformity_Yield",
    "Zf_Balancing_Yield_o",
    "Tuo_Uniformity_Yield",
  ])
    assert.equal(uniformityCard(kpi).plot, false);
  for (const kpi of [
    "Paint_Wt_Within3_Pct_overall",
    "Scrap",
    "Overall_Production_Yield",
  ])
    assert.equal(uniformityCard(kpi), null);
});
test("barcode sorting compares recorded wall clocks and full identifiers, with explicit missing values", () => {
  const compareTime = (a, b) => compareUniformityCells("barcodes", a, b, 1);
  const compareBarcode = (a, b) => compareUniformityCells("barcodes", a, b, 0);
  assert.ok(
    compareTime("2026-11-05 23:30:00-04:00", "2026-11-05 10:00:00+05:30") > 0,
  );
  assert.ok(compareTime("2026-11-01 08:00:00", "2026-11-05 10:00:00") < 0);
  assert.equal(
    compareTime("2026-11-05 10:00:00+05:30", "2026-11-05 10:00:00-04:00"),
    0,
  );
  assert.ok(compareBarcode("A-2", "B-10") < 0);
  assert.ok(compareBarcode("Z-1", "A-2") > 0);
  assert.ok(compareTime(null, "2026-11-01 08:00:00") < 0);
  assert.ok(compareBarcode("A-2", null) > 0);
  assert.equal(compareBarcode(null, ""), 0);
  assert.equal(compareUniformityCells("barcodes", "10", "2", 3), undefined);
  assert.equal(compareUniformityCells("barcodes", "10", "2", 4), undefined);
  assert.ok(compareUniformityCells("machine", "alpha", "beta", 0) < 0);
});

test("raw plot preserves recorded clocks, null-vs-zero correctness, complete pages and source changes", () => {
  assert.equal(
    recordedClockMillis("2026-01-31 07:00:00+05:30"),
    Date.UTC(2026, 0, 31, 7),
  );
  assert.equal(
    recordedClockMillis("2026-01-31T07:00:00-04:00"),
    Date.UTC(2026, 0, 31, 7),
  );
  assert.equal(
    recordedClockMillis("2026-02-01 00:00:00.125"),
    Date.UTC(2026, 1, 1, 0, 0, 0, 125),
  );
  const r = { barcode: "B", test_time: "2026-01-31 07:00:00", actual_value: 0 };
  const first = appendUniformityPoints(
    { rows: [], total: null },
    { offset: 0, total: 2, rows: [r], has_more: true },
  );
  assert.equal(first.rows[0].actual_value, 0);
  assert.throws(
    () => appendUniformityPoints(first, { offset: 1, total: 2, rows: [r] }),
    /Overlapping/,
  );
  assert.throws(
    () => appendUniformityPoints(first, { offset: 1, total: 3, rows: [] }),
    /source changed/,
  );
  assert.throws(
    () => appendUniformityPoints(first, { offset: 2, total: 2, rows: [] }),
    /source changed/,
  );
  assert.throws(
    () => appendUniformityPoints(first, { truncated: true }),
    /incomplete/,
  );
  assert.throws(
    () =>
      appendUniformityPoints(
        { rows: [], total: null },
        { offset: 0, total: 1, rows: [{ ...r, actual_value: null }] },
      ),
    /Invalid/,
  );
});
function apiWith(client) {
  const path = new URL("../src/api/uniformity.js", import.meta.url);
  const source = readFileSync(path, "utf8")
    .replace(/import client from [^;]+;/, "")
    .replace("export function getUniformityPage", "function getUniformityPage");
  const context = {
    client,
    Map,
    Date,
    Object,
    URLSearchParams,
    Promise,
    Error,
  };
  vm.runInNewContext(source + "\nthis.getPage = getUniformityPage;", context);
  return context.getPage;
}
test("network: no preload, one exact page, concurrent dedup, isolated context keys, error retry", async () => {
  let resolve;
  const urls = [];
  const get = apiWith({
    get(url) {
      urls.push(url);
      return new Promise((r) => {
        resolve = r;
      });
    },
  });
  assert.equal(urls.length, 0);
  const scope = {
    card: "mtms",
    period: "day",
    from: "2026-01-31",
    to: "2026-01-31",
    shift: "ALL",
    level: "machine",
    offset: 0,
    limit: 100,
  };
  const a = get("gold", scope),
    b = get("gold", { ...scope });
  assert.equal(a, b);
  assert.equal(urls.length, 1);
  resolve({ rows: [], total: 0 });
  await a;
  await get("gold", scope);
  assert.equal(urls.length, 1);
  const next = get("gold", { ...scope, level: "sku", machine: "M'quoted" });
  assert.equal(urls.length, 2);
  assert.ok(urls[1].includes("machine=M%27quoted"));
  resolve({ rows: [] });
  await next;
  const points = get("points", {
    ...scope,
    machine: "M",
    sku: "S",
    parameter: "RFV CW",
    offset: 1000,
    limit: 1000,
  });
  assert.equal(urls.length, 3);
  assert.ok(urls[2].includes("offset=1000"));
  assert.ok(urls[2].includes("/points?"));
  resolve({ rows: [] });
  await points;
  let attempts = 0;
  const retry = apiWith({
    async get() {
      if (++attempts === 1) throw new Error("fixture error");
      return { rows: [] };
    },
  });
  await assert.rejects(retry("gold", scope), /fixture error/);
  await retry("gold", scope);
  assert.equal(attempts, 2);
  const incomplete = apiWith({
    async get() {
      return { rows: [], truncated: true };
    },
  });
  await assert.rejects(incomplete("gold", scope), /incomplete page/);
});
test("frontend network work is bounded to two active pages, including rapid scope changes", async () => {
  let active = 0,
    peak = 0;
  const releases = [];
  const get = apiWith({
    get() {
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve) =>
        releases.push(() => {
          active--;
          resolve({ rows: [] });
        }),
      );
    },
  });
  const pages = [0, 1, 2, 3].map((offset) =>
    get("gold", { card: "mtms", offset }),
  );
  assert.equal(active, 2);
  releases.shift()();
  await pages[0];
  await Promise.resolve();
  assert.equal(active, 2);
  releases.shift()();
  await pages[1];
  await Promise.resolve();
  releases.shift()();
  releases.shift()();
  await Promise.all(pages);
  assert.equal(peak, 2);
  assert.equal(active, 0);
});

test("integration wiring retains unrelated trends/cards; raw fetch only inside mounted plot; stale guards", () => {
  const page = readFileSync(
    new URL("../src/pages/quality/QualityDashboard.jsx", import.meta.url),
    "utf8",
  );
  for (const retained of [
    "<UniformityTrendModal",
    "<LivePaintWeightDrillPanel",
    "<LiveCuringScrapDrillPanel",
  ])
    assert.ok(page.includes(retained));
  assert.ok(!page.includes("<UniformityDrillPanel"));
  const technical = readFileSync(
    new URL(
      "../src/components/technical/TechnicalUniformityBalancingSection.jsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(technical.includes("<UniformityDrillPanel"));
  assert.ok(technical.includes("uniformityCard(definition.sourceKpi)"));
  const technicalPage = readFileSync(
    new URL("../src/pages/BanmoreTechnical.jsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    technicalPage.includes("technicalUniformityPeriod(dateWindow, shift)"),
  );
  const panel = readFileSync(
    new URL(
      "../src/components/quality/UniformityDrillPanel.jsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(panel, /nav\.plot &&/);
  assert.match(panel, /card\.plot/);
  assert.match(panel, /card\.id === "tuo"/);
  const hook = readFileSync(
    new URL("../src/hooks/useUniformityPage.js", import.meta.url),
    "utf8",
  );
  assert.match(hook, /cancelled = true/);
  assert.match(hook, /result\?\.key === key/);
  const plot = readFileSync(
    new URL("../src/components/quality/UniformityRawPlot.jsx", import.meta.url),
    "utf8",
  );
  assert.match(plot, /zooming: \{ type: "x" \}/);
  assert.match(plot, /palette\.error\.main/);
  assert.match(plot, /DISPLAY_LIMIT = 20000/);
});
