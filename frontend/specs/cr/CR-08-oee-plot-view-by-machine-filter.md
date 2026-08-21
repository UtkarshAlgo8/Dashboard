# Change Request: OEE Plot — View By (Overall / Product Type / Machine) + Machine filter, drop SKU and Shift

**ID:** CR-08
**Raised by:** Utkarsh (operational review of OEE Plot iteration on test/redis-cache)
**Raised on:** 2026-08-21
**Status:** implementing
**Relates to OQR:** adds Q-OEE-01 (View-by Product Type maps to `tyre_type`)

## What changes

The OEE Trend Modal (opened from the OEE KPI card sparkline, mounted in
[BanmoreProduction.jsx](../../../pages/BanmoreProduction.jsx) and routed from
[TrendModal.jsx](../10-trend-modal.md)) gets a tighter View By set and a
dedicated machine filter:

1. **View By pills** drop SKU and Shift. The set becomes
   `Overall | Product Type | Machine`.
2. **A multi-select "Machines" filter** (MUI `Autocomplete multiple`)
   sits above the chart and scopes which machines' rows feed the
   chart. Empty selection = all machines. Visible only when
   View By = Machine or View By = Product Type (it has no semantic
   when View By = Overall, which is section-aggregated).
3. **Compare row** is hidden when View By = Machine (the Machines
   filter takes its role) and kept for View By = Product Type so the
   user can pick which product types draw as lines. Hidden as before
   when View By = Overall.
4. **Dead Shift code removed.** With View By = Shift gone, the
   `shiftPayloads` / `shiftQueries` fan-out, `isShift` constant,
   shift branch in `buildMainChart`, shift branch in
   `compareOptions`, and the `granularityToShiftLabel` helper are all
   deleted. The modal becomes single-trip.

No backend changes. No API contract change.

## Why now (what gap surfaced)

The OEE pills UI was layered onto spec 10 by recent PRs (`f160c44`,
`65783f1`, `9404318`) without a CR document. Stakeholder feedback on
the live plot:

- **SKU option is misleading.** It maps to `OEE_s` / `sub_section`
  (Curing trench / Stock subsection), not actual SKU data. The label
  implies a granularity that does not exist; the section-level
  `OEE_o` is the correct analogue and lives under "Overall".
- **Shift view rarely carries signal** for OEE (gold rows for OEE
  kpis are DAY-granular; shift granularity on OEE only returns data
  where the source actually tagged it — usually none). It
  complicated the fetch shape (three parallel calls) for a payload
  that mostly came back empty.
- **Machine selection needs to be a filter.** Stakeholders asked for
  multi-machine scoping without forcing a View By flip — they want
  to read the same lens (e.g. Product Type) but limit it to two
  specific lines during a downtime spike. Today View By = Machine is
  the only way to do that, and the COMPARE row only narrows the
  lines, never the data.
- **Product Type was missing.** Operators compare product types when
  chasing a quality or yield issue; without this lens the chart only
  showed the section aggregate and per-machine lines.

## Impact analysis

- **Files affected:**
  - `src/components/trend/TrendModal.jsx` (only code file)
  - `src/components/trend/MultiSelectPills.jsx` (no change — still
    used by COMPARE for Product Type and by OVERLAY)
  - `docs/open-questions.md` (add Q-OEE-01)
  - `specs/10-trend-modal.md` (revise Scope section to reflect the
    new View By set and the Machines filter; the spec is otherwise
    intact)

- **Specs needing rewrite or revision:**
  - `specs/10-trend-modal.md` — Scope / Done-when sections.

- **Specs already shipped that are now wrong:**
  - `specs/10-trend-modal.md` Scope lists the four-pill View By
    (Overall / Machine / SKU / Shift) which no longer matches the
    code.

- **Migrations required:** No.

- **API contract breakage:** None. The modal still posts to
  `/dashboard/kpi-data` with the same payload shape; only the
  client-side `VIEW_BY_OPTIONS` and grouping branches change.

- **Frontend reuse-library impact:** None. `Autocomplete` is an MUI
  v5 default export (already a dep). `MultiSelectPills` is reused
  for COMPARE / OVERLAY as before. No new component file — the
  filter is inline in `TrendModal.jsx`, mirroring how
  `MultiSelectPills` itself was kept local until a second consumer
  appears (per `conventions.md` §"Shared component library").

- **Auth or data-model touchpoints:** None.

- **Blast radius:** GREEN — single file. One component, no API
  impact, no shared-primitive change.

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

1. **TrendModal.jsx — imports.** Add `Autocomplete` and `TextField`
   to the MUI import group.
2. **`VIEW_BY_OPTIONS`.** Drop `sku` and `shift`; add `product_type`.
3. **`viewByMainKpi`.** Drop `sku` mapping; add
   `product_type → "OEE_o"`. Comment block notes that grouping by
   product type happens client-side via the `tyre_type` field
   (Q-OEE-01 default).
4. **`OVERLAY_AVAILABILITY_BY_VIEW`.** Drop `shift` and `sku`; add
   `product_type → "Availability_o"`.
5. **`OeeTrendModal` state.** Add `const [machines, setMachines] =
useState([])`.
6. **`OeeTrendModal` derived state.** Add
   `machineOptions` (distinct `r.machine` in `singleRows`) and
   `filteredMainRows` (apply the Machines filter to `mainRows`).
7. **`OeeTrendModal` payload + fetch.** Drop `isShift`,
   `shiftPayloads`, `shiftQueries`, `shiftResults`, `shiftLoading`.
   The single-trip payload becomes unconditional.
8. **`mainRows` / `overlayRowsByKpi`.** Drop the `isShift` branches.
9. **`compareOptions`.** Drop `shift` (fixed A/B/C list) and `sku`
   (groups by `sub_section`) branches; add `product_type` (groups
   by `tyre_type`).
10. **`showCompare`.** Becomes `viewBy === "product_type"` (Machine
    view uses the Machines filter instead).
11. **`loading`.** Becomes `singleLoading` (drop shift path).
12. **JSX — Machines filter.** Above the chart, when
    `viewBy === "machine" || viewBy === "product_type"`, render an
    MUI `Autocomplete multiple` with `machineOptions`. Disabled with
    a tooltip while options are empty.
13. **`buildMainChart`.** Drop shift branch (group by granularity)
    and sku branch (group by `sub_section`); add `product_type`
    branch (group by `tyre_type`). Overall + Machine branches
    unchanged.
14. **`granularityToShiftLabel`.** Delete (no consumer after shift
    removal).
15. **Header comment (top of file).** Update the OEE description to
    mention "Multi-select Machines filter scopes which machines feed
    the chart" and drop the SHIFT three-trip note.
16. **`specs/10-trend-modal.md`.** Patch the Scope section to list
    the new View By set and the Machines filter. Patch Done-when to
    reflect the new behaviour.

### Out of scope (deliberately)

- Renaming `OEE_s` references elsewhere — `OEE_s` still backs the
  Curing Trench / Stock subsection drill in `OeeDrillPanel`; it is
  not the same thing as the deleted SKU View By pill.
- Touching `OeeDrillPanel`, `MachineTable`, or any other drill
  surface. The CR is scoped to the Trend Modal only.
- A true product-type OEE kpi_name. That would be a backend /
  pipeline change (see Q-OEE-01 default).
- Tests. Per `frontend/CLAUDE.md` "Do not write tests unless
  explicitly asked."

## Done when

- TrendModal.jsx compiles (`npm run check` exits zero).
- Manual click-through on a TBM card:
  - View By = Overall: single line.
  - View By = Product Type: one line per `tyre_type` (e.g. PCR /
    TBR). COMPARE row visible; pick 2 product types.
  - View By = Machine: one line per machine. COMPARE row hidden.
    Pick 2 machines via the filter.
- `specs/10-trend-modal.md` Scope + Done-when patched.
- `docs/open-questions.md` lists Q-OEE-01 with the `tyre_type`
  default.
- `logs/history.md` reflects the change.
- Conventional-commit message: `feat(frontend): OEE Plot — View By
Overall/Product Type/Machine + Machines filter (CR-08)`.
