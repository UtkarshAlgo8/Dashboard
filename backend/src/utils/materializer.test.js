import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  _resetForTests,
  _setForTests,
  lookupLanding,
  lookupDrill,
  lookupDrillAggregate,
  materializerStats,
} from "./materializer.js";

/**
 * Tests for the materializer's in-memory lookup paths. The query builder
 * is exercised by buildFetchQuery / buildDrillAggregateQuery's own tests;
 * here we focus on whether the JS predicates AGREE with the SQL — drift
 * here silently halves filtered rows or returns wrong totals.
 *
 * The rows are deliberately hand-shaped (no Athena round-trip) so a test
 * failure points at the materializer code, not the gold table.
 */

function row(overrides) {
  return {
    date: "2026-07-15",
    section: "Mixing",
    sub_section: null,
    machine: null,
    product_type: null,
    itemcode: null,
    granularity: "DAY",
    category: "Productivity",
    kpi_name: "OEE_o",
    unit_of_measurement: "%",
    drill_down_attribute: null,
    drill_down_level: 1,
    actual_value: 84.2,
    threshold_value: null,
    status: null,
    remarks: null,
    ...overrides,
  };
}

function seedBanmore(rows) {
  _setForTests("banmore", rows);
}

describe("materializer.lookupLanding", () => {
  beforeEach(() => _resetForTests());

  test("returns null when no data for the plant", () => {
    seedBanmore([]);
    const out = lookupLanding({ plantId: "banmore", context: { section: "Mixing", category: "Productivity", granularity: "DAY" } });
    assert.equal(out, null);
  });

  test("returns null when the requested section is absent", () => {
    seedBanmore([row({ section: "Mixing" })]);
    const out = lookupLanding({ plantId: "banmore", context: { section: "Stock", category: "Productivity", granularity: "DAY" } });
    assert.equal(out, null);
  });

  test("filters by section, category, and granularity in lockstep", () => {
    seedBanmore([
      row({ section: "Mixing", category: "Productivity", granularity: "DAY" }),
      row({ section: "Stock", category: "Productivity", granularity: "DAY" }),
      row({ section: "Mixing", category: "Quality", granularity: "DAY" }),
      row({ section: "Mixing", category: "Productivity", granularity: "MONTH" }),
    ]);
    const out = lookupLanding({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].section, "Mixing");
    assert.equal(out[0].category, "Productivity");
    assert.equal(out[0].granularity, "DAY");
  });

  test("respects the date window", () => {
    seedBanmore([
      row({ date: "2026-07-01", actual_value: 70 }),
      row({ date: "2026-07-15", actual_value: 80 }),
      row({ date: "2026-07-31", actual_value: 90 }),
    ]);
    const out = lookupLanding({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
      from: "2026-07-10",
      to: "2026-07-20",
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].date, "2026-07-15");
  });

  test("drill_down_level string '1' and '1.0' both pass through", () => {
    seedBanmore([
      row({ drill_down_level: "1", actual_value: 80 }),
      row({ drill_down_level: "1.0", actual_value: 90 }),
      row({ drill_down_level: "2", actual_value: 70 }),
    ]);
    const out = lookupLanding({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
    });
    // level-2 row is filtered out by the SQL predicate (cast to integer
    // and IN(1,2) — but the materializer doesn't apply that filter; it
    // relies on the buckets and the dashboard hook sending drillKpis to
    // isolate drill levels). Verify both '1' and '1.0' survive, since
    // that's the normalization that matters.
    assert.equal(out.length, 2);
    const values = out.map((r) => r.actual_value).sort();
    assert.deepEqual(values, [80, 90]);
  });

  test("unit_of_measurement spelling aliases fold together", () => {
    seedBanmore([
      row({ unit_of_measurement: "M", actual_value: 100 }),
      row({ unit_of_measurement: "Meters", actual_value: 110 }),
      row({ unit_of_measurement: "KG", actual_value: 120 }),
    ]);
    const out = lookupLanding({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY", unit_of_measurement: "M" },
    });
    // 'M' and 'Meters' match; 'KG' does not.
    assert.equal(out.length, 2);
    const values = out.map((r) => r.actual_value).sort();
    assert.deepEqual(values, [100, 110]);
  });

  test("empty unit_of_measurement filter accepts rows with empty unit", () => {
    seedBanmore([
      row({ unit_of_measurement: "%", actual_value: 100 }),
      row({ unit_of_measurement: null, actual_value: 110 }),
      row({ unit_of_measurement: "", actual_value: 120 }),
    ]);
    // Filter unit=undefined: SQL `WHERE unit_of_measurement IS NULL OR ...`
    // and the JS path skip-on-empty both return rows where the unit is empty.
    const out = lookupLanding({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
    });
    assert.equal(out.length, 3);
  });

  test("product_type pinning keeps aggregate + child rows when row is product-split", () => {
    seedBanmore([
      row({ kpi_name: "Production_product", product_type: "Passenger Radial", actual_value: 100 }),
      row({ kpi_name: "Production_product", product_type: "LCV", actual_value: 50 }),
      row({ kpi_name: "OEE_o", product_type: "Passenger Radial", actual_value: 90 }),
      row({ kpi_name: "OEE_o", product_type: null, actual_value: 80 }),
    ]);
    const out = lookupLanding({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY", product_type: "Passenger Radial" },
    });
    // PRODUCT_SPLIT_KPI (Production_product) hard-pins: only "Passenger Radial" matches (1 row).
    // PRODUCT_AGNOSTIC (OEE_o) lenient: "Passenger Radial" + empty both match (2 rows).
    // Total: 3 rows.
    assert.equal(out.length, 3);
    // Sort the same way the implementation does (lexicographic, ascending).
    const kpiTypes = out
      .map((r) => `${r.kpi_name}:${r.product_type ?? "null"}`)
      .sort();
    assert.deepEqual(kpiTypes, [
      "OEE_o:Passenger Radial",
      "OEE_o:null",
      "Production_product:Passenger Radial",
    ]);
  });

  test("tyre_type 'All' places no restriction", () => {
    seedBanmore([
      row({ tyre_type: "PCR", actual_value: 100 }),
      row({ tyre_type: "TBR", actual_value: 110 }),
      row({ tyre_type: "Both", actual_value: 120 }),
    ]);
    const out = lookupLanding({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY", tyre_type: "All" },
    });
    assert.equal(out.length, 3);
  });

  test("landingKpis narrows the kpi set", () => {
    seedBanmore([
      row({ kpi_name: "OEE_o", actual_value: 80 }),
      row({ kpi_name: "Production", actual_value: 90 }),
      row({ kpi_name: "Downtime", actual_value: 100 }),
    ]);
    const out = lookupLanding({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
      landingKpis: ["OEE_o", "Production"],
    });
    assert.equal(out.length, 2);
    const kpis = out.map((r) => r.kpi_name).sort();
    assert.deepEqual(kpis, ["OEE_o", "Production"]);
  });
});

describe("materializer.lookupDrill", () => {
  beforeEach(() => _resetForTests());

  test("drillOnly restricts to kpi_name IN drillKpis", () => {
    seedBanmore([
      row({ kpi_name: "OEE_o", actual_value: 80 }),
      row({ kpi_name: "OEE_m", actual_value: 75 }),
      row({ kpi_name: "Availability_o", actual_value: 92 }),
    ]);
    const out = lookupDrill({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
      drillKpis: ["OEE_o", "OEE_m"],
    });
    assert.equal(out.length, 2);
    const kpis = out.map((r) => r.kpi_name).sort();
    assert.deepEqual(kpis, ["OEE_m", "OEE_o"]);
  });

  test("parentFilters apply on drill payloads", () => {
    seedBanmore([
      row({ machine: "0201", kpi_name: "OEE_m", actual_value: 80 }),
      row({ machine: "0202", kpi_name: "OEE_m", actual_value: 75 }),
    ]);
    const out = lookupDrill({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
      drillKpis: ["OEE_m"],
      parentFilters: { machine: "0201" },
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].machine, "0201");
  });
});

describe("materializer.lookupDrillAggregate", () => {
  beforeEach(() => _resetForTests());

  test("SUMs actual_value per groupBy key", () => {
    seedBanmore([
      row({ machine: "0201", kpi_name: "Production_m", actual_value: 100 }),
      row({ machine: "0201", kpi_name: "Production_m", actual_value: 50 }),
      row({ machine: "0202", kpi_name: "Production_m", actual_value: 200 }),
    ]);
    const out = lookupDrillAggregate({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
      kpiName: "Production_m",
      groupBy: ["machine"],
    });
    assert.equal(out.length, 2);
    const by0201 = out.find((r) => r.machine === "0201");
    const by0202 = out.find((r) => r.machine === "0202");
    assert.equal(by0201.actual_value, 150);
    assert.equal(by0202.actual_value, 200);
  });

  test("returns null when the materializer has no rows for the plant", () => {
    seedBanmore([]);
    const out = lookupDrillAggregate({
      plantId: "banmore",
      context: { section: "Mixing" },
      kpiName: "Production_m",
      groupBy: ["machine"],
    });
    assert.equal(out, null);
  });

  test("only sums rows with the requested kpi_name", () => {
    seedBanmore([
      row({ machine: "0201", kpi_name: "Production_m", actual_value: 100 }),
      row({ machine: "0201", kpi_name: "OEE_o", actual_value: 80 }),
    ]);
    const out = lookupDrillAggregate({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
      kpiName: "Production_m",
      groupBy: ["machine"],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].actual_value, 100);
  });

  test("filters by date window", () => {
    seedBanmore([
      row({ date: "2026-07-01", machine: "0201", kpi_name: "Production_m", actual_value: 100 }),
      row({ date: "2026-07-15", machine: "0201", kpi_name: "Production_m", actual_value: 200 }),
      row({ date: "2026-07-31", machine: "0201", kpi_name: "Production_m", actual_value: 300 }),
    ]);
    const out = lookupDrillAggregate({
      plantId: "banmore",
      context: { section: "Mixing", category: "Productivity", granularity: "DAY" },
      kpiName: "Production_m",
      groupBy: ["machine"],
      from: "2026-07-10",
      to: "2026-07-20",
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].actual_value, 200);
  });
});

describe("materializer.stats", () => {
  beforeEach(() => _resetForTests());

  test("reports zero plants when nothing is materialized", () => {
    const s = materializerStats();
    assert.equal(s.enabled, true);
    assert.deepEqual(s.plants, []);
  });

  test("reports per-plant row counts after seeding", () => {
    seedBanmore([row(), row(), row()]);
    const s = materializerStats();
    assert.equal(s.plants.length, 1);
    assert.equal(s.plants[0].plantId, "banmore");
    assert.equal(s.plants[0].rows, 3);
  });
});

describe("materialize-query", () => {
  test("buildMaterializePullQuery targets banmore by default", async () => {
    const { buildMaterializePullQuery } = await import(
      "../queries/materialize-query.js"
    );
    const sql = buildMaterializePullQuery({ plantId: "banmore", windowDays: 60, levels: [1, 2] });
    assert.match(sql, /FROM gold\.gold/);
    assert.match(sql, /UPPER\(plant\) = 'BANMORE'/);
    assert.match(sql, /CAST\(CAST\(drill_down_level AS DOUBLE\) AS INTEGER\) IN \(1, 2\)/);
    assert.match(sql, /ROW_NUMBER\(\) OVER \(PARTITION BY .+ ORDER BY actual_value DESC\)/);
  });

  test("buildMaterializePullQuery targets chennai with the ctp table", async () => {
    const { buildMaterializePullQuery } = await import(
      "../queries/materialize-query.js"
    );
    const sql = buildMaterializePullQuery({ plantId: "chennai", windowDays: 60, levels: [1, 2] });
    assert.match(sql, /FROM gold\.ctp_gold/);
    assert.match(sql, /UPPER\(plant\) = 'CHENNAI'/);
  });

  test("rejects unknown plant ids", async () => {
    const { buildMaterializePullQuery } = await import(
      "../queries/materialize-query.js"
    );
    assert.throws(() =>
      buildMaterializePullQuery({ plantId: "laksar", windowDays: 60, levels: [1] }),
    );
  });
});