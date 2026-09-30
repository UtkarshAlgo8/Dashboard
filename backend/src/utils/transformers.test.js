/**
 * Unit tests for `toCtpInventoryMaster()` — see transformers.js and the
 * KPI → FE mapping in docs/Inventory_Mapping_Final.xlsx.
 *
 * Pure: no network, no clock. Fixture rows + `assert.deepEqual` over the
 * master payload. Mirrors the offline pattern from quality/spc.test.js.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  toCtpInventoryMaster,
  CTP_INVENTORY_KPIS,
  CTP_CARD_KPIS,
} from "./transformers.js";

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
    kpi_name: "Ready_To_Use",
    actual_value: 100,
    ...overrides,
  };
}

function firstItem(m) {
  return m.sections[0].product_types[0].items[0];
}

test("CTP_INVENTORY_KPIS lists every live gold inventory KPI", () => {
  assert.deepEqual([...CTP_INVENTORY_KPIS].sort(), [
    "About_To_Expire",
    "Daily_Consumption",
    "Expired",
    "Held",
    "MHE_Count",
    "Oldest_Blocked_Lot_Days",
    "Part_Use",
    "Ready_To_Use",
    "Total_Inventory",
  ]);
});

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

test("toCtpInventoryMaster: non-array input is treated as empty", () => {
  const m = toCtpInventoryMaster(null);
  assert.equal(m.sections.length, 0);
  assert.equal(m.validation.items, 0);
});

test("toCtpInventoryMaster: one lot per status KPI, mapped to its status key", () => {
  const m = toCtpInventoryMaster([
    row({ kpi_name: "Ready_To_Use", actual_value: 50 }),
    row({ kpi_name: "Part_Use", actual_value: 10 }),
    row({ kpi_name: "About_To_Expire", actual_value: 5 }),
    row({ kpi_name: "Expired", actual_value: 3 }),
    row({ kpi_name: "Held", actual_value: 2 }),
  ]);
  const item = firstItem(m);
  assert.deepEqual(
    item.lots.map((l) => [l.status, l.quantity]),
    [["READY", 50], ["PART", 10], ["ATE", 5], ["EXP", 3], ["HOLD", 2]],
  );
  assert.equal(item.lots[0].lot_id, "SYN-IL-001-READY-20260716");
  assert.equal(m.validation.lots, 5);
  assert.equal(m.validation.items, 1);
});

test("toCtpInventoryMaster: zero-quantity statuses emit no lot", () => {
  const m = toCtpInventoryMaster([
    row({ kpi_name: "Ready_To_Use", actual_value: 40 }),
    row({ kpi_name: "Held", actual_value: 0 }),
    row({ kpi_name: "Expired", actual_value: "nan" }),
  ]);
  assert.deepEqual(firstItem(m).lots.map((l) => l.status), ["READY"]);
});

test("toCtpInventoryMaster: Daily_Consumption and Oldest_Blocked_Lot_Days feed cover and blocked age", () => {
  const m = toCtpInventoryMaster([
    row({ kpi_name: "Ready_To_Use", actual_value: 40 }),
    row({ kpi_name: "Held", actual_value: 8 }),
    row({ kpi_name: "Expired", actual_value: 4 }),
    row({ kpi_name: "Daily_Consumption", actual_value: 20 }),
    row({ kpi_name: "Oldest_Blocked_Lot_Days", actual_value: 6 }),
  ]);
  const item = firstItem(m);
  assert.equal(item.daily_consumption, 20);
  const age = Object.fromEntries(item.lots.map((l) => [l.status, l.age_days]));
  // Only blocked statuses (Expired / ON Hold) carry the oldest-lot age.
  assert.deepEqual(age, { READY: null, EXP: 6, HOLD: 6 });
});

test("toCtpInventoryMaster: Total_Inventory and MHE_Count feed validation, not lots", () => {
  const m = toCtpInventoryMaster([
    row({ kpi_name: "Total_Inventory", actual_value: 60 }),
    row({ kpi_name: "Ready_To_Use", actual_value: 60 }),
    row({ kpi_name: "MHE_Count", actual_value: 7 }),
    row({ itemcode: "IL-002", kpi_name: "Total_Inventory", actual_value: 30 }),
    row({ itemcode: "IL-002", kpi_name: "Ready_To_Use", actual_value: 25 }),
    row({ itemcode: "IL-002", kpi_name: "MHE_Count", actual_value: 3 }),
  ]);
  assert.equal(m.validation.expected_total_inventory, 90);
  assert.equal(m.validation.expected_mhe_count, 10);
  assert.equal(m.validation.lots, 2);
  // IL-002: Total 30 vs statuses 25 → flagged.
  assert.equal(m.data_limits.items_total_mismatch, 1);
});

test("toCtpInventoryMaster: latest date wins for a repeated (item, kpi)", () => {
  const m = toCtpInventoryMaster([
    row({ date: "2026-07-10", actual_value: 50 }),
    row({ date: "2026-07-16", actual_value: 100 }),
    row({ date: "2026-07-12", actual_value: 75 }),
  ]);
  assert.equal(firstItem(m).lots[0].quantity, 100);
});

test("toCtpInventoryMaster: kpi_names outside the inventory set are ignored", () => {
  const m = toCtpInventoryMaster([
    row({ kpi_name: "Inventory_item", actual_value: 999 }),
    row({ kpi_name: "Production", actual_value: 999 }),
  ]);
  assert.equal(m.sections.length, 0);
});

test("toCtpInventoryMaster: missing or empty itemcode / product_type / section / date rows are dropped", () => {
  const m = toCtpInventoryMaster([
    row({ itemcode: "" }),
    row({ itemcode: "null" }),
    row({ product_type: "" }),
    row({ section: "" }),
    row({ date: "garbage" }),
    row({ itemcode: "OK" }), // valid baseline row
  ]);
  assert.equal(m.validation.items, 1);
  assert.equal(firstItem(m).item_code, "OK");
});

test("toCtpInventoryMaster: groups by section → product_type → item, sorted within each level", () => {
  const m = toCtpInventoryMaster([
    row({ product_type: "Ply", itemcode: "P-2" }),
    row({ product_type: "Ply", itemcode: "P-1" }),
    row({ product_type: "Inner Liner", itemcode: "IL-A" }),
    row({ section: "Tyre Building", product_type: "Green Tyre", itemcode: "GT-1" }),
  ]);
  assert.deepEqual(m.sections.map((s) => s.name), ["Stock", "Tyre Building"]);
  assert.equal(m.sections[0].accent, "tl");
  assert.deepEqual(
    m.sections[0].product_types.map((p) => p.name),
    ["Inner Liner", "Ply"],
  );
  assert.deepEqual(
    m.sections[0].product_types[1].items.map((i) => i.item_code),
    ["P-1", "P-2"],
  );
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

test("toCtpInventoryMaster: same itemcode on two tyre types stays two items", () => {
  const m = toCtpInventoryMaster([
    row({ tyre_type: "PCR", actual_value: 10 }),
    row({ tyre_type: "TBR", actual_value: 20 }),
  ]);
  const items = m.sections[0].product_types[0].items;
  assert.deepEqual(items.map((i) => [i.tyre_type, i.lots[0].quantity]), [
    ["PCR", 10],
    ["TBR", 20],
  ]);
});

test("toCtpInventoryMaster: uom on the product_type is non-empty when any item carries a unit", () => {
  const m = toCtpInventoryMaster([
    row({ unit_of_measurement: "" }),
    row({ itemcode: "B", unit_of_measurement: "M" }),
  ]);
  assert.equal(m.sections[0].product_types[0].uom, "M");
});

test("toCtpInventoryMaster: as_of is max-date in IST +05:30 with 06:00:00 timestamp", () => {
  const m = toCtpInventoryMaster([
    row({ date: "2026-07-16" }),
    row({ itemcode: "IL-2", date: "2026-08-05" }),
  ]);
  assert.equal(m.as_of, "2026-08-05T06:00:00+05:30");
});

test("toCtpInventoryMaster: static config blocks are preserved (status_master, insight_cards, table, uom_display)", () => {
  const m = toCtpInventoryMaster([]);
  assert.deepEqual(
    m.status_master.map((s) => s.key),
    ["READY", "PART", "ATE", "EXP", "HOLD"],
  );
  assert.equal(m.insight_cards.length, 4);
  assert.equal(m.insight_cards[0].id, "short_cover");
  assert.equal(m.insight_cards[3].type, "oldest_blocked");
  assert.deepEqual(m.table, {
    default_sort: { key: "READY", dir: "desc" },
    top_n: 10,
  });
  assert.deepEqual(m.uom_display, { MTR: "m", KG: "kg", NOS: "nos" });
});

test("CTP_CARD_KPIS are the drill_down_level 1 KPIs", () => {
  assert.deepEqual(CTP_CARD_KPIS, ["Total_Inventory", "MHE_Count"]);
});

test("toCtpInventoryMaster: status chips and grid columns use the final mapping labels", () => {
  const m = toCtpInventoryMaster([]);
  const by = Object.fromEntries(m.status_master.map((s) => [s.key, s]));
  assert.deepEqual(
    [by.READY.label, by.READY.column, by.READY.gold_metric],
    ["Ready to Use", "Usable", "Ready_To_Use"],
  );
  assert.deepEqual(
    [by.HOLD.label, by.HOLD.column, by.HOLD.gold_metric],
    ["Hold", "Hold", "Held"],
  );
  assert.deepEqual(
    [by.EXP.label, by.EXP.column, by.EXP.gold_metric],
    ["Banned to Use", "Banned", "Expired"],
  );
  const tiles = Object.fromEntries(m.insight_cards.map((c) => [c.id, c.title]));
  assert.equal(tiles.on_hold, "On Hold");
  assert.equal(tiles.expired, "Banned to Use");
});

test("toCtpInventoryMaster: Days cover counts Ready_To_Use only; Expired and Held are blocked", () => {
  const m = toCtpInventoryMaster([]);
  const usable = m.status_master.filter((s) => s.usable).map((s) => s.key);
  const blocked = m.status_master.filter((s) => s.blocked).map((s) => s.key);
  assert.deepEqual(usable, ["READY"]);
  assert.deepEqual(blocked, ["EXP", "HOLD"]);
});

test("toCtpInventoryMaster: sheet row PCR Belt reconciles — statuses sum to Total_Inventory", () => {
  // Values from docs/Inventory_Mapping_Final.xlsx, "Grid rows" sheet.
  const pcrBelt = { section: "Stock", product_type: "PCR Belt", sub_section: "Cutter", itemcode: "PB-1" };
  const m = toCtpInventoryMaster([
    row({ ...pcrBelt, kpi_name: "Total_Inventory", actual_value: 141523.6 }),
    row({ ...pcrBelt, kpi_name: "Ready_To_Use", actual_value: 30976 }),
    row({ ...pcrBelt, kpi_name: "Part_Use", actual_value: 109895.064 }),
    row({ ...pcrBelt, kpi_name: "Held", actual_value: 652.536 }),
  ]);
  assert.equal(m.data_limits.items_total_mismatch, 0);
  assert.equal(firstItem(m).lots.length, 3);
});
