# Spec: trend-modal

**Phase:** 1
**Route:** modal overlay launched from any KPI card's Trend Icon
**Status:** ready
**Blast radius:** YELLOW — cross-cutting (every KPI card uses it)

## Prerequisites
- Specs 01–09 — landed; KPI grid + Trend icon already in place
  (currently toasts "spec 10")

## Context

- CLAUDE.md, conventions.md
- BRD §9.2 (`FR-X6`–`FR-X9`) — Time Range selector
- BRD §9.3 (`FR-X10`–`FR-X17`) — KPI Trend Analysis modal
- docs/artifact.jsx (TrendPanel, pickChartType, TrendChart/TrendBar/TrendProgress)
- src/components/production/KpiGrid.jsx — opens the modal
- src/components/production/TimeRangeSelect.jsx — reused (visual)
- src/api/trends.js — adds `getTrend`
- src/lib/mockData.js — adds trend series per KPI per range
- src/components/common/ (useToast — for error path)

## Assumptions in play

None. Q-TR-01 (four presets: Today / Week / Month / Year + custom)
already resolved and informs the time range selector.

## Purpose

Wire the existing Trend Icon to a real modal. The icon currently
calls `toast.info("Trend modal arrives in spec 10.")` from `KpiGrid`;
this spec replaces that with the modal per BRD §9.3.

## Scope

### Chart-type rules (FR-X13)

- **Line** for continuous rate KPIs (OEE %, FTQ %, Scrap Rate %,
  MTBF, kWh/MT, Power Factor, Plan Compliance %, …).
- **Bar** for discrete count KPIs (Breakdown Hours, NCM Hold,
  Customer Complaints, Production Loss ₹, Repeat Failures,
  Anomalies, Downtime, Production volume, …).
- **Progress bar** for counter KPIs (Days Without Reportable
  Incident, Safe Days, …).

Implemented as `pickChartType(kpiId, unit, value)` in
`src/components/trend/pickChartType.js`. For Phase 1 KPIs:
- `oee`, `plan-compliance` → line
- `production`, `downtime` → bar
- counters → progress (no counters in Phase 1, but the function
  handles them so spec 11/12/14 don't need to extend the picker).

### Mock data

`src/lib/mockData.js` gains `MIXING_PRODUCTIVITY_TRENDS` keyed by
`${compound}/${kpiId}/${range}`. Each entry: `{ labels, values }`.

For Phase 1, four ranges are seeded per (compound, KPI):
- `today` — 8 hourly points
- `week` — 7 daily points
- `month` — 12 trailing-3-day points (so the line is readable)
- `year` — 12 monthly points

That's 4 KPIs × 2 compounds × 4 ranges × ~10 points = ~320 numbers.
Manually authored for visual sensibility, not from a generator.

### API

`src/api/trends.js` — implement:
- `getTrend({ plantId, kpiId, range, from, to, compound })` →
  `Promise<{ labels: string[], values: number[] }>`. Custom date
  range (`from`/`to`) falls back to `month` for Phase 1.

### Components in `src/components/trend/`

- **`pickChartType.js`** — pure function returning `"line"` | `"bar"`
  | `"progress"`.
- **`LineChart.jsx`** — SVG line chart. Plots a polyline, target
  dashed amber line (if `target` provided), best (green) + worst
  (red) point dots with BEST / WORST labels (FR-X14). X-axis
  labels along the bottom. Responsive width.
- **`BarChart.jsx`** — SVG bar chart. Same target / best / worst
  conventions.
- **`ProgressChart.jsx`** — large value + horizontal bar showing
  progress toward the target. No time axis — counters are point
  measurements.
- **`TrendModal.jsx`** — MUI `Dialog` (full-screen on tablet, large
  centered on desktop). Contents:
  - Header: "KPI TREND ANALYSIS" small caps label + KPI name large
    + close X. PCR/TBR pill only if `tyreType !== "all"` AND plant
    `≠ banmore` (Banmore is PCR-only).
  - Time range selector (4 presets + From/To); state local to the
    modal, defaults to "month".
  - Chart area: renders the selected variant via `pickChartType`.
  - No insight panel, no per-statistic tiles, no chart-type badge
    (explicitly excluded by FR-X15 / FR-X16).
  - Escape key + click-outside + X all close (MUI Dialog handles
    these by default).

### KpiGrid wiring

`KpiGrid` owns `trendKpiId` state. `handleTrendOpen` sets it
(instead of toasting). `<TrendModal>` mounts when non-null; closing
clears it.

## Reuse check

- [x] `TimeRangeSelect` from `src/components/production/` is reused
  as-is — same control, different host. Spec 04 already kept its
  state lifted via props; the modal just provides a different parent.
- [x] `useToast` for the rare error path.
- No new common primitive needed yet.

## Data

- `getTrend(...)` via `usePolledQuery` with `interval: 0` (modal is
  point-in-time; reopen for fresh data). Deps `[kpiId, range, from, to, compound]`.
- Local state: `range`, `from`, `to`.

## States

- Loading: small skeleton in the chart area.
- Empty: "No trend data for this period."
- Error: toast.
- Success: chart renders.

## Out of scope

- Real-time chart updates inside the open modal (close + reopen for
  refresh).
- Per-statistic tiles (Current / Target / Gap / Average / Best /
  Worst) — explicit non-goal per `FR-X15`.
- Chart-type badge ("LINE CHART") — explicit non-goal per `FR-X16`.
- Auto-generated Insight panel — explicit non-goal per `FR-X15`.
- Chart export.
- Hover tooltips on chart points (defer to a polish-phase spec).

## Done when

- Clicking the Trend Icon on any of the 4 Mixing/Productivity KPI
  cards opens the modal.
- Modal header reflects KPI name; close X / Escape / backdrop click
  all dismiss.
- Time range selector inside the modal works; switching presets
  re-fetches.
- OEE + Plan Compliance render as line charts; Production +
  Downtime render as bar charts. Charts include target line +
  BEST/WORST markers per `FR-X14`.
- `npm run check` exits zero.
- Manual click-through.
- Commit lands → `logs/history.md`.
