/**
 * Unit tests for `toCtpInventoryMaster()` — see transformers.js and the
 * plan at .claude/plans/vast-enchanting-dijkstra.md.
 *
 * Pure: no network, no clock. Fixture rows + `assert.deepEqual` over the
 * master payload. Mirrors the offline pattern from quality/spc.test.js.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { toCtpInventoryMaster } from "./transformers.js";

/** Build one gold row. Tests pass these as the "rows" argument. */
function row(overrides) {
  return {
    date: "2026-07-16",
    section: "Stock",
    sub_section: "3 Roll",
    product_type: "Inner Liner",
    itemcode: "IL-001",
    tyre_type: "PCR",
    unit_of_measurement: "KG",
    kpi_name: "Inventory_item",
    actual_value: 100,
    ...overrides,
  };
}

test("toCtpInventoryMaster: empty input returns empty sections, data_limits flag absent sections", () => {
  const m = toCtpInventoryMaster([]);
  assert.equal(m.plant, "Chennai");
  assert.equal(m.plant_id, "chennai");
  assert.equal(m.sections.length, 0);
  assert.deepEqual(m.data_limits.sections_populated, []);
  assert.deepEqual(m.data_limits.sections_absent, [
    "Mixing",
    "Stock",
    "Tyre Building",
  ]);
  assert.equal(m.as_of, null);
  assert.equal(m.validation.lots, 0);
  assert.equal(m.validation.items, 0);
});

test("toCtpInventoryMaster: latest-date-wins per itemcode keeps the newest row", () => {
  const m = toCtpInventoryMaster([
    row({ date: "2026-07-10", actual_value: 50 }),
    row({ date: "2026-07-16", actual_value: 100 }),
    row({ date: "2026-07-12", actual_value: 75 }),
  ]);
  const item = m.sections[0].product_types[0].items[0];
  assert.equal(item.item_code, "IL-001");
  assert.equal(item.lots.length, 1);
  assert.equal(item.lots[0].quantity, 100);
  assert.equal(item.lots[0].production_date, "2026-07-16");
  assert.equal(m.validation.lots, 1);
  assert.equal(m.validation.expected_total_inventory, 100);
});

test("toCtpInventoryMaster: synthesises one READY lot per item with null mhe/age/expiry", () => {
  const m = toCtpInventoryMaster([row()]);
  const lot = m.sections[0].product_types[0].items[0].lots[0];
  assert.equal(lot.status, "READY");
  assert.equal(lot.mhe_code, null);
  assert.equal(lot.age_days, null);
  assert.equal(lot.expiry_date, null);
  assert.equal(lot.lot_id, "SYN-IL-001-20260716");
});

test("toCtpInventoryMaster: groups by section → product_type → item, sorted within each level", () => {
  const m = toCtpInventoryMaster([
    row({ section: "Stock", product_type: "Ply", itemcode: "P-2", date: "2026-07-16" }),
    row({ section: "Stock", product_type: "Ply", itemcode: "P-1", date: "2026-07-16" }),
    row({ section: "Stock", product_type: "Inner Liner", itemcode: "IL-A", date: "2026-07-16" }),
    row({ section: "Tyre Building", product_type: "Green Tyre", itemcode: "GT-1", date: "2026-07-16" }),
  ]);
  // Sections appear in canonical order (Mixing, Stock, Tyre Building).
  assert.deepEqual(m.sections.map((s) => s.name), ["Stock", "Tyre Building"]);
  // Stock accent is "tl" (teal) — matches the mock master.
  assert.equal(m.sections[0].accent, "tl");
  assert.equal(m.sections[1].accent, "bl");
  // product_types within Stock sorted alphabetically.
  assert.deepEqual(
    m.sections[0].product_types.map((p) => p.name),
    ["Inner Liner", "Ply"],
  );
  // items within Ply sorted by itemcode.
  assert.deepEqual(
    m.sections[0].product_types[1].items.map((i) => i.item_code),
    ["P-1", "P-2"],
  );
});

test("toCtpInventoryMaster: data_origin and data_limits reflect gold-only origin", () => {
  const m = toCtpInventoryMaster([row()]);
  assert.match(m.data_origin, /gold\.ctp_gold/);
  assert.match(m.data_origin, /lot-level facets absent/);
  assert.equal(m.data_limits.lot_synthesis, "READY");
  assert.equal(m.data_limits.mhe_count, null);
  assert.equal(m.data_limits.oldest_blocked_age, null);
  assert.equal(m.data_limits.daily_consumption, null);
});

test("toCtpInventoryMaster: as_of is max-date in IST +05:30 with 06:00:00 timestamp", () => {
  const m = toCtpInventoryMaster([
    row({ date: "2026-07-16", actual_value: 1 }),
    row({ itemcode: "IL-2", date: "2026-08-05", actual_value: 1 }),
  ]);
  assert.equal(m.as_of, "2026-08-05T06:00:00+05:30");
});

test("toCtpInventoryMaster: static config blocks are preserved (status_master, insight_cards, table, uom_display)", () => {
  const m = toCtpInventoryMaster([]);
  assert.equal(m.status_master.length, 5);
  assert.equal(m.status_master[0].key, "READY");
  assert.equal(m.status_master[3].key, "EXP");
  assert.equal(m.status_master[4].key, "HOLD");
  assert.equal(m.insight_cards.length, 4);
  assert.equal(m.insight_cards[0].id, "short_cover");
  assert.equal(m.insight_cards[3].type, "oldest_blocked");
  assert.deepEqual(m.table, {
    default_sort: { key: "READY", dir: "desc" },
    top_n: 10,
  });
  assert.deepEqual(m.uom_display, { MTR: "m", KG: "kg", NOS: "nos" });
});

test("toCtpInventoryMaster: validation.expected_total_inventory sums all lot quantities", () => {
  const m = toCtpInventoryMaster([
    row({ itemcode: "A", actual_value: 10 }),
    row({ itemcode: "B", actual_value: 20 }),
    row({ product_type: "Sidewall", itemcode: "C", actual_value: 5 }),
    row({ section: "Tyre Building", product_type: "Green Tyre", itemcode: "D", actual_value: 100 }),
  ]);
  assert.equal(m.validation.expected_total_inventory, 135);
  assert.equal(m.validation.expected_mhe_count, 0);
  assert.equal(m.validation.lots, 4);
  assert.equal(m.validation.items, 4);
});

test("toCtpInventoryMaster: missing or empty itemcode / product_type / section rows are dropped", () => {
  const m = toCtpInventoryMaster([
    row({ itemcode: "" }),
    row({ itemcode: "null" }),
    row({ product_type: "" }),
    row({ section: "" }),
    row(), // valid baseline row
  ]);
  assert.equal(m.validation.lots, 1);
});

test("toCtpInventoryMaster: bar rows (kpi_name='Inventory') do not emit lots", () => {
  // The SQL fetches BOTH Inventory and Inventory_item rows. Only
  // Inventory_item rows should appear as lots — the bar series is a
  // kpi_name='Inventory' row that carries product_type + qty but no
  // itemcode, and must be filtered out by the transformer.
  const m = toCtpInventoryMaster([
    row({ kpi_name: "Inventory", itemcode: "", actual_value: 999 }),
    row({ kpi_name: "Inventory_item", itemcode: "IL-1", actual_value: 10 }),
  ]);
  assert.equal(m.validation.lots, 1);
  assert.equal(m.sections[0].product_types[0].items[0].item_code, "IL-1");
  assert.equal(m.validation.expected_total_inventory, 10);
});

test("toCtpInventoryMaster: section_order is Mixing → Stock → Tyre Building; extra sections sort to end", () => {
  const m = toCtpInventoryMaster([
    row({ section: "Tyre Building", product_type: "Green Tyre", itemcode: "GT-1" }),
    row({ section: "Mixing", product_type: "Master Compound", itemcode: "MC-1" }),
    row({ section: "Stock", product_type: "Ply", itemcode: "P-1" }),
    row({ section: "Quality Lab", product_type: "Tensile", itemcode: "TL-1" }),
  ]);
  assert.deepEqual(
    m.sections.map((s) => s.name),
    ["Mixing", "Stock", "Tyre Building", "Quality Lab"],
  );
});

test("toCtpInventoryMaster: uom on the product_type is non-empty when any item carries a unit", () => {
  const m = toCtpInventoryMaster([
    row({ unit_of_measurement: "", actual_value: 1 }),
    row({ itemcode: "B", unit_of_measurement: "M", actual_value: 1 }),
  ]);
  const pt = m.sections[0].product_types[0];
  assert.equal(pt.uom, "M");
});

test("toCtpInventoryMaster: per-item tyre_type is preserved (filter key); product_type tyre_type is the first-seen value", () => {
  // The page filters lot facts on r.tt === f.tt, where r.tt is the
  // per-item `tyre_type`. The product_type-level `tyre_type` is
  // metadata for display only and uses the first row that created
  // the entry — a deliberate simplification (we don't roll up across
  // tyre_type when a product_type is mixed, which doesn't happen at
  // CTP today).
  const m = toCtpInventoryMaster([
    row({ itemcode: "A", tyre_type: "PCR", date: "2026-07-10" }),
    row({ itemcode: "B", tyre_type: "TBR", date: "2026-07-16" }),
  ]);
  const pt = m.sections[0].product_types[0];
  assert.equal(pt.items[0].tyre_type, "PCR");
  assert.equal(pt.items[1].tyre_type, "TBR");
  // Filter integrity: PCR selection keeps A only, TBR keeps B only.
  assert.equal(m.validation.lots, 2);
});
