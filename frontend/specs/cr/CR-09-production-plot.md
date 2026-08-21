# Change Request: Production Plot — multi-series modal (Overall / Product Type / Machine / SKU) + filters, drop legacy single-series for Production

**ID:** CR-09
**Raised by:** Utkarsh (operational review of OEE/Production Plot iteration on test/redis-cache)
**Raised on:** 2026-08-21
**Status:** implementing
**Relates to OQR:** none — Production `product_type` is populated (NOT in PRODUCT_AGNOSTIC_KPIS), `sub_section` is populated, `machine` is populated. No new assumption to log.

## What changes

The Production KPI card's trend modal (opened from the sparkline, currently
routed through `LegacyTrendModal` as a single-series chart) gets the same
multi-series treatment as the OEE Trend Modal landed in CR-08:

1. **View By pills**: `Overall | Product Type | Machine | SKU`. (SKU is
   the `sub_section` gold column for Production; "Product Type" is the
   real `product_type` column, which IS populated for Production rows —
   no `tyre_type` stand-in needed.)
2. **Machines filter** (multi-select `Autocomplete`): scopes which
   machines' rows feed the chart. Visible when View By = Machine or
   Product Type.
3. **SKU filter** (multi-select `Autocomplete`): scopes which SKUs'
   rows feed the chart. Visible only when View By = SKU.
4. **COMPARE row**: visible only when View By = Product Type (picks
   which product types draw as lines). Hidden for the other view-bys
   because each filter takes its role.
5. **No overlay**: the OVERLAY row and the combined overlay chart are
   removed for Production.
6. **Refactor**: the OEE pills/filter/chart machinery is extracted into
   a shared `MultiSeriesTrendModal` component parameterised by a
   `seriesConfig`. OeeTrendModal and the new ProductionTrendModal
   become thin wrappers.

No backend changes. No API contract change. Routing gains one more
branch (`kpi.id === "production"`).

## Why now (what gap surfaced)

The Production Plot landed as a single-series line/bar chart in spec 10.
Operators reviewing a Production spike today can only see the section
total or a pre-pinned `subSection` / `productType` trend; switching
between machines or SKUs requires closing the modal and drilling
through the panel.

CR-08 made the OEE Trend Modal multi-series. Operators asked for the
same UX for Production — they want to compare lines per machine or per
SKU on the same chart, and scope by machine/SKU during a yield
investigation without losing the lens they were on.

The OEE and Production pills/filter/chart patterns are now identical
in shape; only the data layer differs (kpi_name mapping, group fields,
filter visibility, overlay presence). Refactoring to a shared
component is the smallest change that doesn't duplicate ~150 lines and
that won't drift between the two modals.

## Impact analysis

- **Files affected:**
  - `src/components/trend/TrendModal.jsx` (refactor + new wrapper)
  - `specs/10-trend-modal.md` (change log + Scope + Done-when)
  - `specs/cr/CR-09-production-plot.md` (this file)

- **Specs needing rewrite or revision:**
  - `specs/10-trend-modal.md` — Scope / Done-when.

- **Specs already shipped that are now wrong:**
  - `specs/10-trend-modal.md` Scope lists Production as a legacy
    single-series chart. Done-when still says "Production + Downtime
    render as bar charts" (CR-08 partially addressed OEE only).

- **Migrations required:** No.

- **API contract breakage:** None. Same `/dashboard/kpi-data`
  endpoint, same payload shape. Production rows already carry
  `product_type` populated.

- **Frontend reuse-library impact:** None. The new
  `MultiSeriesTrendModal` lives in `src/components/trend/` — project
  local. No common-primitive change; `Autocomplete` is reused the
  same way CR-08 used it for the Machines filter.

- **Auth or data-model touchpoints:** None.

- **Blast radius:** YELLOW — one feature (Production trend modal),
  but the refactor is GREEN because it touches only the trend-modal
  file.

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

1. **TrendModal.jsx — extract `seriesConfig`.** A small shape that
   captures everything that varies between OEE and Production:
   ```js
   seriesConfig = {
     viewByOptions,                     // [{ value, label }]
     defaultViewBy,                     // "overall"
     mainKpiName(viewBy, sectionName),  // → string
     groupField(viewBy),                // → string | null
     machineFilterVisibility(viewBy),   // → boolean
     skuFilterVisibility(viewBy),       // → boolean
     showCompare(viewBy),               // → boolean
     showOverlay,                       // → boolean
     mainUnit,                          // → string  (chart y-axis unit)
     mainTitleSuffix,                   // → string  (e.g. "OEE")
   }
   ```
2. **Extract `MultiSeriesTrendModal` (project-local).** Moves into a
   shared component:
   - The single-trip `usePolledQuery` fetch (already single-trip
     post-CR-08).
   - All `useMemo`s: `mainRows`, `filteredMainRows` (machine + SKU
     filters), `machineOptions`, `skuOptions`, `overlayRowsByKpi`,
     `compareOptions`, `activeCompare`, `mainChart`, `overlayChart`
     (overlay only when `showOverlay`).
   - `buildMainChart` becomes parameterised by `config.groupField`.
   - The pills/filter/chart JSX (conditionally rendered per
     config).
3. **`OeeTrendModal` becomes a thin wrapper** passing the OEE config:
   - `viewByOptions`: `Overall | Product Type | Machine` (3 — no
     SKU; CR-08 final).
   - `mainKpiName`: `"OEE_m"` for Machine; `"OEE_o"` otherwise.
   - `groupField`: `"machine"` for Machine; `"tyre_type"` for
     Product Type (Q-OEE-01); `null` for Overall.
   - `machineFilterVisibility`: Machine or Product Type.
   - `skuFilterVisibility`: always `false`.
   - `showCompare`: Product Type only.
   - `showOverlay`: `true`.
   - `mainUnit`: `"%"`; `mainTitleSuffix`: `"OEE"`.
4. **`ProductionTrendModal` becomes a thin wrapper** passing the
   Production config:
   - `viewByOptions`: `Overall | Product Type | Machine | SKU` (4).
   - `mainKpiName`: `PRODUCTION_KPI_BY_SECTION[sectionName]` for all
     viewBys (the section-conditional kpi_name).
   - `groupField`: `"machine"` for Machine; `"product_type"` for
     Product Type; `"sub_section"` for SKU; `null` for Overall.
   - `machineFilterVisibility`: Machine or Product Type.
   - `skuFilterVisibility`: SKU only.
   - `showCompare`: Product Type only.
   - `showOverlay`: `false` — overlay row absent.
   - `mainUnit`: `kpi.unit` (the card's pinned unit); `mainTitleSuffix`:
     `kpi.name`.
5. **TrendModal top-level routing** gains `kpi.id === "production"` →
   `<ProductionTrendModal />`. `LegacyTrendModal` keeps its path for
   every other KPI (Scrap, FTQ, MTBF, Downtime, …).
6. **`specs/10-trend-modal.md` patches:**
   - Change log adds CR-09 entry.
   - Scope describes both multi-series paths (OEE + Production)
     and notes that other KPIs stay on the legacy single-series
     form.
   - Done-when adds Production behaviour bullets.

### Out of scope (deliberately)

- Migrating other KPIs (Scrap, FTQ, MTBF, Downtime, …) to the
  multi-series UI. The CR is for Production only.
- Touching `OeeDrillPanel`, `ProductionDrillPanel`, or any other
  drill surface.
- New backend kpi_names or schema changes.
- Tests. Per `frontend/CLAUDE.md` "Do not write tests unless
  explicitly asked."

## Done when

- TrendModal.jsx compiles (`npm run check` exits zero on my files).
- Routing: clicking the Trend Icon on a Production KPI card opens
  `ProductionTrendModal`; clicking on an OEE card opens
  `OeeTrendModal`; every other KPI still opens
  `LegacyTrendModal`.
- Production modal:
  - View By = Overall: single series.
  - View By = Product Type: one line per `product_type`; COMPARE
    visible (pick product types); Machines filter visible.
  - View By = Machine: one line per machine; COMPARE hidden; Machines
    filter visible (pick machines).
  - View By = SKU: one line per sub_section; COMPARE hidden; SKU
    filter visible (pick SKUs).
  - No OVERLAY row anywhere.
- OEE modal still works as shipped in CR-08 (regression).
- `specs/10-trend-modal.md` Scope + Done-when patched.
- Conventional-commit message:
  `feat(frontend): Production Plot — multi-series modal (CR-09)`.
