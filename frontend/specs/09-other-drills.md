# Spec: other-drills

**Phase:** 1
**Route:** `/banmore/production` (Downtime + Plan Compliance drill panels)
**Status:** ready
**Blast radius:** GREEN — two drill panels reusing established patterns

## Prerequisites
- Specs 01–08 — landed

## Context

- CLAUDE.md, conventions.md
- BRD §6.12 (`FR-P60`, `FR-P61`)
- docs/artifact.jsx (Downtime drill, Plan Compliance drill)
- src/components/production/KpiGrid.jsx — drill render slot
- src/api/drills.js — adds `getDowntimeDrill`, `getPlanComplianceDrill`
- src/lib/mockData.js — adds rows for both
- src/components/drills/oee/MachineSearch.jsx — reused

## Assumptions in play

None. Behaviour described in BRD; no OQR dependency.

## Purpose

Close out the four Mixing/Productivity KPI drills by replacing the
placeholders for Downtime and Plan Compliance with real panels.

## Scope

### Mock data

`src/lib/mockData.js` gains:

- `DOWNTIME_DRILL_BY_PLANT_SECTION` keyed by `${plantId}/${section}`.
  Each row: `{ reasonCategory, machine, reason, events, durationMin, lossHrs }`.
  Categories per FR-P60: Breakdown — Electrical / Mechanical /
  Instrumentation; Setup — FTC / size change; PM; Process; Utility
  (power failure); Other.
- `PLAN_COMPLIANCE_DRILL_BY_PLANT_SECTION` keyed by `${plantId}/${section}`.
  Each entry has `{ skuWise: [...], machineWise: [...] }`.
  - SKU-wise row: `{ itemCode, planned, actual }`.
  - Machine-wise row: `{ machine, planned, actual }`.
  Both compute `compliancePct = actual / planned * 100` at render time.

Spec 09 fills Banmore + Mixing for both. Other sections empty until
spec 11.

### API

`src/api/drills.js` gains:
- `getDowntimeDrill({ plantId, section })`
- `getPlanComplianceDrill({ plantId, section })`

### Components

**`src/components/drills/downtime/DowntimeDrillPanel.jsx`**
- Reuses `MachineSearch` for case-insensitive machine filter.
- Sticky-header 340 px table per `FR-P60`:
  `Category | Machine | Reason | Events | Duration (min) | Loss (hrs)`.
- Category column is a coloured pill (Breakdown variants = red,
  Setup = amber, PM = blue, Process = teal, Utility = purple,
  Other = grey).

**`src/components/drills/plan-compliance/PlanComplianceDrillPanel.jsx`**
- Two-pill segmented control above the table: "SKU-wise" / "Machine-wise"
  (default SKU-wise) per `FR-P61`.
- Sticky-header 340 px table with three columns: SKU/Machine label,
  Planned, Actual, Compliance %.
- Compliance % colour-coded: green ≥ 95%, amber ≥ 90%, red < 90%.

### KpiGrid wiring

`KpiGrid` adds branches for `openKpi.id === "downtime"` and
`openKpi.id === "plan-compliance"`. Drops the now-redundant
"arrives in spec 09" placeholder; with all four Mixing/Productivity
KPIs wired, the fallback branch becomes unreachable in this view —
keep it as defensive code with copy "Drill not configured for
this KPI."

## Reuse check

- [x] `MachineSearch` from `src/components/drills/oee/` reused as-is.
- [x] `LoadingSkeleton`, `useToast` from common.

## Data

- `getDowntimeDrill` / `getPlanComplianceDrill` via `usePolledQuery`,
  60 s polling, deps `[plantId, section]`.
- Local state: `search` (Downtime), `view` (Plan Compliance — "sku" |
  "machine").

## States

- Loading: skeleton rows.
- Empty: "No downtime events / plan compliance entries for this
  period."
- Error: toast.
- Success: tables render.

## Out of scope

- Sortable / filterable columns.
- Per-row drill (e.g. into breakdown ticket detail).
- TBM / Curing / Stock sections (spec 11).

## Done when

- Clicking Downtime card opens the categorised reasons table.
- Clicking Plan Compliance card opens a panel with the SKU/Machine
  toggle; switching views replaces the table.
- Compliance % column is green/amber/red per the threshold.
- `npm run check` exits zero.
- Manual click-through.
- Commit lands → `logs/history.md`.
