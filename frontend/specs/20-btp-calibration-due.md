# 20 — BTP Calibration Due (Engineering → Maintenance)

Source: user-supplied `calibration_due_kpi_dev_guide (1).md` (2026-11-11).

## Confirmed scope

- Add **Calibration Due** to Maintenance using the existing KPI card and right-hand drill area.
- Read Silver `fct_equipment_calibration`, strictly `plant_code = '1300'`. One row is one machine; do not sum instrument counts for the KPI.
- Main number: machines with 0–7 days left, inclusive. Small red text: all machines with negative days left, including BTPMI001 (2023 due date) until the data owner confirms it is obsolete.
- User confirmed a current IST snapshot independent of header dates, arbitrary ranges, and shifts. Explicitly label this exception on the card and drill.
- Six columns: Machine No, Machine Name, Instruments, Due Date (`dd-MMM-yyyy`), Days Left, Status. Earliest due date first; local Status filter defaults to All statuses.
- Overdue: red, negative days. Due this week: amber, 0–7 days. OK: green, more than 7 days. Strip double quotes from machine names for display only.
- Project-specific `CalibrationDrillPanel` reuses the shared table and MUI controls. No shared-library changes, trend, historical reconstruction, target, new package, or invented card-level RAG.

## Implementation

- `GET /api/v1/engineering/calibration`, existing auth gate and Athena transport. Reject query filters rather than pretending to support them.
- Athena source: `silver.fct_equipment_calibration`, corresponding to the guide's Databricks catalog table. SQL uses Athena `date_diff('day', today, due_date)`.
- The backend captures today's Asia/Kolkata date once per request (UTC+05:30; no DST), passes it as a validated SQL DATE literal and uses the same date in the cache key and response context. No UTC-day rollover mismatch between counts and cache scope.
- Cache/poll every 60 seconds; a new IST date has a new cache key. No Gold fallback or mock data. Failed requests are not cached.
- One read supplies both counts and the complete drill list. A window row count and 10,000-machine guard reject truncated results. Duplicate machine rows and missing/invalid due dates fail explicitly rather than yielding misleading counts/statuses. Missing instrument counts display a dash, never a fabricated zero.
- An empty source is shown as unpublished data, distinct from a valid snapshot with zero machines due. Errors hide previous counts and expose an explicit unavailable state with Retry in the drill.

## Verification

- Backend inline checks: IST midnight, negative/0/7/8-day boundaries, old overdue rows, quote cleaning, one-machine grain, missing instruments, invalid/duplicate/truncated source data, HTTP validation, Athena transport, cache reuse and IST-day rollover, missing-source error envelope.
- Executed the SQL against SQLite fixtures with Athena DATE syntax adapted: plant 1300 isolation, integer casting, completeness window and due-date ordering.
- Mock-backed browser walkthrough at desktop/tablet sizes: counts, six columns, all status filters, date ordering, quote cleaning, close, valid zero vs empty vs unavailable, Retry, no header filters in requests and no runtime errors. Live data verification remains blocked below.
- Focused frontend ESLint/Prettier and production build passed; 57 existing Compliance/Safety/Stock Cost/upstream regressions passed.
- Full `npm run check`: lint, formatting and build pass; forbidden-pattern checks fail on existing hex colors, one deep relative import and one component-level fetch. A baseline comparison against the pre-feature HEAD, including untracked Calibration source files, confirms zero new violations. User approved leaving pre-existing violations untouched; do not weaken the checks or expand this PR into unrelated cleanup.
- Separate existing live route smoke check: three passed, one failed because `test/routes.test.js` expects the historical anchor `2026-07-16` but the live source now returns `2026-11-10`. No unrelated test expectations were changed.

## Open dependency

Live Athena probe on 2026-11-11 returned `TABLE_NOT_FOUND` for `awsdatacatalog.silver.fct_equipment_calibration`. User chose to keep Athena and provision the Silver table rather than use the legacy Databricks transport. The feature cannot display live counts until that table is exposed. See [data-team handoff](../../docs/btp-calibration-data-team-handoff-2026-11-11.md) and Q-BTP-CAL-02 in the open-questions registry.
