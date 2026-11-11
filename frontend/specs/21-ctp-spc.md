# CTP Quality — live SPC workspace

## Scope and approved behavior

Enable CTP Quality's SPC tab only. Use the SPC workspace in
`Engineering_dashboard_Updated (1).html` as the content/layout reference,
CTP Quality's existing header, palette, typography, cards and loaders for
presentation, and BTP's existing backend Nelson engine for diagnostics.
Process, Product, Customer Complaint and BTP behavior are otherwise unchanged.
The separate Process-tab SPC Health placeholder remains pending.

- Machine/parameter selection, Cp/Cpk/Pp/Ppk, daily mean and published OOC count.
- Large X̄ chart, published range readings, eight-rule results and alert table.
- Show source statuses verbatim. Capability is distinct from statistical control.
- Default to the latest published day; display its actual source date.
- Day and shift controls only. No MONTH/YEAR capability averaging.
- Real database requests on opening/filter changes, plus Refresh; no polling.
- Explicit empty/error states. No silently substituted older selected days.
- Missing values are dashes, never synthetic zeros or demo readings.

## Verified source contract

`gold.ctp_gold`, exact `plant='CTP'`, `department='Quality'`, `category='SPC'`.
This is **not** the Process/Product `plant='CHENNAI'` contract, the older CTP
Real-time CSV, or BTP's SPC/Silver contract.

Tyres PCR and TBR are separate identities. All selects both types, not `Both`,
and never adds their capability indices. Process identity includes tyre,
machine, itemcode and parameter.

- `Day`: `<parameter> Cp`, `Cpk`, `Pp`, `Ppk`, `Mean`, `OOC Points`.
- `SHIFT A/B/C`: `<parameter> Shift Stats` (published sample count).
- Cp/Cpk metadata supplies a 30-day window; Pp/Ppk supplies a 90-day window.
  Display the actual `window_days`; never infer these indices from plot points.
- Mean metadata supplies sample count and target.
- OOC metadata supplies `UCL`, `CL`, `LCL`, `USL`, `LSL` and timestamped
  `points[{t,shift,x_bar,r,ooc}]`. Target is not the baseline centre line.

A shift filters chart points and selects the stored shift sample count. The
published capability, mean and OOC tiles remain explicitly **daily**. The
backend also reports the selected chart's observed points beyond limits,
separately from the published daily OOC count.

Reuse `evaluateNelson` and `deriveAlerts` from BTP's pure engine. Do not alter
that engine, recalculate the baseline or fabricate missing R control limits,
a histogram, raw observations or capability targets. Missing readings break
rule sequences and plot paths. Rules with insufficient consecutive valid
readings are not marked evaluated. Invalid/asymmetric baselines permit only
the supported direct bounds check, not inferred sigma rules.

Live read verification on 11 November 2026 returned the latest published day
10 November: 180 metric rows, 30 process identities, six PCR/TBR trenches,
969 chart points. These are verification results, not hardcoded fixtures or a
promise of future data freshness.

## API

`GET /api/v1/quality/ctp/spc/workspace`

Parameters: `tyre=All|PCR|TBR`, optional `date=yyyy-mm-dd`,
`shift=All|A|B|C`, optional `refresh=1`.

An omitted date explicitly resolves MAX published Day date <= today (IST).
An explicit date is exact, with no latest-before fallback. One scoped query
loads that day and any selected shift statistics. Invalid controls return 400;
source errors reach the existing error middleware rather than an empty success.

Response: `context`, `processes`, `fetched_at`. Context includes selected date,
actual `data_date`, tyre, shift, date mode and daily capability scope. Each
process contains its published metrics/statuses, daily mean/OOC, shift sample
count, chart points/limits/diagnostics/alerts and any source warnings.

Use existing authentication. Cache for one minute with tyre/date/shift-scoped
keys. Refresh bypasses that read cache and updates the same key. `fetched_at`
is the upstream fetch timestamp, not a fabricated publication timestamp.

## Validation

```sh
AWS_DATA_URL=http://127.0.0.1:1 AWS_DATA_API_KEY=fixture-only CACHE_DRIVER=memory \
  node --test backend/src/quality/ctp/*.test.js \
  backend/src/quality/spc.test.js backend/src/quality/spc/*.test.js
cd frontend
PLAYWRIGHT_MODULE=/path/to/playwright-or-playwright-core/index.mjs \
  node tests/ctpSpc.browser.mjs
npm run check
```

Browser checks intercept all APIs (no production queries). They exercise
selectors, tyre/shift/date scope, Today/latest modes, rule highlights,
keyboard point tooltips, Refresh, CSV/PNG export, empty/error/stale requests,
mobile overflow and return navigation to Process/Product. Screenshots are
written to `/tmp/ctp-spc-{desktop,mobile}.png`.

## Context

- `backend/src/quality/ctp/spc.queries.js`
- `backend/src/quality/ctp/spc.transform.js`
- `backend/src/quality/ctp/spc.controller.js`
- `backend/src/quality/ctp/spc.test.js`
- `backend/src/quality/ctp/routes.js`
- `backend/src/app.js`
- `src/api/ctpSpc.js`
- `src/pages/quality/ctp/CtpSpcDashboard.jsx`
- `src/pages/quality/ctp/CtpSpcChart.jsx`
- `src/pages/quality/ctp/CtpQualityDashboard.jsx`
- `src/pages/CtpQuality.jsx`
- `tests/ctpSpc.browser.mjs`
