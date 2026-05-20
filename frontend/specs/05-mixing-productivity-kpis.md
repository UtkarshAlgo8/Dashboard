# Spec: mixing-productivity-kpis

**Phase:** 1
**Route:** `/banmore/production` (Mixing section, Productivity tab)
**Status:** draft
**Blast radius:** YELLOW — one feature, KPI grid for one section/tab

## Prerequisites
- Spec 01, 02, 04 (shell + chrome ready)

## Purpose

Implement the default landing view of the Production dashboard: Mixing
section, Productivity tab. KPI grid with cards for OEE, Production (MT),
Downtime (hrs), Plan Compliance (%) per BRD §6.4 (`FR-P10`–`FR-P12`)
and §6.8 (`FR-P19`–`FR-P24`). See `function KpiCard` in
`docs/artifact.jsx`.

## Scope

- Mixing sub-selector pill: Master Compound / Final Compound, default
  Final (`FR-P10`, `FR-P11`).
- KPI card grid (responsive, re-flows at narrow widths per `FR-P19`).
- Per-card: KPI name (uppercase small) + value (large) + unit
  (subdued) + sparkline + trend % with up/down arrow (colour reflects
  favourability — e.g. up is bad for Scrap).
- Trend Icon button on every card → opens trend modal (spec 10 — for
  now wires up an event handler that toasts "trend coming in spec 10").
- Chevron on drillable cards (OEE, Production, Downtime, Plan
  Compliance all drill — `FR-P22`).
- Clicking the card body toggles the drill-down panel below the grid
  (drill content from specs 06/07/09).
- Polling: each KPI value re-fetches every 60s via `usePolledQuery`
  (Q-DATA-01).

## Reuse check (early)
- `<KpiCard>` is the key new component; surface it as candidate for
  common/ since Quality / Engineering reuse the pattern.
- Sparkline = small SVG primitive, probably common/.

## Out of scope
- Drill panel contents (specs 06/07/09).
- Trend modal (spec 10).
- Other sections (TBM, Curing, Stock) — spec 11.
- Other tabs (Q/C/D/M/S/I) — spec 12.
- The MANUAL badge (BRD `FR-Q3`) — Quality-only, deferred to Phase 2+.
