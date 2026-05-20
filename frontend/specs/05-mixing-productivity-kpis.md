# Spec: mixing-productivity-kpis

**Phase:** 1
**Route:** `/banmore/production` (Mixing section + Productivity tab — the default landing view)
**Status:** ready
**Blast radius:** YELLOW — first KPI grid; sets the pattern for specs 06–12

## Prerequisites
- Spec 01 (app-shell), 02 (mock-data-layer), 04 (production-dashboard-shell) — all landed

## Context

- CLAUDE.md, conventions.md
- docs/product.md, docs/architecture.md
- docs/open-questions.md (Q-DATA-01 — 60s polling)
- docs/artifact.jsx (visual reference — KpiCard, ProcessDrillPanel)
- BRD §6.4 (`FR-P10`–`FR-P12`) — Mixing sub-selector + KPIs
- BRD §6.8 (`FR-P19`–`FR-P24`) — KPI card behaviour
- src/components/common/ — no fit; new project-only components
- src/components/production/ — existing chrome
- src/hooks/usePolledQuery.js — polling
- src/api/kpis.js (currently skeleton — implements `getKpis`)
- src/lib/mockData.js (adds Mixing KPIs)

## Assumptions in play

None active. Q-DATA-01 (60s polling), Q-KPI-01 (prototype KPIs are
authoritative) both RESOLVED on 2026-05-20.

## Purpose

Replace the "Section: MIX · Tab: P — KPI grid lands in spec 05+"
placeholder with the real KPI card grid for Mixing + Productivity.
Also delivers the Master/Final compound sub-selector (BRD `FR-P10`,
`FR-P11`). Drill panels are out of scope — clicking a drillable card
toggles a "drill arrives in spec 06" placeholder.

## Scope

### Mock data additions

`src/lib/mockData.js` gains `MIXING_PRODUCTIVITY_KPIS` — an object
keyed by compound ("master" / "final") holding 4 KPI definitions
each. Per BRD `FR-P12` the KPIs are OEE, Production (MT), Downtime
(hrs), Plan Compliance (%).

KPI shape:
```js
{
  id: "oee",
  name: "OEE",
  value: 78.5,
  unit: "%",
  trend: -2.3,        // % change vs previous period; null if N/A
  trendFavourable: false,  // direction good? (up is bad for Scrap)
  spark: [76, 78, 79, 77, 78.5, 79.2, 78.5],  // last N points
  target: 85,         // optional; null if not applicable
  drillable: true,    // shows chevron and supports drill toggle
}
```

Master compound: Production = 285 MT (`FR-P11`); other values
plausible deterministic mocks.
Final compound: Production = 183 MT (`FR-P11`).

### API

`src/api/kpis.js` — implement `getKpis({ plantId, section, tab,
compound })` returning the KPI array via `mockDelay`. Phase 1 only
handles Banmore + mix + p; subsequent specs widen the matrix.

### Components in `src/components/production/`

- **`CompoundSubSelector.jsx`** — two-pill segmented control
  (Master Compound / Final Compound). Mixing-only; rendered only
  when `section === "mix"` AND `category === "p"`. Default = "final"
  per `FR-P11`.
- **`Sparkline.jsx`** — small SVG line chart (60×20 px default). Pure
  visual; no axes, no tooltips. Polyline + thin stroke.
- **`KpiCard.jsx`** — single card. Header row: name (uppercase, small,
  left) + Trend Icon button + chevron (if drillable). Body: value
  (large bold) + unit (subdued) + sparkline (right-aligned). Footer:
  trend % with up/down arrow, coloured green/red based on
  `trendFavourable`. Clicking the card body toggles drill (calls
  `onDrillToggle(id)`); clicking the Trend Icon (with
  `stopPropagation`) calls `onTrendOpen(id)`.
- **`KpiGrid.jsx`** — responsive CSS Grid of KpiCards (auto-fit
  minmax 220px). Renders the Compound sub-selector above the grid
  when applicable. Renders the drill panel below the grid when a
  card is open (drill content from spec 06+ — for now a placeholder
  reading "Drill for [KPI] arrives in spec 06").

### Page integration

`src/pages/BanmoreProduction.jsx` gains a `compound` state (default
"final"), forwards it to `KpiGrid`, and replaces the placeholder
copy in the main content slot with `<KpiGrid>` when
`section === "mix" AND category === "p"`. For other section/tab
combinations the existing placeholder copy continues to render
until spec 11 + 12 land.

### Polling

`KpiGrid` (or its parent) calls
`usePolledQuery(() => getKpis({...}), { interval: 60000, deps: [section, tab, compound] })`.
The 60s polling cadence is the Q-DATA-01 resolution. Dep changes
re-fetch immediately.

### Trend icon / drill behaviour for spec 05

- Trend Icon click → `useToast.info("Trend modal arrives in spec 10")`.
- Card click (drillable only) → toggles drill panel. Drill renders a
  centred placeholder; spec 06 swaps in OEE drill, spec 07 swaps in
  Production drill, spec 09 swaps in Downtime / Plan Compliance.

## Reuse check

- [x] Searched `src/components/common/`.
  - No KPI-card primitive there. Build in `src/components/production/`.
  - Promote `<KpiCard>` to `src/components/common/` later if Quality
    / Engineering specs reuse it verbatim — defer until that
    actually happens to avoid premature abstraction.
- Sparkline could be a shared primitive; same logic — defer.

## Data

- Reads from: `getKpis({ plantId: "banmore", section, tab, compound })`.
- Polling: 60 s.
- Writes to: none.
- Local state: `compound` (default "final"), `openDrillId` (default
  `null`).

## States

- Loading: KPI grid shows 4 `LoadingSkeleton` cards.
- Empty: never in Phase 1 (mock always returns 4 KPIs); fall back to
  a one-line "no KPIs configured" message defensively.
- Error: toast "Could not load KPIs"; grid stays in last-good state.
- Success: 4 cards rendered.

## Out of scope

- Drill panel content — spec 06 (OEE), 07 (Production), 09 (Downtime,
  Plan Compliance).
- Trend modal — spec 10.
- Other tabs (Q / C / D / M / S) — spec 12.
- Other sections (TBM / Curing / Stock) — spec 11.
- TyreType-based scaling — out for Banmore (PCR only locked).
- KPI export icons / per-card CSV — Phase 2.

## Done when

- Visiting `/banmore/production` with the default section (mix) and
  tab (p) shows the Master/Final sub-selector + 4 KPI cards.
- Toggling Master ↔ Final swaps the Production value to 285 / 183 MT
  and updates the other KPIs to the mocked-per-compound numbers.
- Each card shows: name + value + unit + sparkline + trend %.
- Clicking the Trend Icon toasts "spec 10".
- Clicking a drillable card body toggles a placeholder drill panel
  beneath the grid that names the active KPI; clicking again closes.
- KPI data refreshes every 60 s in the background (verify by
  watching the loading state on a manual `refetch` — `interval=60000`
  is configured even if you don't wait the full minute).
- `npm run check` exits zero.
- Manual click-through: shell + KPI grid + sub-selector interactions
  work; other section/tab combos still show the placeholder.
- Commit lands → `logs/history.md` gets the entry.
