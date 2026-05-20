# Spec: other-sections

**Phase:** 1
**Route:** `/banmore/production` (TBM, Curing, Stock sections)
**Status:** draft
**Blast radius:** GREEN — reuses spec 05/06/07 patterns; this is parity work

## Prerequisites
- Spec 05 (Mixing KPIs landed)
- Spec 06 (OEE drill landed and reusable)
- Spec 07 (Production drill landed — needed for Mixing only, but
  Stock has a sub-selector that gates Production unit context)

## Purpose

Achieve visual + behavioural parity across the three remaining
sections per BRD §6.5–§6.7 and `function ProductionDashboard`
section-switching logic in `docs/artifact.jsx`.

## Scope

- **TBM (`FR-P13`, `FR-P14`)** — no sub-selector. Machines: VMI Max,
  VMI Exium, BJ Modules, Stage 1, Stage 2. KPIs same shape as Mixing
  (OEE / Production in nos / Downtime / Plan Compliance).
- **Curing (`FR-P15`, `FR-P16`)** — Tredge groups (Tredge 1–6) with
  press counts in parentheses. Units in nos.
- **Stock (`FR-P17`, `FR-P18`)** — sub-selector pills: 4 Roll, Extruder,
  3 Roll, Cutter, Slitter. Default 4 Roll. Switching updates the
  machine list shown in the OEE drill and the unit context for
  Production (units).

## Out of scope
- Other category tabs (Q/C/D/M/S/I) — spec 12.
