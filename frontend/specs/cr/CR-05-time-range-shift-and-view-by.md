# Change Request: time-range presets, shift selector, and Production "View by" toggle

**ID:** CR-05
**Raised by:** Vishwajit (artifact refresh)
**Raised on:** 2026-05-26
**Status:** draft
**Relates to OQR:** Q-TR-01 (time-range presets) — adds Q-SH-01 (shift filter scope) and Q-PD-01 (View-by data model)

## What changes

Three independent UI deltas, all surfaced by the new
[docs/artifact.jsx](../../docs/artifact.jsx) revision:

1. **Date filter:** preset pills drop "Week" — `Today / Month / Year` only.
2. **Shift:** a `<select>` (All Shifts / A / B / C) renders nested
   under the "Today" pill, **only** while `preset === "today"`. Hidden
   for Month/Year and for custom date ranges. State owned by the
   dashboard page.
3. **Production drill — View by / Unit toggles:**
   - Mixing: `View by` (Machine / SKU / Machine + SKU) + `Unit` (MT / Batches)
   - TBM / Curing: `View by` only
   - Stock: `View by` + `Unit` (Units / Kg)

## Why now (what gap surfaced)

The original BRD called out a single preset set and a single
production-drill table shape. The artifact refresh tightens the
header chrome (Week was redundant with custom range) and adds the
View-by lens after stakeholder review of shop-floor usage — operators
asked for the same data sliced by machine when chasing a downtime
spike, and by SKU when chasing a customer-order miss.

The shift filter was always implied in BRD FR-X but never specced
because Phase 1 mocks aren't shift-aware. The artifact now puts it
under Today only, which sidesteps the "shift across a month doesn't
make sense" trap.

## Impact analysis

- **Files affected:**
  - `src/components/production/TimeRangeSelect.jsx` (drop Week,
    accept `shift`/`onShiftChange` props, render select under Today)
  - `src/components/production/ProductionHeader.jsx` (pass shift
    state through; no own UI)
  - `src/pages/BanmoreProduction.jsx` (lift shift state to page,
    default `"all"`)
  - `src/components/drills/production/ProductionDrillPanel.jsx`
    (add `viewBy` + `unit` toggles, client-side aggregation for
    machine / sku / both views, unit conversion)
  - `src/components/trend/TrendModal.jsx` (drop Week from its own
    preset list to stay consistent)
  - `src/lib/mockData.js` — either:
    (a) extend TBM / Curing / Stock drill rows with `machine`, or
    (b) leave rows as-is and synthesise machine names in the panel
        (artifact pattern). **Recommend (a)** — single source of
        truth, keeps the panel simple.

- **Specs needing rewrite or revision:**
  - `specs/07-production-drill.md` — add View-by / Unit behaviour
  - `specs/04-production-dashboard-shell.md` — clarify shift state
    ownership, drop Week from time-range
  - `specs/10-trend-modal.md` — drop Week
  - `docs/open-questions.md` — log Q-SH-01 (shift filter wiring),
    Q-PD-01 (machine field in mock rows)

- **Specs already shipped that are now wrong:**
  - Spec 04 (header chrome lists Week as a preset)
  - Spec 07 (drill has no View-by lens)
  - Spec 10 (trend modal lists Week)

- **Migrations required:** No. Mock data lives in code; bump the
  trend-data `week` keys to unused (leave for now) or remove later.

- **API contract breakage:** None (Phase 1 is mock-only).
  Documenting: when the API lands, `shift` becomes a query param on
  Today-only endpoints; Production drill endpoints stay unchanged in
  shape since aggregation is client-side.

- **Frontend reuse-library impact:** None. `TimeRangeSelect` lives
  in `src/components/production/`. `DateRangeFilterDialog` from
  `common/` is unchanged.

- **Auth or data-model touchpoints:** None.

- **Blast radius:** YELLOW — touches one feature (Production
  dashboard chrome + drill), three files in production scope plus
  trend modal alignment, no API impact.

## Decision

```
[ ] Take now      - sliding [feature X] to next phase
[ ] Queue         - after current phase ships
[ ] Defer         - logged in docs/decisions.md, revisit trigger: ___
[ ] Reject        - reason: ___
```

**Decided by:**
**Decided on:**

## Open questions to resolve before implementing

- **Q-SH-01 (Shift filter wiring):** Does the shift selector
  filter mock data, or is it pure UI for Phase 1?
  *Default if unresolved:* pure UI — the dropdown changes state
  but no mock data is shift-tagged today. We add the prop hook so
  consumers can opt in later. Document as a known stub.

- **Q-PD-01 (Machine field on TBM/Cur/Stock rows):** Option (a)
  add `machine` field to each row in mockData.js, or (b) synthesise
  per-section in the panel like the artifact does?
  *Recommendation:* (a). Lower coupling, simpler renderer, easier
  to swap to live API later. Cost: ~40 line edits in mockData.js.

## Implementation plan

Filled in after decision and Q-SH-01 / Q-PD-01 are resolved.

### Sketch

1. `TimeRangeSelect`: remove `week` from `PRESETS`, accept optional
   `shift` / `onShiftChange` props. Render shift `<select>` when
   `preset === "today"` and `onShiftChange` is provided.
2. `ProductionHeader`: thread `shift` / `onShiftChange` through.
3. `BanmoreProduction`: own `const [shift, setShift] = useState("all")`,
   pass to `ProductionHeader`. Do *not* thread into drill API calls
   until Q-SH-01 is resolved (visible-only).
4. `ProductionDrillPanel`:
   - Add `viewBy` state (`"machine" | "sku" | "both"`, default
     `"machine"`) and `unit` state (`"MT" | "Batches"` for Mixing;
     `"Units" | "Kg"` for Stock; `null` for TBM/Cur).
   - Aggregate rows client-side per `viewBy`.
   - Render columns conditional on view + unit.
5. `TrendModal`: drop Week from its preset list.
6. `mockData.js`: add `machine` to TBM / Cur / Stock drill rows
   (per Q-PD-01 default).

## Done when

- All affected specs patched
- OQR updated with Q-SH-01, Q-PD-01 either resolved or logged
- New artifact saved to docs/artifact.jsx as the new visual reference
- logs/history.md reflects the change
- `npm run check` passes
- Manual click-through on each section: Mixing master+final +
  Machine/SKU/Both + MT/Batches; TBM and Curing all three view
  modes; Stock all three view modes + Units/Kg; Today shows shift
  select, Month/Year hide it
