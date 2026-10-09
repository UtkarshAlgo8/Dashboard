# Spec: engineering-dashboard-shell

**Phase:** 2
**Route:** `/banmore/engineering`
**Status:** draft — needs review
**Blast radius:** YELLOW — new page + route + nav-enablement change; no
existing page's behaviour changes. Touches `landingConfig.js` (shared).

## Prerequisites

- Spec 01 (app-shell) — landed
- Spec 02 (mock-data-layer) — landed
- Spec 03 (landing-page) — landed
- Spec 04 (production-dashboard-shell) — landed (pattern to mirror)
- Banmore Quality dashboard — landed (sibling function, same plant;
  check for a shared header/chrome extraction before duplicating)

## Context

- CLAUDE.md, conventions.md
- docs/open-questions.md — Q-NAV-01 (RESOLVED "visible-but-disabled,
  Phase 2 tooltip" — this spec proposes flipping that to enabled for
  Banmore / Engineering only; see Assumptions below)
- docs/roadmap.md — Phase 2 checklist item
  `specs/NN-engineering-dashboard.md`
- docs/artifact.jsx — visual reference is out of date for this
  function; the authoritative visual reference for Engineering is the
  standalone mockup `plant_operations_dashboard__28_ 1.html`
  (`function EngineeringDashboard`, tabs: Overall / Reliability /
  Maintenance / Utilities / Capex Projects / Ops & Compliance)
- src/lib/landingConfig.js (`PLANT_GEO.banmore.code === "BTP"`,
  `PHASE_1_ACTIVE_PLANTS`, `PHASE_1_NAVIGABLE_FUNCTIONS`)
- src/router.jsx
- src/pages/BanmoreProduction.jsx (composition pattern to mirror —
  header + tab strip + KPI grid area)
- src/pages/BanmoreQuality.jsx (sibling Banmore page — check for a
  shared header/chrome component before writing a third copy)
- src/components/common/ (search before adding new primitives)
- src/api/plants.js, src/lib/mockData.js

## Assumptions in play

- **Nav enablement**: Q-NAV-01 resolved Engineering as
  visible-but-disabled with a "Phase 2" tooltip, for all plants. This
  spec proposes enabling it for **Banmore only** (Engineering tile
  becomes a live link on the Banmore plant card; stays
  disabled/tooltipped for Chennai and all other plants). This is a
  new decision, not covered by the existing OQR resolution — **flag
  for confirmation before planning.** If not confirmed, default is to
  leave nav disabled everywhere and ship this dashboard reachable only
  by direct URL (`/banmore/engineering`) for review purposes.
- **Scope = shell only**, mirroring how Production was phased (spec
  04 = shell, 05 = KPI content, 06+ = drills). This spec ships page
  chrome, the 6-tab strip, and a KPI grid area per tab populated with
  real (mocked) top-level KPI values and status colouring — but no
  drill-down panels. Drill panels are heavy (each reference tab has
  its own multi-level drill tree) and ship as follow-on specs, one
  per tab, matching specs 06–09's per-topic split for Production.
- **Single plant target**: this spec builds `BanmoreEngineering.jsx`
  only, not a plant-parametrized `Engineering.jsx`. Chennai has no
  Engineering data in scope. If a second plant needs Engineering
  later, that spec addresses generalizing the page.
- Mock data is invented per the reference HTML's shape (same
  KPI names/units/targets/status) — it is illustrative content, not
  live plant figures. Flagged as an assumption since no BRD section
  yet documents Engineering KPI definitions in prose the way §6.1–6.3
  do for Production.

## Purpose

Stand up the Engineering Head Dashboard for Banmore (BTP) per the
reference mockup: a 6-tab dashboard (Overall, Reliability,
Maintenance, Utilities, Capex Projects, Ops & Compliance) showing a
KPI card grid per tab. After this spec lands, `/banmore/engineering`
renders full page chrome and real top-level KPI numbers with
status colouring; clicking a KPI card is inert until drill specs
(17+) land.

## User flow

1. From `/`, user opens the Banmore plant card.
2. (If nav enablement is confirmed) clicks the Engineering tile →
   lands at `/banmore/engineering`. Otherwise reached via direct URL.
3. Sees header chrome (back arrow, brand block, "Banmore Plant" /
   "BTP" label, time-range selector, export button, avatar — reusing
   the Production/Quality header pattern where shapes match).
4. Sees a 6-tab strip: Overall · Reliability · Maintenance ·
   Utilities · Capex Projects · Ops & Compliance. "Overall" is active
   by default.
5. Each tab shows a responsive grid of one-value KPI cards (label,
   value, unit, status-coloured left border, no sparkline unless the
   reference shows one, no click-to-drill in this spec).
6. Switching tabs swaps the KPI grid to that tab's KPI set.
7. Back arrow returns to `/`.

## UI elements

### `src/pages/BanmoreEngineering.jsx`

Composes the shell, mirroring `BanmoreProduction.jsx`'s top-level
structure but simplified (no section sidebar — Engineering has no
Mixing/TBM/Curing/Stock split, only the 6-tab strip). Also check
`BanmoreQuality.jsx` for any header/chrome pattern already extracted
for reuse across Banmore's functions — decide at plan time.

- `activeTab` state, default `"overall"`.
- `timeRange` state (reuse the same shape as Production's
  `TimeRangeSelect` local state; Today/Month/Year + optional Shift —
  pure UI in this spec, not threaded into any fetch).
- Calls `getPlant("banmore")` and a new `getEngineeringKpis("banmore",
  tabId)` via `usePolledQuery({ interval: 0 })`.
- Renders `ProductionHeader` directly (reused as-is, same pattern as
  `QualityDashboard.jsx`) with `tyreTypes={[]}`, `categoryTabs` set to
  the 6 Engineering tabs, `activeCategory`/`onCategoryChange` wired to
  `activeTab` state — no `EngineeringHeader.jsx` or
  `EngineeringTabs.jsx` needed, per reuse check below. Also renders
  `EngineeringKpiGrid`.

### `src/components/engineering/EngineeringKpiGrid.jsx`

Responsive CSS grid of `EngineeringKpiCard`. Loading / empty / error
states mirror `KpiGrid.jsx`.

### `src/components/engineering/EngineeringKpiCard.jsx`

One-value KPI tile per the reference `EKpiCard`: label (uppercase,
small), value + unit (large), left border coloured by `status`
(green/yellow/red/grey), optional target line, optional sparkline
(only where the reference KPI defines `sp`). Not clickable in this
spec (no drill panel exists yet) — reference's "expand to drill"
affordance and trend-icon button are both omitted here and added when
the corresponding drill spec lands, so no dead click targets ship.

### Mock data additions

`src/lib/mockData.js` gains, per the reference `RELIABILITY_KPIS`,
`MAINTENANCE_KPIS`, `UTILITY_KPIS`, `PROJECT_KPIS`, `OPS_KPIS`, and
the reference's `OVERALL_GROUPS` composite list:

- `ENGINEERING_TABS = [{ id: "overall", name: "Overall" }, { id:
  "reliability", name: "Reliability" }, { id: "maintenance", name:
  "Maintenance" }, { id: "utilities", name: "Utilities" }, { id:
  "projects", name: "Capex Projects" }, { id: "ops", name: "Ops &
  Compliance" }]`.
- One KPI array per tab, each entry `{ id, name, value, unit, target,
  status }` (status ∈ green/yellow/red/grey) — ported 1:1 from the
  reference's `RELIABILITY_KPIS` / `MAINTENANCE_KPIS` /
  `UTILITY_KPIS` / `PROJECT_KPIS` / `OPS_KPIS` constants, dropping any
  field this spec doesn't render (`drill`, `pareto`, `chart`,
  `chartData`, `multi`, `panel` — all consumed by later drill specs).
  "Overall" tab is the reference's curated cross-tab subset
  (`OVERALL_GROUPS`), same trimming rule.
- `getEngineeringKpis(plantId, tabId)` added to `src/api/plants.js`
  — same mock/HTTP switch as the other `get*` functions. Returns `[]`
  (not an error) for any `plantId !== "banmore"`.

## Reuse check

- [x] Searched `src/components/common/` — no KPI/stat/metric-card
  primitive exists (only `PageHeader`, `PageContainer`,
  `EmptyState`, `LoadingSkeleton`, dialogs, toast). Nothing to reuse
  for `EngineeringKpiCard`.
- [x] Compared `ProductionHeader.jsx` against the needed header
  shape. It is **already generalized** via props (`categoryTabs`,
  `tyreTypes`, both accept `[]` to suppress) and is **already reused
  as-is by `QualityDashboard.jsx`** (passes its own sub-tabs, empty
  tyre types) — confirmed precedent of one shared header across
  Banmore functions, not one bespoke header per function. Plan:
  reuse `ProductionHeader` directly for Engineering — pass
  `tyreTypes={[]}` and Engineering's own `categoryTabs` /
  `activeCategory` / `onCategoryChange` (the 6-tab strip). **No new
  `EngineeringHeader.jsx`.**
- [x] Compared `KpiCard.jsx` (536 lines, `src/components/production/`)
  against what this spec needs. Sparkline, progress bar, trend-open
  button, and drilldown-table icon are **unconditional** — no prop
  disables them, so reusing it here would ship dead click targets.
  Plan: write a new lightweight `EngineeringKpiCard.jsx` (label,
  value+unit, status-colour left border, optional target line — no
  sparkline/trend/drilldown affordances).

## Data

- Reads from: `getPlant("banmore")`, `getEngineeringKpis("banmore",
  activeTab)` via `usePolledQuery` with `interval: 0`.
- Writes to: none.
- Local state: `activeTab`, `timeRange`.

## States

- Loading: header renders immediately; KPI grid area shows
  `CircularProgress` while the active tab's KPIs resolve.
- Empty: never for `banmore` (mock always populated); shows an
  empty-state message for any other `plantId` reaching this page
  directly by URL (defensive, since nav routes here only for
  Banmore).
- Error: toast "Could not load Engineering dashboard".
- Success: shell + tab strip + populated KPI grid for the active tab.

## Out of scope

- All drill-down panels for every tab (Reliability breakdown/MTBF/
  MTTR trees, Maintenance PM/CBM compliance trees, Utilities energy
  breakdowns, Capex project detail, Ops & Compliance registers) —
  each ships as its own follow-on spec (17+), mirroring specs 06–09's
  per-topic split for Production.
- Trend modal / sparkline drill charts (reference's `TrendPanel`,
  `TechTrendPanel`, Pareto panels) — later spec.
- Anomaly strip, live-breakdown banner (reference's `AnomalyStrip`,
  `LiveBanner`) — later spec, if wanted at all (flag as open question
  if raised).
- Export/print wiring beyond the no-op button (matches spec
  13's Production precedent — wire once, reuse here, don't re-litigate).
- User-menu dropdown wiring (reuse Production's spec-14 component
  as-is once it exists; don't re-implement).
- FMEA tab (present in the older reference variant but absent from
  the current 6-tab `EngineeringDashboard` in the HTML supplied —
  confirm it's intentionally dropped, not missed, before planning).
- Chennai or any other plant's Engineering dashboard.
- Making the nav tile clickable (contingent on the Assumptions-section
  confirmation above).

## Done when

- `/banmore/engineering` renders the full shell without console
  errors.
- Header shows back arrow, brand block, "Banmore Plant" / BTP label,
  TimeRange (visual), Export button, avatar.
- 6-tab strip renders; clicking switches the active highlight and the
  KPI grid content.
- Each tab shows its real (mocked) KPI set with correct
  name/value/unit/status-colour, matching the reference constants.
- No KPI card is clickable / no drill panel exists yet.
- `npm run check` exits zero.
- Manual click-through: shell renders, tab switching updates the grid
  correctly for all 6 tabs.
- Commit lands → `logs/history.md` gets the entry.
