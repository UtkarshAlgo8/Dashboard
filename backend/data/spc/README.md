# Temporary BTP SPC — Calender 4

`calender4.json` is a validated conversion of `SPC_Calender4_5Nov.xlsx` following `SPC_Calender4_Dashboard_Guide.md`. Both files were provided externally. No workbook is opened on HTTP requests and no rows are written to gold.

## Behavior

- Enabled by default; set `SPC_CALENDER4_STATIC_ENABLED=false` and restart the backend to disable.
- Ten combinations across six recipes and two parameters (not every recipe has both parameters), 40 published capability cells, 20 spec reference rows, 448 readings.
- KPI snapshot: **2026-11-05**. Included only on that selected day or when that date is inside the requested inclusive range. With no date, the available snapshot is included.
- Global shift does **not** filter Excel capability or measurements. All supporting readings are retained and their actual coverage is recorded in API metadata.
- Source provenance stays in backend/API metadata for maintenance and removal. User-facing SPC cards, charts, trends and alerts do not display Excel/temporary-source labels or notices; snapshot, filter scope and statistical chart labels remain accurate.
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

Review the generated JSON diff, snapshot/coverage, statuses and validation output, then deploy the fixture with the backend. The importer rejects missing sheets, wrong machine/scope, empty recipes, unknown parameters, duplicate metrics/samples, incomplete KPI sets, and invalid spec limits/readings.

Dates are decoded from Excel serial calendar/time components, not host-local JavaScript Dates. Preserve the displayed workbook timestamp; the source timezone is unspecified.

The JSON version includes the source SHA-256. All merged backend cache keys include this version (or disabled state), including Redis. Frontend SPC data is memory-cached for at most 30 seconds; reload after a backend-only deployment to see changes immediately. No global cache flush is needed.

## Retire

Disabling the flag is a rollout safeguard, **not the final cleanup**. Once complete live data and chart methodology are verified for all ten combinations, remove the temporary implementation in one cleanup PR.

### Removal checklist

1. Disable the supplement and verify live overview counts, filters, detail, alerts, trends and observation drill-downs.
2. Delete the temporary-only files:
   - `backend/data/spc/calender4.json` and this operational README.
   - `backend/tools/import-spc-calender4.js`.
   - `backend/src/quality/spc/static-calender4.js`.
   - `backend/src/quality/spc/calender4.test.js` and `calender4-controller.test.js`; migrate any useful live regression coverage before deleting them.
   - `docs/superpowers/plans/2026-11-03-btp-spc-calender4-excel-overlay.md` once its removal checklist is completed.
3. Remove the temporary merge/selection adapter in `backend/src/quality/spc/sources.js`; move any genuinely needed live-only behavior to the normal live path rather than retaining an unused overlay layer.
4. Remove all static imports, source-selection branches, static context builders and fixture-version cache keys from `backend/src/quality/controllers/spc.controller.js`. Give live-only response caches a fresh namespace so older merged Redis entries cannot be reused; do not flush unrelated caches.
5. Remove `SPC_CALENDER4_STATIC_ENABLED` from configuration, `.env.example` and any deployment environment where it was set. Remove the Calender 4 exceptions from the root `.gitignore`.
6. Remove Excel-only source labels, notices, snapshot/shift exceptions and conditional rendering from `frontend/src/pages/quality/QualityDashboard.jsx`. Review temporary API/cache handling in `frontend/src/api/quality.js` and retain it only if still justified for live SPC.
7. Audit `backend/src/quality/spc/individuals.js` and `frontend/src/lib/spcCharts.js`: keep only functionality actually used by the live feed, move it into the normal live implementation, and remove unused helpers. Do not keep speculative reusable code or dead branches. Preserve permanent SPC improvements such as per-metric published status colors and segment gaps if the live charts need them.
8. Search application code, configuration, scripts, fixtures and documentation for `calender4`, `SPC_CALENDER4_STATIC_ENABLED`, `static_excel`, `Temporary Excel`, `eligibleCalender4`, `selectedStatic`, `SpcExcelSource` and the source workbook name. Investigate every remaining match; no dangling imports, dead tests, unused dependencies, static-source notices or temporary setup instructions should remain. Do not remove the existing `xlsx` dependency unless no other project feature uses it.
9. Run the live SPC regression tests, frontend build/check and browser smoke tests; deploy both applications and verify normal live-only behavior. The deployed containers must no longer contain the fixture/importer or require the temporary flag.

Browser-smoke harnesses and screenshots used during implementation were kept under `/tmp`, not committed as application tooling. No upload UI, background importer, database objects or additional dependencies were introduced for this supplement.
