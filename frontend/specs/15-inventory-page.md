# Spec: inventory-page

**Phase:** 1 stretch (else Phase 2)
**Route:** `/banmore/production` (Inventory tab "I" replaces section view)
**Status:** draft — stretch
**Blast radius:** YELLOW — separate page surface inside the Production route

## Prerequisites
- Spec 02 (mock data)
- Spec 04 (Production dashboard chrome)
- Spec 12 (tab strip — Inventory is tab "I")

## Purpose

Selecting the Inventory tab replaces the section view with the
dedicated Inventory page per BRD §6.13 (`FR-P62`–`FR-P68`) and
`function InventoryPage` in `docs/artifact.jsx`.

## Scope

- Three side-by-side bar-chart cards:
  - Production (FG / Cured / Green)
  - Stock Inventory (Tread / Belt / Ply / Capstrip / Sidewall /
    I.Liner / Bead)
  - Compound Inventory (Final / Master)
- Each card has a Today (filled) / Yesterday (faded grey) legend.
- Bar groups clickable; click selects (highlighted background +
  accent label) and reveals an item-level Live Inventory table below
  the chart grid (`FR-P64`).
- Item-level table: Item Code (monospaced) | Description | Live Stock
  (large bold value with unit) (`FR-P65`).
- Summary strip above the table: count of item codes + total quantity
  for the selected bar (`FR-P66`).
- Re-click same bar closes drill; click different bar switches
  (`FR-P67`).
- Daily Inventory historical table (last seven days × twelve
  categories) below the bar charts (`FR-P68`).

## Out of scope
- Edit / receive / adjust stock (read-only Phase 1).
- Per-SKU drill into batch / lot details.
- WMS push (Phase 2).

## Cut decision

This spec is a **stretch** for Phase 1. If specs 01–14 land and time
remains, ship this. Otherwise Inventory moves to Phase 2 with the
other dashboards (Quality / Engineering).
