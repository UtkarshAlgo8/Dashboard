# Engineering Reliability — recent/history source correction

## Root cause verified on 17-Nov-2026

The user queried Databricks `` `jk-infiniti-datalake`.gold.gold_bi_daily `` for `MTBF_Overall`, `granularity = 'DAY'`, `date = '2026-11-17'`.

Through the dashboard's configured Athena connection:

- `gold.gold_bi_daily` is not registered under that name (`TABLE_NOT_FOUND`).
- `gold.gold` returned no requested Reliability summary rows for 17-Nov-2026.
- `gold.gold_daily` returned BTP / Engineering / Reliability DAY rows for that date, including `MTBF_Overall = 6210 minutes`, `MTTR_Overall = 30 minutes`, `Breakdown_Pct_Overall = 0` and `TotalMachines_Overall = 13`.
- `BreakdownMin_Overall` is not published for that date in the daily source. It must remain missing, not be fabricated or copied from another date.

Reliability's query builder deliberately excluded the daily table based on a September category-label mismatch and the then-current freshness of `gold.gold`. That assumption no longer holds: the daily rows now have the correct `Reliability` label and are more current than the archive.

## User-approved correction

Reuse the existing Production/Quality `resolveGoldSource` policy through a thin **Engineering-only adapter**:

- The configured IST cutoff is today minus `GOLD_DAILY_FRESH_DAYS` (default 2). On 17-Nov, dates from 15-Nov onward read the daily source. The user explicitly confirmed retaining this shared window (today plus the previous two days), rather than introducing a today-only Engineering override.
- Historical DAY reads before that cutoff stay on the archive. A DAY granularity alone does not imply using daily for old dates.
- All MONTH snapshots remain on the archive, including the current month. The UI's default month selection is unchanged; select **Today** to inspect today's DAY values.
- Date ranges, historical series and unbounded date/coverage lookups use adjacent, disjoint source slices. Never union both full tables or double-count overlapping dates.
- Keep strict BTP/Engineering/Reliability scope and existing Unmapped handling. Do not broaden categories, recalculate stored MTBF/MTTR, alter source nulls, or relax complete-period/coverage rules.
- Excel remains a single-table source. Production, Quality and Maintenance queries and global source policy are unchanged.

All Engineering query families use the adapter: summary values, hierarchy drills, chart histories, pooled range components, Loss Tree, latest/latest-complete dates and Zero Breakdown machine coverage.

## Configuration and caching

- `ENGINEERING_SQL_TABLE` defaults to `gold.gold`.
- New optional `ENGINEERING_SQL_TABLE_DAILY` defaults to the configured `AWS_DATA_SQL_TABLE_DAILY` (otherwise `gold.gold_daily`). Explicitly empty disables daily reads; the same table as the archive also disables the split. It is ignored in Excel mode.
- Reuse `GOLD_DAILY_FRESH_DAYS`; do not introduce a separate Engineering cutoff.
- Engineering response-cache keys are versioned and include mode, source tables and the IST cutoff, so Redis entries from the old base-only queries or a previous cutoff cannot hide the correction. Existing TTLs are unchanged.
- Date inputs are validated before entering the resolver's interpolated SQL predicates. Invalid ISO dates/ranges return the normal 400 error envelope.
- The existing browser Engineering API cache lasts up to five minutes. Reload the page after deploying the backend correction; no frontend code/deployment change is required for this fix.

## Validation

- Live corrected summary SQL returned the published 6210-minute MTBF, while preserving unpublished Breakdown Minutes as null.
- Live current-day category drill resolved through daily (B category MTBF 930 minutes, A/C values missing as published).
- Live unbounded MTBF latest-date lookup returned 17-Nov-2026 through the disjoint archive/daily source.
- Regression fixtures execute actual summary/history/component/coverage SQL with overlapping stale rows in both tables. Verify daily preference, historical and MONTH preservation, no duplicate contributions, plant/department/category isolation, Unmapped filtering and no fabricated values.
- Verified every query family, custom source configuration, disabled daily mode, Excel bypass, the first-of-month edge case, IST cutoff rollover, strict input validation, source-sensitive caching, the standard HTTP response, and unchanged latest-complete semantics for partially published dates.
- Live HTTP verification returned 200 for today's summary and latest MTBF date, plus historical DAY (14-Nov) and MONTH (01-Nov) summaries routed to the archive. The browser Today flow displayed **6,210 min (103.5 hrs)** and the live MTBF category drill; unrelated endpoints were stubbed to keep this check focused. No frontend code was changed and no browser runtime errors occurred.
- **115 backend tests passed**, covering Engineering, the shared Production/Quality resolver and monthly routing, plus Calibration, Compliance, Safety, Stock Cost and upstream regressions. The full frontend `npm run check` passed.
- A backend deployment containing this correction is required. No deployment was performed during validation.
