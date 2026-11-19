# SigNoz verification — 2026-11-19

Branch: `feat/signoz-observability`. Changes remain uncommitted; no deployment.

## Passing checks

- `cd backend && npm run check:telemetry`: local OTLP receiver receives HTTP/Express/MySQL spans, correlated Winston logs and Node runtime metrics; SQL literals and URL query secrets excluded.
- `node --test backend/src/utils/telemetry.test.js`: export-time sanitization passes.
- Frontend production builds with `VITE_OTEL_ENABLED=true` and with telemetry disabled.
- ESLint and Prettier for all changed frontend source files.
- Temporary headless-browser checks for same-origin and cross-origin API requests: XHR/fetch W3C propagation, API allowlist, collector CORS/export and sanitized browser errors. Third-party requests receive no trace header. The temporary harness is not part of the app.
- Actual backend startup, health endpoint and SIGTERM shutdown, with telemetry both enabled and disabled, against a local collector.
- Independent code review completed; both findings fixed (error-string log leakage and initial chunk-load recovery).
- `git diff --check`.

## Existing checks that remain red

Full backend `npm test`: **399 passed, 23 failed, 1 skipped** (423 tests).
Before implementation: **398 passed, the same 23 failed, 1 skipped** (422 tests).
The new sanitization test accounts for the additional pass. Failures include
fixture/subprocess-based Uniformity checks, live upstream data assertions, and
auth-gated route tests; no failure names were added or removed.

Unchanged failing tests:

- C13: A + B + C == DAY on 2026-07-16
- C14: the latest day is flagged partial while shifts are incomplete
- C15: day-wise spike compares the same shift on the previous day
- C6: each KPI anchors to its own latest date, not a global one
- Curing Production 1-16 July = 301,530
- Curing Production 2026-07-16 = 22,300
- GET /dashboard/anchors responds 200 with anchors + partialDays
- Gold weighted range arithmetic and no invented rows/zeros, including empty scope
- POST /dashboard/kpi-data returns rows plus a truncation flag
- POST /dashboard/kpi-data with withBaseline returns the baseline window
- ZF grades only and DBM numeric OE grade translation / supplied machine map
- a malformed request is rejected, not 500'd
- independent: Uniformity range uses disjoint historical/fresh sources, not stale counterparts
- independent: latest-test ties, recipe duplicate collapse/fallback, missing readings and null grades
- independent: strict Gold companion scope, zero denominators and duplicate parameter rows
- latest tests across machines, SKUs, shifts and after-window retests; distinct barcode parity
- pagination is bounded, stable, count-honest; truncation/duplicate/numeric errors are explicit
- parameter range denominator includes days without parameter rows; stored pct not recomputed
- product-wise Production changes with the selection
- recorded clock boundaries 07/15/23/midnight/month edge and explicit offsets
- shift filtering follows latest-test ranking; a retest in B removes A's failure
- shift totals over 1-16 July match, and re-sum to the day total
- stored MONTH/YEAR values stay stored; missing range denominators and duplicate Gold stay explicit

Frontend `npm run check`: ESLint has no errors (two existing hook warnings),
Prettier passes, and build passes. The final forbidden-pattern gate fails on
existing hex colors outside permitted files, the deep relative import in
`src/pages/engineering/machineName.js`, and fetch outside `src/api/` in
`src/pages/engineering/rca/RCAEntryDialog.jsx`. These source files are unchanged
by this work. Changed frontend source files pass their targeted checks.

The existing frontend AGENTS.md requires `npm run check` to pass before a commit,
so no commit was created while its existing convention violations remain.

## Deployment validation still needed

Configure the real self-hosted collector URL and frontend origin, enable the
variables, rebuild the frontend, and verify data in your actual SigNoz instance.
The code was verified with local OTLP receivers; no real SigNoz/ClickHouse service,
TLS ingress, SMTP channel or alert rule was deployed or exercised.
