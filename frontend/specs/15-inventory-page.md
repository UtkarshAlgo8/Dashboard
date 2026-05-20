# Spec: inventory-page

**Phase:** 1 (stretch)
**Route:** `/banmore/production` (Inventory tab "I" replaces section view)
**Status:** ready
**Blast radius:** YELLOW — separate page surface inside the Production route

## Prerequisites
- Specs 04 (chrome) + 12 (tab strip) — landed

## Context

- CLAUDE.md, conventions.md
- BRD §6.13 (`FR-P62`–`FR-P68`)
- docs/artifact.jsx — `InventoryPage`
- src/pages/BanmoreProduction.jsx — already routes by `category === "p"`;
  spec 15 adds the `i` branch
- src/api/anomalies.js — skeleton folder; new `src/api/inventory.js`
- src/lib/mockData.js — adds INVENTORY data
- src/components/common/ — Page/Table primitives

## Assumptions in play

None.

## Purpose

When the Inventory tab is selected, replace the section view with a
dedicated Inventory page per BRD §6.13. Three bar-chart cards;
clicking a bar reveals an item-level Live Inventory table below;
a 7-day × 12-category history table sits at the bottom.

## Scope

### Mock data

`src/lib/mockData.js` gains `INVENTORY_BY_PLANT` keyed by `plantId`.
Each plant entry has:

- `groups`: 3 chart cards per `FR-P62`.
  - `production` — bars: FG, Cured, Green.
  - `stock` — bars: Tread, Belt, Ply, Capstrip, Sidewall, I.Liner, Bead.
  - `compound` — bars: Final, Master.
- Per bar: `{ id, label, today, yesterday, unit, items: [...] }`.
- Per item: `{ itemCode, description, liveStock, unit }`.
- `history`: last 7 days × 12 categories. Array of
  `{ date, fg, cured, green, tread, belt, ply, capstrip, sidewall,
  iLiner, bead, final, master }`.

### API

`src/api/inventory.js` (new). Exports `getInventory({ plantId })` →
`Promise<{ groups, history }>`.

### Components in `src/components/inventory/`

- **`InventoryBarChart.jsx`** — small SVG showing each bar as a
  Today (accent) + Yesterday (muted) pair. Selected bar highlighted.
  Title slot above. Click hands the bar id to `onBarClick`.
- **`InventoryItemTable.jsx`** — Item Code (mono) | Description |
  Live Stock (bold + unit) per `FR-P65`. Summary strip above with
  count + total qty per `FR-P66`.
- **`DailyInventoryTable.jsx`** — 7-day × 12-category sticky table
  per `FR-P68`.
- **`InventoryPage.jsx`** — composes the above. Local state:
  `selected = { groupId, barId } | null`. Toggle on re-click per
  `FR-P67`. Polling: `usePolledQuery` with 60 s interval and
  `[plantId]` deps.

### Routing

`BanmoreProduction.jsx`:
- `category === "p"` → `KpiGrid` (existing).
- `category === "i"` → `<InventoryPage plantId="banmore" />`.
- Otherwise → existing Q/C/D/M/S `KpiGrid` path.

## Reuse check

- [x] `usePolledQuery`, `useToast`, `LoadingSkeleton` from existing
  modules.
- [x] No new common primitive.

## Data

- One API call per plant; polls every 60 s.

## States

- Loading: skeleton charts + table.
- Empty: defensive "No inventory configured." Phase 1 always populates.
- Error: toast.
- Success: 3 charts + (optional) drill table + history.

## Out of scope

- Editing stock figures (read-only).
- Per-item drill (artifact stops at item code level).
- Movement history per item (Phase 2).
- Print-friendly layout tuning beyond the global `@media print`
  rules from spec 13.

## Done when

- Selecting Inventory tab (I) replaces the section view with the
  Inventory page.
- Three bar charts render with Today (filled) + Yesterday (faded)
  bars per group.
- Clicking a bar highlights it and reveals the item-level table
  beneath the chart grid; clicking the same bar closes the drill;
  clicking a different bar switches.
- Summary strip above the item table shows count + total qty.
- Daily Inventory table renders 7 days × 12 categories below.
- Mixing/TBM/Curing/Stock sections still work — clicking back to
  Productivity returns the KPI grid.
- `npm run check` exits zero.
- Manual click-through.
- Commit lands → `logs/history.md`.
