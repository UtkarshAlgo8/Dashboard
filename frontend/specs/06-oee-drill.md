# Spec: oee-drill

**Phase:** 1
**Route:** `/banmore/production` (drill panel below KPI grid when OEE card open)
**Status:** ready
**Blast radius:** YELLOW — large drill renderer; reused across sections in spec 11

## Prerequisites
- Specs 01–05 — all landed (shell + chrome + KPI grid)

## Context

- CLAUDE.md, conventions.md
- BRD §6.9 (`FR-P25`–`FR-P42`)
- docs/artifact.jsx (visual reference — `ProcessDrillPanel` OEE branch)
- src/components/production/KpiGrid.jsx (drill render slot)
- src/api/drills.js (skeleton — implements `getOeeDrill`)
- src/lib/mockData.js (adds Banbury machines + OEE drill data)
- src/components/common/ (EmptyState — used for FR-P42)

## Assumptions in play

None active. Spec 06 implements behaviour directly described in the
BRD; no OQR dependency.

## Purpose

Replace the OEE-card placeholder drill panel with the real
multi-layer drill: overall A/P/Q tiles → machine table → per-machine
sub-drill. Scrap → Production ID flow stays out (spec 08). Renderer
is generic over machine list so spec 11 (other sections) reuses it.

## Scope

### Mock data additions

`src/lib/mockData.js` gains:

- `MACHINES_BY_SECTION` — section → array of `{ id, name }`.
  Phase 1 only fills `mix`: five Banburys. Other sections stay empty
  arrays until spec 11.

- `OEE_DRILL_BY_PLANT_SECTION` — keyed by `${plantId}/${section}`.
  Each entry has:
  - `overall`: `{ availability, performance, quality }` (plant-level
    averages; per `FR-P25`).
  - `machines`: per-machine A/P/Q row, computed once as deterministic
    mocks. OEE is derived `A * P * Q / 10000`.
  - `subDrill`: nested map keyed by `${machineId}/${component}/${subCategory}`.
    Value is an array of detail rows. Some combos intentionally
    empty to exercise `FR-P42`.

  Spec 06 fills the Banmore + Mixing entry; spec 11 extends.

Sub-drill detail row shapes:
- Availability — `Breakdown`: `{ reasonCategory, reason, events, durationMin }`
- Availability — `Setup & Adjustment`, `Startup`, `Tool Change`:
  `{ reason, events, durationMin }`
- Performance — `Minor Stoppage`, `Reduced Speed`:
  `{ reason, events, durationMin }`
- Quality — `Defect`: `{ itemCode, defectType, qty, totalProduced }`
- Quality — `Scrap`: `{ itemCode, qty, traceable }`

The `traceable` flag on Scrap rows is the hook for spec 08
(scrap-traceability). Spec 06 displays scrap rows without the
"Trace ▸" UI; spec 08 wires that in.

### API

`src/api/drills.js` — implement:

- `getOeeDrill({ plantId, section })` → returns the drill object
  matching `OEE_DRILL_BY_PLANT_SECTION[plantId/section]` or
  `{ overall: null, machines: [], subDrill: {} }` for unconfigured
  combos.

### Components in `src/components/drills/oee/`

New folder to keep drill code separated from production-chrome code.

- **`OverallTiles.jsx`** — three tiles (Availability / Performance /
  Quality). Each colour-coded per `FR-P26` thresholds. Subtitle on
  each tile (e.g. "Plant average across machines").
- **`MachineSearch.jsx`** — text field + Clear button (visible only
  when value present). Returns trimmed lower-case substring to the
  parent.
- **`MachineTable.jsx`** — sticky-header table; columns Machine,
  OEE %, A %, P %, Q %. OEE cell display-only. A/P/Q cells
  individually clickable with chevron, threshold-coloured. Hover
  tints; selected cell gets filled background + white text. 340 px
  max-height, scrollable.
- **`SubDrill.jsx`** — appears below the machine table when a cell
  is selected. Left-edge accent bar (Availability blue,
  Performance amber, Quality teal — per `FR-P38`). Breadcrumb
  "OE › Machine › Component". Sub-category pills filtered to the
  selected component. Click a pill → render a detail table for
  the (machine, component, sub-category) tuple. Empty state per
  `FR-P42` ("No [sub-category] recorded for [Machine] in this
  period.").
- **`OeeDrillPanel.jsx`** — composes everything; owns search,
  selected-cell, and selected-sub-category state. Polls
  `getOeeDrill` on (plantId, section) deps.

### KpiGrid wiring

`KpiGrid` replaces the placeholder drill panel with `OeeDrillPanel`
when `openKpi.id === "oee"`. Other KPIs still show the placeholder
until specs 07 / 09 land.

## Reuse check

- [x] Searched `src/components/common/`.
  - `EmptyState` reused for `FR-P42` no-data sub-drill state.
  - `LoadingSkeleton` reused for table loading.
- [x] Searched `src/components/production/`.
  - No fit — drill code lives in its own `src/components/drills/`
    tree because (a) it'll grow with specs 07/08/09 and (b) drills
    are reusable across plants in Phase 2.

## Data

- Reads from: `getOeeDrill({ plantId: "banmore", section: "mix" })`.
- Polling: piggy-backs on KpiGrid's 60 s if we lift it; spec 06 calls
  `usePolledQuery(..., { interval: 60_000, deps: [plantId, section] })`
  directly to keep the drill self-contained.
- Local state: `search`, `selectedCell` (`{ machineId, component }` or
  null), `selectedSubCategory` (string or null).

## States

- Loading: skeleton table rows.
- Empty: never (Banmore Mixing always returns drill data); defensive
  empty handler renders an info card.
- Error: toast "Could not load OEE drill"; panel stays in last-good
  state.
- Success: tiles + table + (optional) sub-drill render.

## Out of scope

- Scrap → Production ID traceability (spec 08).
- TBM / Curing / Stock machine lists (spec 11).
- Per-row exports / CSV.
- Sortable columns (artifact doesn't sort either; defer if requested).

## Done when

- Clicking the OEE card body in Mixing > Productivity expands the
  drill panel.
- 3 overall tiles render with correct threshold colours.
- Machine search field filters Banbury rows case-insensitively;
  Clear button appears when the field has text.
- Banbury 1–5 table renders with OEE (display-only) + A/P/Q
  (clickable, threshold-coloured, chevron).
- Clicking an A/P/Q cell selects it (filled background, white text)
  and reveals the sub-drill panel below.
- Sub-drill breadcrumb + pills + detail table render. At least one
  (machine, component, sub-category) combo shows the empty state.
- Selecting a different cell in the same row or a different row
  switches selection; clicking the same cell deselects.
- `npm run check` exits zero.
- Manual click-through passes the above.
- Commit lands → `logs/history.md` gets the entry.
