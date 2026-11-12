# Spec: overage-material

## Current implementation — live inline Athena (2026-11-11)

Supersedes the Gold-based Technical UI described in the historical section below.
Source: **Overage KPI Dashboard — UI and Backend Guide**, updated 10 Nov 2026.

### Confirmed scope and decisions

- Keep Technical → Stock's existing area chips and Overage Material KPI card.
- Supported: Mixing, Four Roll, Three Roll, Extruder, Cutter and Slitter.
- Bead shows **unsupported**, not zero. Building/Curing are unchanged.
- Green Tyre is deferred: `silver.fct_curingncm` remains absent in Athena.
- Use inline Athena CTEs, not a view. All reads go through `runQuery` with
  `engine: "athena"`, `tables: []`; no DDL, Gold writes or raw-source downloads.
- Every source is plant-scoped to `plant_code = 'BTP'` (verified live).
- No binding interface exists in the upstream API. The user approved strict
  section/product allowlists and centralized Athena literal encoding for item
  and unit values. Apostrophes are doubled; identifiers never come from requests.

### SQL and data rules

Implementation: `backend/src/queries/overage-live.js`.

- Rolling 720 hours in IST, non-future production, positive stock and age strictly
  greater than shelf life. Only Ready To Use, Decision Pending and Consumed.
- Shelf-life conversions, BOM/machine classification, aging precedence, assumed
  quantity, unit decisions, production date/shift and every metric execute in SQL.
- Silver timestamps retain the existing live-SKU IST wall-clock contract. API
  timestamps carry `+05:30`; the browser renders IST explicitly.
- Unit-master IDs are VARCHAR in Athena; join them using `try_cast(... AS INTEGER)`.
- Athena category arrays discard nulls, matching Spark `COLLECT_SET` semantics.
- **Approved extension:** repeated production barcodes use the latest ingestion
  record, then event time and stable record ID, before quality/stock decisions.
  Ranking is among eligible mapped-machine records in the rolling window. This
  uses the chosen record's event time; production-time semantics remain a source
  data responsibility.
- **Temporary plant-confirmed override:** Mixing item `JT444` is **Final Compound**.
  Both Master and Final current-category records were observed. Override the
  category membership for this item so it is counted once. Remove the override
  only after verifying the corrected data and rerunning uniqueness checks. A live
  all-area audit after this override confirmed unique barcode counts in all six areas.
- An unresolved multi-classification is detected in SQL before product/unit
  filtering and paging. The API fails the affected section with
  `OVERAGE_CLASSIFICATION_CONFLICT`, rather than returning inflated totals.
- Product/unit rows and section/unit totals come from **one** `GROUPING SETS`
  query with a zero-filled layout; unclassified FRC is retained last.

### Additive API contracts

All paths below are under `/api/v1/plants/:plantId/inventory/overage` and accept
Banmore aliases only. Header dates/shifts are ignored. `section` is required for
item/barcode routes and optional for the shared all-area summary.

| Route | Inputs | Result |
| --- | --- | --- |
| `/summary` | optional `section` | `{ as_of, timezone, lookback_hours, totals, products, unavailable_sections }` |
| `/items` | `section`, optional `product_type`, `limit`, `offset` | `{ as_of, timezone, lookback_hours, rows, limit, offset, has_more }` |
| `/barcodes` | `section`, `product_type`, `item_code`, optional `unit`, `limit`, `offset` | same page envelope |

- Detail page size defaults to 100, maximum 200; offset range is 0–100000.
- SQL fetches at most `limit + 1`; the extra row determines `has_more`.
- Level 2 includes Level 1's unit so multi-unit item rows reconcile correctly.
- The old `/overage` Gold endpoint/response remains for compatibility; Technical
  no longer calls it. The legacy frontend helpers remain for those consumers.
- All six compact summaries share **one five-minute cache and one SQL query**.
  The UI fetches this batch once; switching area chips only selects display rows
  and causes no new summary query. Scoped summary consumers use this same cache.
  Detail caches remain section/filter/page-keyed, with in-flight deduplication.
  `refresh=1` bypasses a cached result; a 15-second guard limits repeated refreshes.
  Source-access failures and classification failures are remembered for 60 seconds
  (classification failures are section-specific). A batch with a conflicting
  section omits that section's totals/products and lists its error under
  `unavailable_sections`; other sections remain usable. A scoped request for that
  section returns 503. Never cache an invented zero.
- `as_of` is the SQL clock; empty detail pages use query-start time. Each screen
  is independently queried/cached, so results may differ as live stock changes.

### UI

- Technical Stock/Building/Curing cards use the Engineering-style responsive grid:
  four columns on desktop, three on medium screens, two on tablets, one on mobile,
  with 16px gutters. Cards are top-aligned at their natural height. Overage uses
  the same compact card structure as its neighbors; Mixing shows Master and Final
  Compound in two compact rows to the right of its total, with detailed product
  breakdown in the drill. Other dashboards and specialized grids are unchanged.
  Quantity/unit pairs stay together; snapshot time
  sits in the card footer. The refresh action is available inside the drill header.
- Stock lists active KPIs first, followed by unavailable/NA cards, preserving the
  catalog order within each group. Zero is a valid active value. This same order
  is used in the drill's left rail; Building/Curing ordering is unchanged.
- Technical KPI drills follow Production's split layout: on desktop (`lg+`),
  all KPI cards stack in a 340px left rail and the selected drill fills the right.
  Closing the drill restores the normal grid; below `lg` the rail and panel stack.
  Overage item/barcode navigation remains inside the right panel; refresh/back
  actions live in its header. Specialized dashboard sections remain unchanged.
- Cards show KG totals as metric tonnes (MT, 1 MT = 1,000 KG), normally with
  two decimals; small nonzero MT totals retain enough precision to avoid reading
  as zero. M, NOS and `Not set` stay in their original units. Totals use Indian
  digit grouping without `k`, `L` or `Cr` suffixes; secondary units are never
  hidden or summed. Hover or keyboard focus reveals the full source quantity and
  original unit. Drill-downs and exports retain the source units and quantities.
  Empty quantities show `0`. Mixing compound values also retain source-unit
  tooltips; other product-type details remain available in the drill.
- Open card → lazy item page; click an item row → lazy barcode page. No item or
  barcode requests happen on initial card load. Product filters execute in SQL.
- Show assumed quantity, barcode count, machines, shelf life, oldest production
  and worst delay; barcode detail includes location, expiry, shift, aging source,
  quantity source and quality status. Product/unit selection is preserved.
- Previous/Next are server-side pages. Export is explicitly **current page only**.
- Refresh control on Stock and drill; error/retry states do not present zero stock.
- Live overage loading is independent of the period-bound KPI loader.
- Mock mode reports that the live API is required; it does not fabricate stock.

### Verification and remaining performance work

- Focused SQL/controller tests cover validation, escaping, cache/refresh behavior,
  lazy bounded pages, timestamp normalization, source failures and conflicts.
- Live Athena: all six area summaries execute; product lines reconcile by unit.
  An Extruder item reconciled to 39 distinct barcodes and 3753.88 M via SQL.
- Deterministic Athena VALUES fixtures exercised strict window/expiry boundaries,
  status exclusions, consumed/assumed stock, deduplication, own-machine product
  classification, tread units, direct item aging and the 07:00 shift rule.
- Browser checks exercised lazy loading, product selection, row click, pagination,
  unit-preserving display, unsupported Bead, refresh and error states.
- Final batch measurement: **5117-byte API response**, **27 aggregated rows**
  (10 unit totals + 17 product/unit lines), **24.8-second cold call**. All six
  subsequent scoped summaries used that shared cache in **2–3 ms**. No second
  summary request occurs on UI area switches.
- Detail measurement: one-row item page **486 bytes / 21.9 seconds cold**;
  two-row barcode page **1170 bytes / 19.8 seconds cold**. A 201-row maximum
  barcode query returned about **97 KB** upstream, with no pagination token.
- A logical view would not fix that cold latency. Further speed improvements need
  Athena execution-plan/scan metrics and upstream Delta layout/partition tuning;
  the current API does not report bytes scanned. No partition-pruning claim is made.

---

## Historical Gold contract (legacy endpoint only)

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
