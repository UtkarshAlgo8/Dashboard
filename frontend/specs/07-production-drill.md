# Spec: production-drill

**Phase:** 1
**Route:** `/banmore/production` (drill panel when Production KPI open, Mixing section)
**Status:** draft
**Blast radius:** GREEN — single drill panel

## Prerequisites
- Spec 05 (KPI grid + drill toggle)

## Purpose

Implement the compound-wise Production drill-down per BRD §6.10
(`FR-P43`–`FR-P49`).

## Scope

- Header reflects active Mixing sub-selector ("Master Compound" /
  "Final Compound").
- Machine search bar + "X of Y compounds" indicator.
- Table columns: Machine | Item Code | Planned (MT) | Actual (MT) |
  Batches Plan | Batches Actual | Variance.
- Variance colour: green ≥ 0%, amber 0% to −5%, red < −5%.
- Sticky header, 340px max-height, scrollable.

## Out of scope
- Per-row drill into batches (not in BRD).
- Variance edit / annotate (read-only Phase 1).
