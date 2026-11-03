# BTP SPC: temporary Calender 4 Excel overlay

Status: implemented; deployment pending PR merge. Operational notes: `backend/data/spc/README.md`.

Verification: 63 targeted SPC tests pass. Browser smoke checks with a deterministic empty-gold upstream passed for overview, Machine → Recipe filtering, detail/segment gaps, one-snapshot trend, Shift B/all-shifts behavior, alerts, and excluded dates. Frontend lint/format/build pass (existing lint warnings remain); the full frontend check still fails on existing hex-color/deep-import rules. Full backend run: 322 passed, 13 failed, 1 skipped; failures are in unrelated materializer, upstream acceptance, and authenticated route tests.

## 1. Goal and scope

Supplement BTP Quality → SPC with the supplied Roll Calender 4 workbook while preserving the existing live SPC data flow. Serve one combined overview, filter list, status-card count, and detail experience. Keep the temporary source isolated and removable; do not insert its rows into gold or modify upstream data.

References:
- `/home/yugal/Downloads/SPC_Calender4_Dashboard_Guide.md`
- `/home/yugal/Downloads/SPC_Calender4 (2).xlsx`

BTP SPC uses `BANMORE` as its source plant label. This is already intentional in the current API and SQL. Do not change unrelated plants, CTP SPC, or other Quality tabs.

## 2. Verified workbook inventory

- Machine: `ROLL_CALENDER_4_0501_1`; section: Calendering.
- Recipes: `BHARAT`, `CAP 66`, `CPJ114`, `EHT1000`.
- Parameters: `Scanner Drive Zone`, `Scanner Water Zone`.
- Eight combinations, keyed by plant + machine + recipe + parameter.
- `SPC KPIs`: 48 rows = 32 published capability values/statuses + 16 LSL/USL reference rows.
- All KPI rows have the displayed date `2026-11-02` and granularity `Day`.
- Spec limits: LSL = -0.04, USL = +0.04 for all eight combinations. Read these from the workbook, not hardcoded chart constants.
- `Raw Data`: 1,022 readings; displayed coverage `2026-10-23 22:40` through `2026-11-02 16:10`.
- Readings have event time, actual value, setpoint, sample number, segment, and shift. No missing actual values/setpoints were found in this workbook.
- No measurement unit is supplied.

| Recipe | Drive readings | Drive segments | Water readings | Water segments |
|---|---:|---:|---:|---:|
| BHARAT | 50 | 5 | 57 | 4 |
| CAP 66 | 58 | 6 | 58 | 5 |
| CPJ114 | 359 | 16 | 180 | 28 |
| EHT1000 | 137 | 10 | 123 | 13 |

Expected Excel-only headline counts: 8 processes, 7 Critical, 0 Major, 0 Warning, 1 Healthy, 0 Insufficient Data. CPJ114 / Scanner Water Zone is Healthy. Headline status remains the worst of the four published metric statuses.

### Date import precaution

Workbook dates are Excel numeric serials. Decode their calendar/time components explicitly, preserving the workbook's displayed date/time. A trial `cellDates: true` conversion in this environment shifted dates/times and would incorrectly turn the KPI date into the previous day. Avoid host-timezone-dependent Date conversion. Preserve source-local timestamps without inventing a timezone; confirm timezone separately if absolute UTC timestamps become necessary.

## 3. Decisions confirmed with the user

### Date filters apply; shift does not apply to Excel

- Single-day selection: include the Excel combinations only for `2026-11-02`.
- Inclusive date range: include them only if `from <= 2026-11-02 <= to`.
- If the API is used without a date/range, include the available workbook snapshot and report its date explicitly.
- When included, retain all readings belonging to that workbook combination, even when their timestamps precede the selected date/range. The date filter gates the published KPI snapshot; it does not trim its supporting readings.
- Do not carry the workbook snapshot forward to later selected days under the live source's existing as-of rule.
- Ignore global shift for Excel capability AND Excel readings. Show “Day-level snapshot / All shifts; shift filter not applied” on Excel content.
- Do not recalculate, average, or regrade the workbook's published capability values for a range or shift view.
- Existing live SPC date/range and shift behavior stays unchanged.

### Prefer a complete live combination

- Resolve each overlapping combination once, consistently across all endpoints.
- Live wins only when its complete capability set, required usable limits, and nonempty mapped measurement series are available for the request's live scope.
- A machine appearing in gold alone is NOT sufficient for cutover.
- Partial gold availability keeps the complete Excel combination when it is date-eligible; do not mix gold KPIs with Excel charts or emit duplicate cards.
- Published explicit `Insufficient Data` must remain distinguishable from missing metric rows; do not use a Healthy/non-Healthy status as the readiness test.
- A live read failure is not evidence that its data is absent. Preserve/report the error or degraded source state; do not silently disguise an outage as normal static data.
- Calender 4 currently has no entry in the live silver mapping. Its future live cutover also requires an explicit, validated mapping and chart-method contract. Gold rows alone cannot activate an unmapped feed.

## 4. Current implementation constraints

Relevant files:
- `backend/src/quality/controllers/spc.controller.js`
- `backend/src/quality/transformers/spc.transformers.js`
- `backend/src/quality/spc/engine.js`
- `backend/src/quality/spc/mapping.js`
- `backend/src/quality/queries/spc.queries.js`
- `frontend/src/api/quality.js`
- `frontend/src/pages/quality/QualityDashboard.jsx`

Today, capability/status and baseline limits come from gold, while measurements come from silver. Existing charts group readings into subgroups of five. Controllers often return early when no gold snapshot exists. Calender 4 must work without a gold snapshot, and must NOT pass through the subgroup-of-five transformer.

Other integration gaps:
- Filter options currently receive an end date, not the overview's full range or selected machine.
- Overview Cp/Cpk currently share the headline color; detail colors are inferred from numeric thresholds rather than each published status.
- SVG charts currently connect every numeric point in one polyline and remove null points. They need explicit segment/gap support.
- Existing chart guides use UCL/LCL; workbook LSL/USL must not be relabeled as control limits.
- The alerts modal currently receives date/shift, not the full active date range.
- Existing histogram binning and normal-curve sigma differ from the workbook guide.

## 5. Proposed architecture

### A. Versioned backend fixture and importer

Proposed new files:
- `backend/tools/import-spc-calender4.js`
- `backend/data/spc/calender4.json`
- `backend/src/quality/spc/static-calender4.js`

Use the backend's existing `xlsx` dependency in an offline import tool; no new library and no browser Excel parsing. Commit a normalized JSON fixture so production does not depend on `/home/yugal/Downloads` or require manual file placement.

The importer will:
1. Read both sheets, split KPI names using their final metric/limit token, and preserve numeric precision and published statuses.
2. Decode Excel dates deterministically, normalize identities, and retain raw provenance fields.
3. Sort each combination by event time with stable sample-number ordering for ties; preserve segment IDs.
4. Validate expected schema, finite measurements/setpoints, capability completeness, spec-limit pairs, duplicate identities, and sheet-to-sheet combination coverage. Report anomalies rather than silently discarding data.
5. Emit source filename/hash, fixture version, snapshot date, per-combination coverage, and import metadata.

Load the fixture once per process behind a narrowly scoped configuration flag, proposed `SPC_CALENDER4_STATIC_ENABLED`. Explicitly scope it to BTP/BANMORE SPC. Keep original workbook/guide references and the reproducible import command in documentation.

### B. Shared source-selection layer

Proposed new file: `backend/src/quality/spc/sources.js`.

Centralize date eligibility, source readiness, identity normalization, deduplication, source precedence, and output ordering. Reuse the result for summary, filter options, widgets, detail, trend, and observation drill-downs. Do not implement separate precedence rules in individual controllers.

Resolve gold and static snapshots independently. Replace “no gold snapshot => empty response” shortcuts with “no eligible data from either source => empty response.” Do not create a fake gold snapshot date for Excel-only results.

Use one canonical identity, including plant and normalized machine, while preserving recipe/parameter spelling. Merge at whole-combination level BEFORE counts, worst-status filtering, and sorting.

For live readiness, distinguish missing data, explicitly published insufficient data, invalid limits, unmapped measurements, and upstream errors. Reuse batch/live caches instead of adding one upstream scan per Excel combination.

### C. Separate individuals/moving-range computation

Proposed new file: `backend/src/quality/spc/individuals.js`, plus a separate static response assembler or explicit transformer entry point.

For each selected workbook combination:
- Deviation = actual value - setpoint, at full precision; round only for transport/display.
- X chart: one deviation per reading, ordered by event time. Never subgroup five readings and never apply the live 300-subgroup truncation to this small fixture.
- Centre: mean deviation across the combination's included readings.
- Spec guides: workbook LSL and USL; mark strictly out-of-spec readings red, independently of Nelson classification.
- Break X and mini-chart lines whenever the segment changes.
- Moving range: absolute difference from the previous reading only inside the same contiguous segment. First point of every segment is null, not zero.
- Preserve original point indexes/timestamps and null gaps in the R/MR dataset. Do not compress out blank positions or connect across runs.
- Sigma within = mean of valid moving ranges / 1.128.
- Nelson evaluation: X deviations against the combination mean and that sigma; reset rule windows at segment boundaries. Reuse the existing eight-rule evaluator through an explicit sigma adapter or a small compatible extension, without altering legacy behavior.
- Build alerts per segment before combining them, so contiguous global indexes cannot accidentally merge alerts across production runs. Retain rule, point membership, time range, and deterministic identities including recipe/segment.
- Histogram: approximately 20 bins over deviations, workbook LSL/USL, and a count-scaled normal curve using the same mean and sigma within. Compute out-of-spec totals from individual deviations, not whole-bin membership.
- Handle no valid moving ranges, zero sigma, and constant readings without NaN/Infinity or fabricated alerts/curves.
- Do not apply Nelson rules to the MR chart unless separately requested. The guide specifies X-chart rules only.
- Do not invent source UCL/LCL or additional MR control limits. The required MR plot is the moving-range series; optional derived MR control limits can be a later explicit enhancement.

Keep all four published capability values/statuses unchanged, including unusually high CPJ114 Water Zone values. Unit remains null/absent.

### D. API integration and metadata

Keep current routes and preserve existing live response fields. Add optional source-aware fields rather than renaming/removing legacy fields.

Suggested metadata:
- source: `live` or `static_excel`, source version, source snapshot date.
- measurement coverage and readings/segment totals.
- chart method: `subgroup` or `individuals_moving_range`.
- value basis: `measurement` or `deviation`.
- explicit `lsl`/`usl` fields separate from `ucl`/`lcl` and Nelson sigma/zones.
- capability scope: range average vs published snapshot.
- applied filters / `shift_supported: false` for static combinations.

Endpoint work:
1. `/summary`: count the resolved union, without counting LSL/USL reference rows.
2. `/filter-options`: union eligible sources, deduplicate options, and support the same `from`/`to` scope and Machine → Recipe dependency as widgets.
3. `/widgets`: merge complete combinations, use individual Cp/Cpk statuses, then apply headline filters and severity/Cpk sorting.
4. `/detail`: route the selected combination through its chosen assembler; return explicit measurement/source scope and correct chart method.
5. `/trend`: a workbook metric contributes only its actual `2026-11-02` published point when eligible. Never synthesize daily history from one snapshot. Reuse source precedence to avoid duplicate live/static points.
6. `/point-observations`: X point returns its one underlying reading with actual/setpoint/deviation/segment; MR point returns its valid adjacent pair, or explicitly no range at segment start.
7. `/histogram-observations`: use the identical static dataset and bin edges as detail, not the existing default histogram builder. Preserve exact bin membership/count reconciliation.

Include fixture version and enabled state in the relevant SPC cache namespace. Account for backend memory/Redis caches and frontend request caching so fixture replacement/disable does not keep serving obsolete results. Do not globally flush unrelated caches.

### E. Frontend integration

Changes stay in the existing BTP SPC experience:
- Show the machine and four recipes in the existing filters. With a recipe selected, show its two parameter cards; with all recipes, show eight combinations if none are superseded by complete live data.
- Pass full date/range and machine scope to filter options. Clear invalid dependent recipe selections when scope/machine changes.
- Preserve the recently renamed status KPI cards: Critical, Major, Warning, Healthy, Insufficient Data.
- Color Cp/Cpk and detail metrics from their own published statuses. Keep card headline color based on the worst of all four statuses. Avoid changing unrelated legacy chart semantics.
- Add a compact “Temporary Excel” source marker, snapshot date, actual reading coverage, and all-shifts notice. Show metadata per static card/detail; do not present one gold snapshot as the date for all sources.
- Keep existing live explanations accurate; avoid claiming Excel values are range averages or its charts have 300 subgroups of five.
- Mini chart: deviation series with LSL/USL and segment breaks. Preserve actual timestamps for context.
- Detail: all four capability indices, small LSL/USL text, “X Chart — individual deviation readings” and “R Chart — moving range” titles, segment-aware paths, explicit gaps, and no invented unit/subgroup-five labels.
- Distinguish out-of-spec red markers from Nelson ±sigma violations in tooltip/legend. Show Nelson zones from mean/sigma without confusing them with spec guides.
- Histogram: deviation labels, ~20 bins, correct source spec guides and normal curve.
- Keep capability trend interaction honest for a single snapshot; show one actual point rather than a fabricated line/history.
- Pass the full active range into the alerts modal so alerts and detail resolve the same source/date eligibility. Ensure workbook X alerts are displayed with rule/time/points and reflected in chart markers.

## 6. Implementation order

1. Import tool, validated fixture, source flag, and reproducibility notes.
2. Pure individuals/MR, histogram, and segment-aware Nelson assembly.
3. Shared source eligibility/readiness/merge layer and source metadata.
4. Controller/API integration across overview, detail, filters, trends, and drill-downs.
5. Frontend source-aware filtering, labels, colors, guides, gap rendering, and alerts.
6. Automated verification, manual BTP smoke checks, and removal/cutover documentation.

## 7. Verification and acceptance criteria

During implementation, add focused backend tests using the actual normalized fixture and small synthetic segment cases. Do not create unrelated frontend test infrastructure.

- Fixture inventory matches 48 KPI rows, 1,022 readings, eight combinations and the coverage table above.
- Workbook date parses as `2026-11-02` regardless of process timezone.
- Static-only overview counts reconcile to 8 = 7 Critical + 1 Healthy.
- A recipe selection yields exactly two static cards; other live combinations remain unaffected.
- Exact date and inclusive range boundaries work; excluded dates never leak Excel filters/cards/detail/trend points.
- Excel metrics/readings are identical for A/B/C/All shifts, with explicit all-shifts metadata; live shift behavior remains unchanged.
- Source union works with no gold snapshot. Partial live combinations retain eligible Excel; complete mapped live combinations replace them once, consistently in all endpoints.
- Feature flag off removes static contributions and changes cache identity.
- Published values/statuses are preserved; reference limits never count as capability rows.
- Deviation calculations, spec-boundary classification, per-metric colors, and CPJ114 Water's Healthy status are correct.
- Every segment start has a blank moving range. Number of valid MR values equals reading count minus contiguous segment/run count.
- No line, moving range, Nelson window, or combined alert crosses a segment boundary.
- Histogram totals equal readings; drill-down counts/point identities match detail exactly.
- Zero sigma, missing/invalid fixture data, and upstream failures are surfaced safely without fabricated statistics.
- Run existing SPC tests and backend suite, plus frontend build/check. Known existing frontend check failures (hex colors outside theme and a deep relative import) should be reported separately, not expanded into unrelated cleanup.
- Manually inspect BTP SPC mixed overview, individual recipes, Excel detail/MR/histogram/alerts/trend, excluded dates, range including the snapshot, shift selection, existing live detail, and disabled overlay.

## 8. Retirement / operational notes

- No DB migration and no changes to gold ingestion are required for this temporary overlay.
- New workbook delivery: rerun the importer, review fixture diff/validation, increment source version, deploy.
- Verify the future live Calender 4 capability, spec/control limit definitions, measurement mapping, units, deviation basis, and run segmentation before activating live readiness for it.
- Confirm per-combination cutover with fixtures/integration checks; do not infer readiness from the presence of the machine name.
- Once all eight combinations are verified live, disable the overlay and verify caches and counts. Remove the fixture/importer/static adapter in a later small change; retain useful source-independent individuals/MR support if the live feed needs that method.

## 9. Non-goals

No Excel upload UI, background workbook watcher, new database table, generic import platform, fabricated capability recalculation, interpolation of missing data, guessed units/timezones, or redesign of other plants' SPC charts.
