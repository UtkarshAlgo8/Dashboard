# Spec: overage-material

**Phase:** 1 (Technical dashboard, Stock tab)
**Route:** `/banmore/technical` (Stock tab → "Overage Material" card + drill)
**Status:** in-progress
**Blast radius:** crosses API boundary — new backend route + Stock-tab card wiring

## Prerequisites
- Technical dashboard Stock tab (`BanmoreTechnical.jsx`) — landed
- Gold `category = 'Inventory'` rows loaded for Banmore (see Q-INV-01)

## Context

- CLAUDE.md, conventions.md
- docs/open-questions.md — Q-INV-01
- src/pages/BanmoreTechnical.jsx — `STOCK_AREAS`, `STOCK_KPIS` (`ovg`),
  `mapDisplayKpis`
- src/components/technical/TechnicalDrillPanel.jsx, TechDrillCard.jsx
- src/api/inventory.js — pattern for the new API function
- src/api/plants.js — `getAsOf`
- ../backend/src/controllers/inventory.controller.js — pattern for the route
- ../backend/src/queries/dashboard-query.js — query builders

## Assumptions in play

- Q-INV-01 (Inventory category in Gold) — assuming it is now loaded and
  carries `status = 'Overage'` rows. Must be moved out of OPEN-DEFERRED.
- New, to add to docs/open-questions.md:
  - Each Gold run **replaces** the inventory rows (no accumulated runs).
    If false, the totals multiply by the number of runs and this spec
    needs a run-timestamp column and a latest-run filter.
  - "Last refreshed" uses the plant as-of date (`getAsOf`) until Gold
    exposes a run timestamp. It is the latest data date, not the run time.
  - No target / RAG for Overage yet — the card shows no status colour.
- No requirement ID (FRS/US) exists for this feature yet — **flagged**.

## Purpose

Show how much stock is past its usable age in each Stock area, read
directly from Gold, so the Technical Head can see where overage sits and
which SKUs hold it.

## Gold read rules (source of truth for the backend)

1. **Rows**
   - `kpi_name = 'Inventory'` for totals; `'Inventory_item'` for the SKU table.
   - `status = 'Overage'`.
   - `granularity = 'DAY'` only — SHIFT and MONTH repeat the same lots.
   - **No date filter.** Gold dates each lot by its production day, so
     current overage is spread across many dates.
2. **De-duplicate** — one value per cell: `MIN(actual_value)` grouped by
   section, sub_section, product_type, unit_of_measurement, machine,
   itemcode, date.
3. **Aggregate by unit, never across units.**

   | Level | Group by | KPI |
   |---|---|---|
   | Section | section, unit | Inventory |
   | Sub-section | section, sub_section, unit | Inventory |
   | Component | section, sub_section, product_type, unit | Inventory |
   | SKU | section, sub_section, product_type, unit, itemcode | Inventory_item |

   Each row returns `overage_qty = SUM(qty)`, `oldest_lot_date = MIN(date)`,
   `production_days = COUNT(DISTINCT date)`.
4. SKU rows sorted by `overage_qty DESC`.

## User flow

1. User opens Technical → Stock and picks an area chip (Mixing, 4 Roll, …).
2. The "Overage Material" card shows that area's overage, one figure per
   unit (e.g. `20,125 M · 3,910 NOS`), plus the oldest lot date.
3. User clicks the card → drill opens below with a breadcrumb
   `Stock › <Area> › Overage Material`.
4. Drill shows a component table, then the SKU table for the selected
   component.

Area → Gold scope: Mixing = `section = mix` (whole section, no
sub-section); other chips = `section = stk` + the chip's `sub_section`
(from `STOCK_AREAS`).

## UI elements

- **Card** (existing `KpiCard`):
  - Value: the largest unit's quantity with its unit (KG shown as MT,
    2 decimals; M and NOS as whole numbers).
    `KpiCard` renders one number, so any other units go first in the
    note — never summed.
  - Note (single line, never wraps): `Oldest lot <dd-mm-yyyy>`; with a
    second unit `+ 3,910 NOS · oldest <date>`; with more `+ N more units ·
    oldest <date>`. "Current snapshot" lives in the drill footnote.
  - No sparkline, no trend button, no RAG chip, no target line.
- **Drill** (new `OverageDrill` on `TechDrillCard`, rendered directly by
  the page like the self-fetching `rsku` / `gtw` drills):
  - Tiles: overage per unit, oldest lot, last refreshed.
  - "Component" chip row: All components, then one chip per
    component · unit.
  - All components → table: Component, Overage Qty (with unit), Oldest
    Lot, Production Days.
  - One component → SKU table: SKU, Overage Qty, Oldest Lot,
    Production Days.
  - Footer: `Current snapshot — ignores the date and shift filters. Last
    refreshed <as-of>.`
- Not built (no Gold source): Lot/Reel, Days Aged, Location, Last Used,
  Deposited Date, Action — the mockup columns.

## Reuse check

- [x] `KpiCard`, `TechDrillCard` — match.
- New: one drill component (`OverageDrill`) inside
  `src/components/technical/`; project-specific, not common/.

## Data

- Reads from: `GET /api/v1/plants/:plantId/inventory/overage`
  - Response: `{ data: { totals: Row[], skus: Row[] } }`
  - `Row`: `{ section, sub_section, product_type, unit, itemcode?,
    overage_qty, oldest_lot_date, production_days }`. `totals` holds all
    three grouping levels; a level's unused keys are `null`.
  - Takes no `from` / `to` / `granularity` params (rule 1).
  - Cached like the other inventory reads (`INVENTORY_MASTER` TTL).
- Last refreshed: existing `getAsOf(plantId)`.
- Writes to: none.

## States

- Loading: card joins the Stock section's existing single loader.
- Empty (no overage rows for the area): card value `0`, note `No overage
  stock`. Drill shows `No overage stock in <Area>.`
- Error: card shows `NA` with `unavailableReason: "Inventory source
  unavailable"` (same pattern as `rsku`).
- Success: as in UI elements.

## Out of scope

- Overage on Building and Curing tabs (stay on current source).
- Overage trend over days — needs Gold to date rows by run day.
- Machine-level drill (optional in source note).
- Fixing upstream Gold data: Cap Strip lots never marked Consumed,
  Inner Liner labelled NOS, Chaffer labelled KG. Card numbers for those
  components will be wrong until Gold fixes them.
- Lot-level columns from the mockup.

## Done when

- Stock → Cutter card shows Belt overage summed over all dates, split
  by unit; SKU rows for Belt add up to the Belt component total.
- Changing Today/Month/Year, dates or shift does not change the card.
- Section with two units shows two figures, never one summed figure.
- Backend test covers: de-duplication of repeated cells, unit split,
  SHIFT/MONTH rows excluded, empty result.
- `npm run check` exits zero (frontend) and backend tests pass.
