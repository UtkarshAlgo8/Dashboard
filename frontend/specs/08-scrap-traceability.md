# Spec: scrap-traceability

**Phase:** 1
**Route:** `/banmore/production` (nested drill: OEE → Machine → Quality → Scrap → Item)
**Status:** draft
**Blast radius:** YELLOW — multi-level drill + CSV download

## Prerequisites
- Spec 06 (OEE drill → Quality → Scrap sub-drill)

## Purpose

Implement scrap traceability flow per BRD §6.11 (`FR-P50`–`FR-P59`).
Item code → Production IDs → CSV download.

## Scope

- "Trace ▸" hint on item code rows that have traceability data
  (`FR-P50`).
- Clicking a traceable row opens the Production ID panel below the
  scrap table (`FR-P51`–`FR-P52`).
- Production ID table columns: Production ID (monospaced) | Shift
  (pill A/B/C) | Operator | Produced (kg) | Scrap (kg) | Date & Time
  | Machine Parameters (`FR-P53`).
- Machine Parameters as compact chips: Drop Temp / TCU / Rotor / Mix
  Time / Power (`FR-P54`).
- Out-of-range chips: red outline + warning icon + range tooltip
  (`FR-P55`). Ranges sourced from `src/lib/mockData.js` for Phase 1.
- Download Traceability Report button (`FR-P56`).
- CSV: filename `traceability_[ItemCode]_[YYYY-MM-DD].csv` with
  UTF-8 BOM prefix (`FR-P57`, `FR-X28`), 16 columns (`FR-P58`),
  RFC-4180 escaping (`FR-P59`).

## Out of scope
- Server-side CSV generation (client-side only).
- Bulk download (one item code at a time).
- Edit / annotate scrap rows.
