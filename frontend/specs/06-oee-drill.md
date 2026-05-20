# Spec: oee-drill

**Phase:** 1
**Route:** `/banmore/production` (drill panel below KPI grid when OEE card open)
**Status:** draft
**Blast radius:** YELLOW (single drill panel; sub-drill is nested but contained)

## Prerequisites
- Spec 05 (KPI grid + drill toggle)

## Purpose

Implement the OEE drill-down panel per BRD §6.9 (`FR-P25`–`FR-P42`)
and `function DrillPanel` / OEE branch in `docs/artifact.jsx`. Most
elaborate drill in the prototype; reused across all four sections in
later specs.

## Scope

- A/P/Q overall tiles (Availability / Performance / Quality) with
  threshold colours (`FR-P25`, `FR-P26`); Overall OEE is NOT shown as
  a fourth tile (`FR-P27`).
- Machine search bar with Clear button (`FR-P28`–`FR-P30`).
- Machine-wise breakdown table — sticky header, 340px max-height,
  scrollable (`FR-P31`–`FR-P37`). OEE % cell display-only; A / P / Q
  cells independently clickable with chevron.
- Per-machine sub-drill panel — breadcrumb "OE › [Machine] ›
  [Component]", sub-category pills (Breakdown / Setup / Startup /
  Tool Change for A; Minor Stoppage / Reduced Speed for P; Defect /
  Scrap for Q), filtered detail table (`FR-P38`–`FR-P41`).
- Empty-state for sub-drills with no data (`FR-P42`).

## Out of scope
- Scrap → Production ID drill (spec 08).
- TBM / Curing / Stock parity (spec 11 — reuses this renderer).
