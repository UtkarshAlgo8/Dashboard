# Change Request: Downtime KPI + drill chain + multi-series plot

**ID:** CR-11
**Raised by:** Utkarsh (operational review on test/redis-cache)
**Raised on:** 2026-08-21
**Status:** implementing
**Relates to OQR:** adds Q-DT-01 (Total Downtime as frontend virtual kpi),
Q-DT-02 (deepest drill = per-event rows).

## What changes

The Productivity KPI grid under Mixing / Stock / TBM / Curing gains a
**Total Downtime** tile (replaces the existing static mock "Downtime"
tile) whose value is the **sum of the 6 OEE-availability-loss reason
leaves** for the active time window: `Breakdown + No Schedule + Power
Failure + Preventive Maintenance + Setup & Change + Operations/Material/Manpower`.
Click-through chain:

- **Total Downtime** (sum tile, level 0) →
- **Reason breakdown** (6-reason table with each reason's sum + % of
  total + drill arrow, level 1) →
- **Per-event rows** for the selected reason (date, machine, value
  sorted by value desc, level 2).

A plot icon on the Total Downtime tile opens a new **Downtime Plot**
in the same `TrendModal` shell, with:

- **View By pills**: `Overall | Reason`.
  - **Overall** = single series = sum of the 6 reasons per date.
  - **Reason** = one line per reason (6 lines).
- **Machines filter** (multi-select Autocomplete) visible when
  View By = Reason, scopes which machines' rows feed the chart.

OEE / Production / Plan Compliance tiles are unchanged.

## Why now (what gap surfaced)

`realdata.md §15` removed the legacy `Downtime` kpi_name from the
gold layer (its purpose served by the 6 OEE-availability-loss
reasons). The current dashboard's static "Downtime" mock tile is a
hard-coded scalar with no drill; operators chasing a downtime spike
on the production dashboard have no way to:
- See today's total downtime in the KPI grid.
- Break the total down by reason.
- Drill into the individual (date, machine) events that fired each
  reason.
- View an overall or per-reason trend over time.

CR-11 closes that gap with a single tile (sum of 6 reasons) and a
full drill chain + plot.

## Impact analysis

- **Files affected:**
  - `frontend/src/lib/kpi-transformer.js` — register a new
    "Total Downtime" tile per Productivity section with
    `rawName: "TotalDowntime"` (virtual) and `drillTargets` pointing
    at the 6 reasons + drill type for the new panel.
  - `frontend/src/components/trend/TrendModal.jsx` — add
    `DOWNTIME_SERIES_CONFIG` next to the OEE / Production configs;
    add a third thin wrapper `DowntimeTrendModal`; generalise the
    shared `MultiSeriesTrendModal` to accept array-returning
    `mainKpiName` (the 6-reason fetch); add the routing branch
    `kpi.id === "downtime"` (and `"downtime-total"` for the new
    tile's id).
  - `frontend/src/components/drills/downtime/DowntimeDrillPanel.jsx`
    — rewrite to render the reason-breakdown table + per-event
    drill; the existing implementation reads the dummy
    `Downtime_category` kpi and is effectively dead.
  - `frontend/src/pages/BanmoreProduction.jsx` — `DrillPanelRouter`
    "downtime" branch already exists; verify it routes to the new
    panel.
  - `frontend/src/lib/mockData.js` — replace the 4 static
    `id: "downtime"` tiles with `id: "downtime-total"` (Total
    Downtime) carrying a computed sum; mock the 6-reason breakdown
    for the drill chain.
  - `frontend/specs/05-mixing-productivity-kpis.md` +
    `09-other-drills.md` + `10-trend-modal.md` + `11-other-sections.md`
    — patch the KPI list / drill chain / trend modal references.
  - `frontend/docs/open-questions.md` — Q-DT-01 / Q-DT-02 already
    added in this CR.

- **Specs needing rewrite or revision:**
  - `frontend/specs/05-mixing-productivity-kpis.md` — KPI list
    (Downtime → Total Downtime).
  - `frontend/specs/09-other-drills.md` — replace the
    `Downtime_category`-based panel spec with the new
    `DowntimeDrillPanel.jsx` v2.
  - `frontend/specs/10-trend-modal.md` — add Downtime to the
    multi-series modal paths (Done-when bullets).
  - `frontend/specs/11-other-sections.md` — flag the section tiles
    the same way spec 05 does.

- **Specs already shipped that are now wrong:**
  - The spec 09 Downtime drill spec referenced the dummy
    `Downtime_category` kpi_name; no real-data path exists for it.

- **Migrations required:** No.

- **API contract breakage:** **None.** The v2 endpoint already
  accepts `drillKpis: [...]` arrays (max 32 entries); the 6 reasons
  fit comfortably. No new endpoint, no new param.

- **Frontend reuse-library impact:** None. The shared
  `MultiSeriesTrendModal` and `FilterRow` from CR-08/CR-09 are reused
  as-is. The downtime drill panel is a new component local to
  `src/components/drills/downtime/`.

- **Auth or data-model touchpoints:** None.

- **Blast radius:** YELLOW — touches the KPI grid, the trend modal
  routing, the drill router, and the mock layer. No backend, no API
  contract, no shared-primitive change.

## Decision

```
[x] Take now      - shipped on test/redis-cache
[ ] Queue
[ ] Defer
[ ] Reject
```

**Decided by:** Utkarsh
**Decided on:** 2026-08-21

## Implementation plan

### Sketch

1. **MultiSeriesTrendModal generalisation** — `mainKpiName` may
   return an array (the 6 reasons). `singlePayload.drillKpis`
   becomes `[...mainKpis, ...overlayKpis]`. `mainRows` filter uses
   `mainKpisArray.includes(r.kpi_name)` instead of `=== mainKpi`.
2. **`DOWNTIME_SERIES_CONFIG`** — `viewByOptions: [Overall, Reason]`,
   `defaultViewBy: "overall"`, `mainKpiName: () => [6 reasons]`,
   `groupField: (viewBy) => viewBy === "reason" ? "kpi_name" : null`,
   `machineFilterVisibility: (viewBy) => viewBy === "reason"`,
   `skuFilterVisibility: () => false`, `showCompare: () => false`,
   `showOverlay: false`, `mainUnit: "min"`,
   `mainTitleSuffix: "Downtime"`, `viewByLabel` returns the label.
3. **DowntimeTrendModal wrapper** — passes
   `DOWNTIME_SERIES_CONFIG` to `MultiSeriesTrendModal`. Routing in
   parent `TrendModal` adds a branch for `kpi.id === "downtime"` (and
   `"downtime-total"` for the new tile id).
4. **`kpi-transformer.js`** — register a `TotalDowntime` tile per
   Productivity section (Mixing / Stock / TBM / Curing) with
   `rawName: "TotalDowntime"` and `drillTargets: [6 reason names]`.
5. **`DowntimeDrillPanel.jsx`** v2 — top: reason-breakdown table (6
   rows: reason, sum, % of total, drill arrow). On reason click:
   per-event table (date, machine, value sorted by value desc). Uses
   `useDashboardFetch` or a sibling hook to fetch each reason's raw
   events in one call.
6. **`mockData.js`** — replace the 4 static `id: "downtime"` tiles
   with `id: "downtime-total"` carrying the sum of the 6 mock
   reasons; mock a small event list per reason for dev drill-down.
7. **Spec patches** — list above.

### Out of scope (deliberately)

- Backend virtual kpi_name plumbing. The 6 reasons exist as real
  gold kpi_names; the frontend sums them. Q-DT-01 logs this as an
  open assumption; revisit if a single-row "TotalDowntime" ever
  appears in gold.
- Adding a sub-reason taxonomy beyond the 6 leaves. Q-DT-02 logs
  that the deepest drill is per-event rows.
- View By `Machine` for the Downtime plot. Operators typically read
  reason trends; per-machine drill is reachable via the existing
  Production Plot's Machine view.
- Tests. Per `frontend/CLAUDE.md` "Do not write tests unless
  explicitly asked."

## Done when

- Mixing / Stock / TBM / Curing Productivity tiles each show "Total
  Downtime" with the summed value for the active time window.
- Clicking the tile opens a drill panel with a 6-reason table; each
  row shows reason, sum, % of total, and a drill affordance.
- Clicking a reason opens the per-event table for that reason
  (date, machine, value sorted desc).
- Clicking the plot icon opens the Downtime Plot modal with
  `View By: Overall | Reason`, Machines filter when Reason, no
  Overlay row.
- Manual click-through on each section confirms the chain renders
  data for mock mode and the data shape works for v2 mode.
- `npm run check` exits zero on all touched files.
- Conventional commit: `feat(frontend): Downtime KPI + drill chain +
  multi-series plot (CR-11)`.
