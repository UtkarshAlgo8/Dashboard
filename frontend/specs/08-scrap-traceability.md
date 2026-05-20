# Spec: scrap-traceability

**Phase:** 1
**Route:** `/banmore/production` (nested drill — OEE → Banbury → Quality → Scrap → Item Code)
**Status:** ready
**Blast radius:** YELLOW — touches OEE sub-drill + new panel + CSV download

## Prerequisites
- Spec 06 (OEE drill, Quality/Scrap sub-drill already renders scrap rows with the `traceable` flag).

## Context

- CLAUDE.md, conventions.md
- BRD §6.11 (`FR-P50`–`FR-P59`)
- BRD §9.5 (`FR-X28`) — UTF-8 BOM on CSV
- docs/artifact.jsx — traceability section (look for `Scrap Trace`)
- src/components/drills/oee/SubDrill.jsx — Scrap row renderer
- src/api/drills.js — adds `getScrapTraceability`
- src/lib/mockData.js — adds Production ID records + parameter ranges
- src/lib/csv.js — new utility (RFC 4180 escaping + UTF-8 BOM)

## Assumptions in play

None. Behaviour described in BRD; Q-EXP-01 (browser-only export)
applies for the trigger pattern (no server-side CSV).

## Purpose

The scrap rows in spec 06's Quality/Scrap sub-drill carry a
`traceable: true` flag. Spec 08 makes those rows clickable, opens
the Production ID panel below the scrap table, and ships the
CSV-download flow with RFC 4180 escaping + UTF-8 BOM.

## Scope

### Mock data additions

`src/lib/mockData.js` gains `SCRAP_TRACEABILITY` keyed by
`${plantId}/${section}/${machineId}/${itemCode}`. Each entry is an
array of Production ID records.

Production ID record shape:
```js
{
  productionId: "B1-2026-1015-A-001",
  shift: "A",                      // A | B | C
  operator: "R. Kumar",
  produced: 1800,                  // kg
  scrap: 95,                       // kg
  scrapReason: "Underdispersion",
  batchLot: "MST-001-LOT-0042",
  dateTime: "2026-10-15T07:23:00", // ISO
  params: {
    dropTemp: 152,                 // °C
    tcu: 68,                       // °C
    rotor: 41,                     // rpm
    mixTime: 198,                  // s
    power: 234,                    // kW
  },
  alarmParam: null,                // "dropTemp" | "tcu" | … | null
}
```

Plus `BANBURY_PARAM_RANGES` — normal ranges that drive the out-of-range
flag and the tooltip on each chip (per `FR-P55`):
```js
{
  dropTemp: { min: 145, max: 158, unit: "°C", label: "Drop Temp" },
  tcu:      { min: 60,  max: 78,  unit: "°C", label: "TCU"       },
  rotor:    { min: 35,  max: 45,  unit: "rpm", label: "Rotor"    },
  mixTime:  { min: 180, max: 220, unit: "s",  label: "Mix Time"  },
  power:    { min: 220, max: 260, unit: "kW", label: "Power"     },
}
```

The `alarmParam` field is a convenience for the CSV "Alarm Parameter"
column. It's also derivable at render time (find the first param
outside its range), but pre-computing it keeps the CSV column
deterministic.

Spec 08 fills records for the traceable scrap entries already seeded
in spec 06 (`banmore/mix/banbury-1/COMP-FIN-001`,
`banmore/mix/banbury-2/COMP-FIN-002`, etc.).

### API

`src/api/drills.js` — implement:

- `getScrapTraceability({ plantId, section, machineId, itemCode })`
  → returns the array (or `[]` if no traceability data).

### CSV utility

New file `src/lib/csv.js`. Pure functions, no React:

- `escapeCsv(value)` — RFC 4180-compliant cell escaping. Wrap in
  double quotes if the value contains `,`, `"`, or `\n`. Internal
  `"` becomes `""`.
- `buildCsv(rows, headers)` — accepts an array of header strings and
  an array of row arrays; returns the full CSV string.
- `downloadCsv(filename, csvString)` — prepends UTF-8 BOM (`﻿`),
  creates a Blob, triggers download via an anchor element. Cleans up
  the object URL.

This utility belongs in `src/lib/` (not `src/components/common/`)
because it has no React surface. Specs 12+ may reuse it for table-
level CSV exports (BRD `FR-X28`).

### Components

- **`src/components/drills/oee/ScrapTraceabilityPanel.jsx`** — new.
  Opens below the SubDrill's Scrap table when a traceable row is
  clicked.
  - Breadcrumb: "OE › [Machine] › Quality › Scrap › [Item Code] ›
    Production IDs" (`FR-P52`).
  - "Download Traceability Report" button (right-aligned) that
    triggers the CSV download.
  - Table per `FR-P53`: Production ID (monospaced) | Shift (coloured
    pill A/B/C) | Operator | Produced (kg) | Scrap (kg) | Date &
    Time | Machine Parameters.
  - Machine Parameters column = 5 compact chips (`FR-P54`). Each
    chip: label + value + unit. Out-of-range chips get a red
    outlined background + warning icon (`FR-P55`). Hovering any chip
    shows a tooltip with the normal range.
  - Filename: `traceability_[ItemCode]_[YYYY-MM-DD].csv` (`FR-P57`).
  - CSV columns (16 total per `FR-P58`):
    1. Item Code
    2. Production ID
    3. Produced Quantity (kg)
    4. Scrap Quantity (kg)
    5. Produced By
    6. Production Date & Time
    7. Machine Name
    8. Shift
    9. Batch/Lot Details
    10. Scrap Reason
    11. Drop Temp (°C)
    12. TCU (°C)
    13. Rotor (rpm)
    14. Mix Time (s)
    15. Power (kW)
    16. Alarm Parameter

### SubDrill wiring

`SubDrill.jsx` — when rendering the `quality/scrap` detail table,
the existing Scrap rows already show a "Trace" chevron column for
`traceable: true`. Spec 08 makes those rows clickable:

- Hovering a traceable scrap row tints the row background.
- Clicking sets the active traceability target (`{ machineId,
  itemCode }`) → reveals `ScrapTraceabilityPanel` beneath the scrap
  table.
- Clicking the same row again closes the panel.

Selection state is owned by `OeeDrillPanel` (lifted) so changing
the selected A/P/Q cell or sub-category resets the traceability
state.

## Reuse check

- [x] `src/components/common/` — `EmptyState` for "no production IDs
  recorded" defensive case; `useToast` for download errors.
- [x] Drill structure follows the spec 06 pattern; no new common
  primitive needed.

## Data

- Reads from: `getScrapTraceability({ plantId, section, machineId, itemCode })`.
- Polling: fetch once on open; no `setInterval` (the data is
  point-in-time for a specific scrap incident).
- Writes to: none (CSV is client-side only).

## States

- Loading: skeleton table rows.
- Empty: dashed-border "No Production IDs recorded for this item code
  in this period."
- Error: toast "Could not load traceability report".
- Success: header + table render; Download button enabled.

## Out of scope

- Server-side PDF or CSV (Q-EXP-01 — browser only).
- Per-row CSV (only the bulk download per item code).
- Editing scrap reasons or alarm flags (read-only Phase 1).
- Production ID drill into per-batch detail — not in the BRD.

## Done when

- Spec 06's Quality/Scrap sub-drill rows with `traceable: true` are
  visually distinguishable (cursor pointer + hover tint).
- Clicking one opens the ScrapTraceabilityPanel below the sub-drill.
- Breadcrumb shows all five levels per `FR-P52`.
- Production ID table renders with all 7 columns; Shift pill colour
  varies by A/B/C; parameter chips show all 5 readings.
- Out-of-range chips have red outline + warning icon + tooltip
  showing the normal range.
- Clicking "Download Traceability Report" downloads a CSV with the
  correct filename, UTF-8 BOM (verify in a hex viewer or by opening
  in Excel without mojibake), 16 columns, RFC 4180 escaping
  (verify with an item code containing a comma — there isn't one
  in mock data but the helper is correct).
- Re-clicking the same scrap row (or switching sub-category /
  A-P-Q cell) closes the panel.
- `npm run check` exits zero.
- Manual click-through passes the above.
- Commit lands → `logs/history.md` gets the entry.
