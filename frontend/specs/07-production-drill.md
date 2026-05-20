# Spec: production-drill

**Phase:** 1
**Route:** `/banmore/production` (drill panel when Production KPI open, Mixing section)
**Status:** ready
**Blast radius:** GREEN — single drill panel

## Prerequisites
- Specs 01–06 — landed

## Context

- CLAUDE.md, conventions.md
- BRD §6.10 (`FR-P43`–`FR-P49`)
- docs/artifact.jsx (ProductDrillPanel — compound branch)
- src/components/production/KpiGrid.jsx — drill render slot
- src/api/drills.js — adds `getProductionDrill`
- src/lib/mockData.js — adds compound rows
- src/components/drills/oee/MachineSearch.jsx — reuse the search input

## Assumptions in play

None. Behaviour described directly in BRD; no OQR dependency.

## Purpose

Replace the Production-card placeholder drill with the compound-wise
table per `FR-P43`–`FR-P49`. Header tracks the active compound
(Master / Final). Variance colour follows the BRD's thresholds.

## Scope

### Mock data additions

`src/lib/mockData.js` gains `PRODUCTION_DRILL_BY_PLANT_SECTION` keyed
by `${plantId}/${section}`. Each entry has `{ master: [...], final: [...] }`
arrays of compound rows.

Compound row shape:
```js
{
  itemCode: "COMP-MST-001",
  machine: "Banbury 1",       // assigned deterministically per FR-P47
  planned: 34.2,              // MT
  actual: 33.1,               // MT
  batchesPlan: 19,            // round(planned / avg-batch-size)
  batchesActual: 18,
  // variance is derived: ((actual - planned) / planned) * 100
}
```

Per BRD `FR-P47`:
- Master compounds cycle through Banbury 1–3 (larger Banburys).
- Final compounds cycle through Banbury 1–5.

Per `FR-P48`: batch counts use Master ≈ 1.80 MT/batch, Final ≈ 1.95
MT/batch (derived in the mock, not at render time).

Spec 07 seeds ~8 compound rows per compound for Banmore + Mixing.
Mix of green / amber / red variance to exercise the colour logic.
Specs 11 (other sections) and Phase 2 (other plants) extend.

### API

`src/api/drills.js` — implement:

- `getProductionDrill({ plantId, section, compound })` →
  `Promise<Array>` of compound rows for the active compound.

### Components in `src/components/drills/production/`

- **`ProductionDrillPanel.jsx`** — header + machine search + table.
  - Header reads "Master Compound — Compound-wise Production" or
    "Final Compound — Compound-wise Production" per active compound
    (`FR-P43`).
  - `MachineSearch` from `@/components/drills/oee/MachineSearch.jsx`
    filters rows by machine name (case-insensitive substring).
  - "X of Y compounds" count to the right of the search input
    (`FR-P44`).
  - Table columns in order (`FR-P45`):
    `Machine | Item Code | Planned (MT) | Actual (MT) |
     Batches Plan | Batches Actual | Variance`.
  - Variance is computed `(actual - planned) / planned * 100` and
    coloured per `FR-P46`: green ≥ 0%, amber 0% to −5%, red < −5%.
  - Sticky header, 340 px max-height (`FR-P49`).

### KpiGrid wiring

`KpiGrid` already routes `openKpi.id === "oee"` to `OeeDrillPanel`.
Add a second branch: `openKpi.id === "production"` →
`ProductionDrillPanel` (passes `plantId`, `section`, `compound`).
Other KPIs (Downtime, Plan Compliance) keep the placeholder.

## Reuse check

- [x] Searched `src/components/drills/oee/` — `MachineSearch` is
  identical to what this spec needs. Import it as-is; do NOT
  duplicate.
- [x] Searched `src/components/common/` — `LoadingSkeleton` reused
  for table loading.

## Data

- Reads from: `getProductionDrill({ plantId: "banmore", section: "mix", compound })`.
- Polling: 60 s, deps `[plantId, section, compound]`.
- Local state: `search`.

## States

- Loading: skeleton rows.
- Empty: "No compounds configured for this period."
- Error: toast "Could not load Production drill".
- Success: table renders with X-of-Y count.

## Out of scope

- Per-row drill into batch / lot details — not in BRD.
- CSV export — Phase 2.
- Sortable columns — defer until requested.
- Other sections (TBM has no production drill in the BRD; same for
  Curing / Stock).

## Done when

- Clicking the Production card in Mixing > Productivity opens the
  drill panel below the grid.
- Header text reflects the active compound (toggle Master ↔ Final at
  the top of the KPI grid; header tracks).
- Machine search filters rows; count updates.
- Variance cells are colour-coded per `FR-P46`.
- Sticky header survives table scroll.
- `npm run check` exits zero.
- Manual click-through passes.
- Commit lands → `logs/history.md` gets the entry.
