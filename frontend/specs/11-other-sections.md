# Spec: other-sections

**Phase:** 1
**Route:** `/banmore/production` (TBM / Curing / Stock sections, Productivity tab)
**Status:** ready
**Blast radius:** YELLOW — parity work; reuses spec 05–10 plumbing

## Prerequisites
- Specs 05 (Mixing KPIs), 06 (OEE drill), 09 (Downtime + Plan Compliance drills) — all landed.
- Spec 07 (Production drill) is Mixing-only by BRD scope; non-Mixing Production cards are non-drillable in Phase 1.

## Context

- CLAUDE.md, conventions.md
- BRD §6.5 (`FR-P13`, `FR-P14`) — TBM
- BRD §6.6 (`FR-P15`, `FR-P16`) — Curing
- BRD §6.7 (`FR-P17`, `FR-P18`) — Stock
- src/lib/mockData.js
- src/api/kpis.js, src/api/drills.js
- src/components/production/CompoundSubSelector.jsx (pattern to follow)
- src/components/production/KpiGrid.jsx — already routes to drill panels by `openKpi.id`
- src/pages/BanmoreProduction.jsx — adds Stock sub-selector state

## Assumptions in play

None. Behaviour described directly in BRD.

## Purpose

Bring TBM, Curing, and Stock sections to parity with Mixing for the
Productivity tab. After this spec, switching sections in the sidebar
swaps the KPI grid with section-specific machines, drill data, and
sub-selectors (Stock only).

## Scope

### Machines

`MACHINES_BY_SECTION` in `src/lib/mockData.js` gains entries per
BRD §6.5–6.7:

- **TBM**: VMI Max, VMI Exium, BJ Modules, Stage 1, Stage 2.
- **Curing**: Tredge 1 (8 press), Tredge 2 (8 press), Tredge 3
  (10 press), Tredge 4 (10 press), Tredge 5 (8 press), Tredge 6
  (6 press) — press counts in the display name per `FR-P15`.
- **Stock** (4 Roll sub-selector only in Phase 1): a small fixed
  list per sub-selector — `stk-4roll` machines render under `mix`
  shape so the drill plumbing reuses cleanly.

### KPIs

`MIXING_PRODUCTIVITY_KPIS` becomes one entry in a larger map
`PRODUCTIVITY_KPIS_BY_SECTION`:
- `mix` keeps the master / final compound structure.
- `tbm` and `cur` use a flat array (no sub-selector).
- `stk` keys by sub-selector (`4roll` default; `extruder`, `3roll`,
  `cutter`, `slitter` left as empty arrays for Phase 1 — empty state
  shows "No KPIs configured for this sub-selector yet").

For TBM / Curing: same 4-KPI structure (OEE / Production / Downtime
/ Plan Compliance). Production unit changes to `nos` (tyres) per
`FR-P14` / `FR-P16`. Production KPIs in non-Mixing sections set
`drillable: false` — the compound-wise Production drill is
Mixing-only per BRD §6.10.

### Drills

For TBM / Curing / Stock(4 Roll), seed analogous entries in:
- `OEE_DRILL_BY_PLANT_SECTION`
- `DOWNTIME_DRILL_BY_PLANT_SECTION`
- `PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION`

Phase 1 keeps the data shape identical to the Mixing entries —
overall A/P/Q values, per-machine rows, sub-drill rows. Detail-row
schemas are reused; the drills don't need section-aware variants.

### Stock sub-selector

New component `src/components/production/StockSubSelector.jsx`:
5-pill segmented control (4 Roll / Extruder / 3 Roll / Cutter /
Slitter) per `FR-P17`. Default `4roll` per `FR-P18`.

State lives in `BanmoreProduction` (sibling to `compound`).
`KpiGrid` renders the Stock selector only when `section === "stk"`
and `tab === "p"`; renders the Compound selector only when
`section === "mix"` and `tab === "p"`.

### API updates

`getKpis` in `src/api/kpis.js` dispatches:
- `mix + p` → `PRODUCTIVITY_KPIS_BY_SECTION.mix[compound]`
- `tbm + p` → `PRODUCTIVITY_KPIS_BY_SECTION.tbm`
- `cur + p` → `PRODUCTIVITY_KPIS_BY_SECTION.cur`
- `stk + p` → `PRODUCTIVITY_KPIS_BY_SECTION.stk[stockSelector]`
- All other (section, tab) combos → `[]`

New optional parameter `stockSelector` on `getKpis`; threaded
through from BanmoreProduction → KpiGrid.

### Stock production-drill exception

Stock's Production KPI is also non-drillable in Phase 1 (no BRD
description). Same `drillable: false`.

## Reuse check

- [x] OEE drill renderer (`OeeDrillPanel`) is already machine-list
  driven via `MACHINES_BY_SECTION` and `OEE_DRILL_BY_PLANT_SECTION`
  — no changes to the component, only data.
- [x] `MachineSearch`, `LineChart`/`BarChart` — no changes.
- [x] `CompoundSubSelector` shape reused as the basis for
  `StockSubSelector` (but a fresh component, since pills are
  different).

## Data

- All existing mock keys gain TBM/Curing/Stock(4 Roll) entries.
- API signature changes:
  - `getKpis({ plantId, section, tab, compound, stockSelector })`.

## States

Same as parent specs — loading, empty, error, success. Stock
sub-selectors other than "4 Roll" show the standard empty state.

## Out of scope

- Production drill (compound-wise) for non-Mixing sections — BRD
  §6.10 is Mixing-only.
- Stock sub-selectors other than 4 Roll fully fleshed out — Phase 2.
- Other tabs (Q / C / D / M / S) — spec 12.
- Per-section KPI overrides (e.g. counter KPIs for Safety) — spec 12.

## Done when

- Clicking TBM / Curing / Stock in the sidebar swaps the KPI grid.
- Each section's Productivity tab shows 4 KPI cards with
  section-appropriate values + units (nos for tyre output).
- OEE drill opens with the correct machine list (VMI Max etc. for
  TBM; Tredge 1–6 for Curing; 4 Roll lineup for Stock).
- Downtime + Plan Compliance drills render with section data.
- Stock section shows the 4 Roll / Extruder / 3 Roll / Cutter /
  Slitter sub-selector; switching to a non-4-Roll selector shows
  the empty-state copy.
- Mixing still works as before (regression).
- Non-Mixing Production cards do not toggle a drill (chevron absent).
- `npm run check` exits zero.
- Manual click-through.
- Commit lands → `logs/history.md`.
