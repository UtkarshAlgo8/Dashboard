# Temporary BTP SPC — Calender 4

`calender4.json` is a validated conversion of `SPC_Calender4 (2).xlsx` following `SPC_Calender4_Dashboard_Guide.md`. Both files were provided externally. No workbook is opened on HTTP requests and no rows are written to gold.

## Behavior

- Enabled by default; set `SPC_CALENDER4_STATIC_ENABLED=false` and restart the backend to disable.
- Eight combinations (four recipes × two parameters), 32 published capability cells, 16 spec reference rows, 1,022 readings.
- KPI snapshot: **2026-11-02**. Included only on that selected day or when that date is inside the requested inclusive range. With no date, the available snapshot is included.
- Global shift does **not** filter Excel capability or measurements. All supporting readings are retained and the UI labels their actual coverage.
- Each overlapping combination stays wholly Excel-backed until a complete mapped live combination (four published metric rows, usable limits, nonempty measurements) is available. No mixed gold capability / Excel measurement combinations.
- Current Calender 4 has no live silver mapping. Before adding one, verify its source schema, units, deviation basis, limits, and segment semantics; do not activate a mapping just because gold contains the machine name.
- Published capability values/statuses are never recalculated or averaged. Spec limits are LSL/USL, not UCL/LCL.
- Charts use actual minus setpoint, individual readings, within-segment moving ranges and X-chart Nelson rules. First MR reading per run is blank. Sigma within is mean valid MR / 1.128. No source unit/timezone is invented.
- Gold failures remain errors. Missing silver is reported as a warning rather than silently presented as verified live readiness.

## Replace the workbook

From the repository root:

```sh
node backend/tools/import-spc-calender4.js '/path/to/SPC_Calender4.xlsx'
node --test backend/src/quality/spc.test.js backend/src/quality/spc/*.test.js
```

Review the generated JSON diff, snapshot/coverage, statuses and validation output, then deploy the fixture with the backend. The importer rejects missing sheets, wrong scope, unknown recipes/parameters, duplicate metrics/samples, incomplete KPI sets, and invalid spec limits/readings.

Dates are decoded from Excel serial calendar/time components, not host-local JavaScript Dates. Preserve the displayed workbook timestamp; the source timezone is unspecified.

The JSON version includes the source SHA-256. All merged backend cache keys include this version (or disabled state), including Redis. Frontend SPC data is memory-cached for at most 30 seconds; reload after a backend-only deployment to see changes immediately. No global cache flush is needed.

## Retire

Validate complete live data and chart methodology for all eight combinations, disable the flag, and check overview counts, filters, detail, alerts and trends. Remove the fixture, importer and static adapter in a later change; keep reusable individuals/MR helpers if the live feed needs them.
