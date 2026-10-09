/**
 * Unit tests for the deterministic cache preheater.
 *
 * Pure: no HTTP, no real `new Date()`. `periodWindows` is called with an
 * injected Date so the catalog is deterministic across timezones and
 * clock skew.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { periodWindows, staticCatalog } from "./preheater.js";

/* ---------------- periodWindows ---------------- */

test("periodWindows: month-to-date for the current month", () => {
  // Sept 7, 2026 → current Sept 1 → Sept 7
  const w = periodWindows(new Date(Date.UTC(2026, 8, 7)));
  assert.deepEqual(w.current, { from: "2026-09-01", to: "2026-09-07" });
});

test("periodWindows: full previous calendar month", () => {
  const w = periodWindows(new Date(Date.UTC(2026, 8, 7)));
  assert.deepEqual(w.prev, { from: "2026-08-01", to: "2026-08-31" });
});

test("periodWindows: crosses year boundary from January to December previous year", () => {
  const w = periodWindows(new Date(Date.UTC(2026, 0, 15)));
  assert.deepEqual(w.current, { from: "2026-01-01", to: "2026-01-15" });
  assert.deepEqual(w.prev, { from: "2025-12-01", to: "2025-12-31" });
});

test("periodWindows: February with 28 days gets Feb 28", () => {
  const w = periodWindows(new Date(Date.UTC(2025, 1, 5)));
  assert.deepEqual(w.current, { from: "2025-02-01", to: "2025-02-05" });
  assert.deepEqual(w.prev, { from: "2025-01-01", to: "2025-01-31" });
});

test("periodWindows: leap year February gets Feb 29", () => {
  const w = periodWindows(new Date(Date.UTC(2024, 1, 10)));
  assert.deepEqual(w.current, { from: "2024-02-01", to: "2024-02-10" });
  assert.deepEqual(w.prev, { from: "2024-01-01", to: "2024-01-31" });
});

/* ---------------- staticCatalog ---------------- */

const WIN = {
  current: { from: "2026-09-01", to: "2026-09-07" },
  prev: { from: "2026-08-01", to: "2026-08-31" },
};

test("staticCatalog: every target carries method=POST and a body", () => {
  const targets = staticCatalog("banmore", WIN);
  for (const t of targets) {
    assert.equal(t.method, "POST", "every preheat target is POST");
    assert.ok(t.body, "every POST target needs a body");
    assert.ok(typeof t.body === "object");
  }
});

test("staticCatalog: covers all 4 sections × 5 tabs × 2 periods × kpi-data", () => {
  // kpi-data: one target per (section, tab, period) — 4 × 5 × 2 = 40
  // shift-comparison: one per (section, period) — only p and q tabs, so
  //   for each period: 4 sections × 2 tabs = 8, doubled = 16
  // product-options: one per (section, tab, period) — 4 × 5 × 2 = 40
  // Grand total per plant: 40 + 16 + 40 = 96
  const targets = staticCatalog("banmore", WIN);
  const counts = { kpi: 0, shift: 0, productOptions: 0 };
  for (const t of targets) {
    if (t.path.endsWith("/kpi-data")) counts.kpi++;
    else if (t.path.endsWith("/shift-comparison")) counts.shift++;
    else if (t.path.endsWith("/product-options")) counts.productOptions++;
    else throw new Error(`unexpected path: ${t.path}`);
  }
  assert.equal(counts.kpi, 40);
  assert.equal(counts.shift, 16);
  assert.equal(counts.productOptions, 40);
  assert.equal(targets.length, 96);
});

test("staticCatalog: every kpi-data target carries withBaseline=true (baseline sibling gets one replay)", () => {
  const targets = staticCatalog("banmore", WIN);
  for (const t of targets) {
    if (!t.path.endsWith("/kpi-data")) continue;
    assert.equal(t.body.withBaseline, true, `${t.path} must ask for baseline`);
  }
});

test("staticCatalog: TBM/Curing P-tab includes extra drillKpis=[Production_product]", () => {
  const targets = staticCatalog("banmore", WIN);
  const tbmProd = targets.find(
    (t) =>
      t.path.endsWith("/kpi-data") &&
      t.body.context?.section === "TBM" &&
      t.body.context?.category === "Productivity",
  );
  assert.ok(tbmProd);
  assert.deepEqual(tbmProd.body.drillKpis, ["Production_product"]);

  const curingProd = targets.find(
    (t) =>
      t.path.endsWith("/kpi-data") &&
      t.body.context?.section === "Curing" &&
      t.body.context?.category === "Productivity",
  );
  assert.ok(curingProd);
  assert.deepEqual(curingProd.body.drillKpis, ["Production_product"]);
});

test("staticCatalog: Mixing/Stock do NOT pin product_type by default", () => {
  const targets = staticCatalog("banmore", WIN);
  for (const t of targets) {
    if (t.path.endsWith("/kpi-data")) continue;
    if (
      t.body.context?.section === "Mixing" ||
      t.body.context?.section === "Stock"
    ) {
      assert.equal(
        t.body.context.product_type,
        undefined,
        `${t.body.context.section} should not pin a product_type`,
      );
    }
  }
});

test("staticCatalog: TBM/Curing shift-comparison targets carry kpis + extraKpis", () => {
  const targets = staticCatalog("banmore", WIN);
  for (const t of targets) {
    if (!t.path.endsWith("/shift-comparison")) continue;
    if (t.body.context?.section === "TBM" || t.body.context?.section === "Curing") {
      assert.deepEqual(t.body.kpis, ["Production"]);
      assert.deepEqual(t.body.extraKpis, ["Production_product"]);
      assert.deepEqual(t.body.context.product_type, t.body.context.section === "TBM" ? "Green Tyre" : "Cured Tyre");
    }
  }
});

test("staticCatalog: Quality shift-comparison targets carry kpis=[Scrap, Rework] and no extraKpis", () => {
  const targets = staticCatalog("banmore", WIN);
  for (const t of targets) {
    if (!t.path.endsWith("/shift-comparison")) continue;
    if (t.body.category !== "Quality") continue;
    assert.deepEqual(t.body.kpis, ["Scrap", "Rework"]);
  }
});

test("staticCatalog: every kpi-data target uses the matching landingKpis catalogue", () => {
  const targets = staticCatalog("banmore", WIN);
  for (const t of targets) {
    if (!t.path.endsWith("/kpi-data")) continue;
    const section = t.body.context.section;
    const tab = (
      { Productivity: "p", Quality: "q", Cost: "c", Morale: "m", Safety: "s" }[
        t.body.context.category
      ]
    );
    const expected = {
      Mixing: {
        p: ["OEE_o", "Production", "Plan_Compliance"],
        q: ["FTQ", "Scrap", "Rework", "NCM_Hold"],
        c: ["Specific_Power", "Scrap_Cost", "Budget_Util"],
        m: ["Absenteeism", "TQM_Score", "Suggestions", "Training"],
        s: ["Reportable", "First_Aid", "Near_Miss", "Safety_Audit"],
      },
      TBM: {
        p: [
          "OEE_o",
          "Production",
          "Plan_Compliance",
          "Production_product",
          "Building_Fulfilled_Qty_sku",
          "Building_Planned_Qty_sku",
        ],
        q: ["FTQ", "Scrap", "Rework", "NCM_Hold"],
        c: ["Specific_Power", "Scrap_Cost", "Budget_Util"],
        m: ["Absenteeism", "TQM_Score", "Suggestions", "Training"],
        s: ["Reportable", "First_Aid", "Near_Miss", "Safety_Audit"],
      },
      Curing: {
        p: [
          "OEE_o",
          "Production",
          "Plan_Compliance",
          "Production_product",
          "Curing_Fulfilled_Qty_sku",
          "Curing_Planned_Qty_sku",
        ],
        q: ["FTQ", "Scrap", "Rework", "NCM_Hold"],
        c: ["Specific_Power", "Scrap_Cost", "Budget_Util"],
        m: ["Absenteeism", "TQM_Score", "Suggestions", "Training"],
        s: ["Reportable", "First_Aid", "Near_Miss", "Safety_Audit"],
      },
      Stock: {
        p: ["OEE_s", "Production", "Plan_Compliance"],
        q: ["FTQ", "Scrap", "Rework", "NCM_Hold"],
        c: ["Specific_Power", "Scrap_Cost", "Budget_Util"],
        m: ["Absenteeism", "TQM_Score", "Suggestions", "Training"],
        s: ["Reportable", "First_Aid", "Near_Miss", "Safety_Audit"],
      },
    }[section][tab];
    assert.deepEqual(
      t.body.landingKpis,
      expected,
      `${section}/${tab} catalogue mismatch`,
    );
  }
});

test("staticCatalog: no Inventory tab in phase 1", () => {
  const targets = staticCatalog("banmore", WIN);
  for (const t of targets) {
    if (t.path.endsWith("/kpi-data")) {
      assert.notEqual(t.body.context.category, "Inventory");
    }
    if (t.path.endsWith("/shift-comparison")) {
      assert.notEqual(t.body.category, "Inventory");
    }
  }
});

test("staticCatalog: parentFilters is always {} on kpi-data so the cache key is stable", () => {
  const targets = staticCatalog("banmore", WIN);
  for (const t of targets) {
    // Only kpi-data carries parentFilters; shift-comparison and
    // product-options don't accept it. Asserting {} on kpi-data keeps
    // the FE request and the preheat replay byte-identical.
    if (t.path.endsWith("/kpi-data")) {
      assert.deepEqual(t.body.parentFilters, {}, `unstable parentFilters on ${t.path}`);
    }
  }
});