# 22 — Engineering Maintenance downloads

## User-confirmed scope

- Match Production's existing PDF/Excel download menu on Maintenance's Stock Cost, PM Compliance, Daily Check Sheet, Safety, and Calibration drill panels, plus the Stock Cost trend modal.
- Keep the existing dashboard-header PDF button unchanged.
- Safety Excel must contain **all matching rows**, not just the displayed page. PDF captures the current panel/page.
- Implement a reusable framework, with a backend Safety export for paginated data; do not centralize unrelated KPIs or change existing pages' export behavior.
- Existing repository violations may remain; introduce no new violations. No new dependency or edits to synced common components.

## Architecture and isolation

- Reuse `CardDownloadButton` through the Maintenance-only `MaintenanceDownloadButton` adapter. Local helpers define table headers, typed row mapping and scoped filenames. The adapter adds toast errors, scope/unmount cancellation for server downloads, and opt-in full-scroll PDF capture.
- New shared-control options are opt-in. Legacy PDF/Excel callers retain their existing paths and default capture behavior. Compliance downloads are enabled explicitly by the Maintenance parent, not on Quality/Technical consumers.
- PDF scroll expansion restores modified element styles even when capture fails. Only Maintenance opts into expanding nested scroll containers.
- Download controls are disabled for loading, unavailable, unsupported or empty scopes. Filenames identify metric, period/grain and selected scope. Calibration exports the selected status; Compliance exports the selected level and search filter. Numeric values remain numeric in Excel; unknown values remain a dash. Stock Cost quantities remain separate by UoM and are never summed across units.
- Stock Cost trend exports use the applied range/category, not unapplied date drafts, and preserve missing overall points versus the already-defined zero-filled category points.

## Backend Safety export

- Add authenticated `GET /api/v1/engineering/safety/export`, under the existing Safety router/auth gate. The existing JSON paging route, cache, SQL scope validation and responses remain unchanged.
- Accept the same strict period/granularity/type scope with `level=types|reports`; reject summary or client paging parameters. A selected report type is mandatory for report exports.
- Use one read-only, bounded SQL snapshot and the existing Safety aggregate/parity/identity/completeness validation. Do not assemble drifting pages in the browser, infer missing rows, or create partial files.
- A separate export service permits one active export per backend process, with no waiting queue or binary cache. Read at most 10,001 rows to detect the 10,000-row export limit; over-limit requests return 413 and instruct narrowing the selection. Existing UI/API paging limits are unchanged.
- Reuse the installed backend `xlsx` package through a schema-driven workbook builder. Include a Scope worksheet with plant, period, granularity, selected type and exported row count. Preserve literal text rather than interpreting it as Excel formulas; reject cells over Excel's text length instead of silently truncating.
- Return a proper XLSX attachment with `Cache-Control: no-store`. The frontend uses the existing authenticated API client and handles binary error envelopes. Scope changes/unmounts abort the client request and prevent stale downloads.

## Verification

- Backend fixtures execute the existing SQL, verifying all 151 selected reports export in one snapshot rather than one 25-row UI page; other types do not leak into the file.
- Verify strict scope/paging validation, numeric count cells, literal formula-like text, Scope metadata, limits, source truncation, isolated capacity/release, binary attachment headers, existing JSON pagination, auth gating, and overlong cells.
- All **65 focused backend tests** passed, plus **16 existing Engineering regressions**. All **151 existing frontend helper tests** passed using a temporary Node alias/MUI resolver outside the repository; no frontend test files or test tooling were added/changed.
- Full `frontend/npm run check` passed (lint, formatting, production build and every forbidden-pattern gate).
- Mock-backed browser walkthrough downloaded and parsed real PDF/XLSX files from every Maintenance panel/trend. Verified Calibration status filtering, Compliance search/section/machine scope, numeric spreadsheet cells and separate Stock Cost units, 151 Safety reports exported from UI page 2 without paging parameters, binary-error toast handling, and cancellation with no stale download when a scope closes.
- Separate legacy-control browser checks passed for PDF-only, Excel-only and combined menus, uncontrolled table search/clear, and Compliance without the Maintenance opt-in. New PDF scroll styles were verified restored after both success and an intentional capture failure. No browser runtime errors were reported.
