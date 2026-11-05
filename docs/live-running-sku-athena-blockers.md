# Live Running SKU — Athena data availability

Last live verification: **2026-11-04**, using the application's configured AWS query endpoint and API key, with `engine: "athena"`. No Databricks fallback is used.

## Current status — table-access blockers resolved

**All seven required Silver tables are now readable through Athena.** At the latest real-Athena route verification (19:07 IST), `/api/v1/dashboard/live-running-skus` returned **HTTP 200 in approximately 24 seconds, with 272 machines: 216 Running, 56 Idle, 0 Unknown**, including **7 Bead machines**. No non-Running machine exposed a live SKU or description.

At the earlier 15:32 IST check, the complete query returned 271 unique `(section, machine_id)` rows: 185 Curing, 48 TBM, 6 Mixing and 32 Stock, all Unknown. Source heads were then 12:26:25 (Curing), 12:26:36 (TBM) and 12:34:42 (O_Production), beyond the 90-minute threshold. Those feeds had recovered at the later route check. Freshness should remain monitored; never change Unknown to Running merely to populate the card.

The card is at `/banmore/technical` → Stock (including Mixing and Bead), Building and Curing → **Current Running SKUs**. Its loading is independent of period-bound Production/Quality cards. Clicking shows the scoped machine roster, statuses and reasons; dashboard date/shift selections do not alter the live snapshot.

See the [Gold-job handoff and canonical SQL exporter](../backend/tools/live-running-sku-gold/README.md) for data-team publication, refresh and replacement requirements. The app continues to query Silver through Athena; no Gold writer or deployment was added.

The full snapshot still intentionally stays unavailable if a required source fails in future. Missing sections must not appear as zero running SKUs.

## Historical source failures — 2026-11-02, resolved on 2026-11-04

| Athena table | Verified result | Required data / affected functionality |
| --- | --- | --- |
| `silver.fct_o_production` | Readable; `SELECT ... LIMIT 1` returned one row | Mixing, Stock and TBM Stage-1 production, SKU and feed timestamps |
| `silver.fct_tbmpcr` | Readable; `SELECT ... LIMIT 1` returned one row | Building / green-tyre production; still needs the work-centre and recipe dimensions below |
| `silver.fct_curingpcr` | **TABLE_NOT_FOUND** | Curing production; `wc_id`, `recipe_id`, `event_time`, `barcode` for press/cavity merging, SKU and freshness status |
| `silver.dim_wcmaster` | **TABLE_NOT_FOUND** | `record_id`, `name` to resolve Building/Curing machine IDs, exclude Stage-1 duplicates and merge curing LH/RH cavities |
| `silver.dim_recipemaster` | **TABLE_NOT_FOUND** | `record_id`, `description` (SKU code), `name` (SKU description) for Building/Curing |
| `silver.dim_tblitemmaster` | **TABLE_NOT_FOUND** | `item_code`, `description`, `is_current` for Mixing/Stock/Carcass descriptions |
| `silver.dim_bom` | **TABLE_NOT_FOUND** | `plcbomname`, `materialcode_o`, `revision` for latest-revision SKU-description fallback |

On 2026-11-02, each missing source was queried individually, not inferred only from a failed join. Athena reported errors of this form:

```text
Query FAILED: TABLE_NOT_FOUND: ... Table 'awsdatacatalog.silver.dim_tblitemmaster' does not exist
```

When a required source is unavailable, the application's `/api/v1/dashboard/live-running-skus` route returns HTTP 502 with the real upstream error and no snapshot. The upstream HTTP transport may return 200 while its JSON reports the failed Athena query; the backend correctly treats that as a failure. The missing-table errors above are historical, not the current query result.

## Reproduce using Athena

Send each SQL statement through the configured query API with `engine: "athena"` and the existing API-key header. Do not paste credentials into tickets.

```sql
SELECT * FROM silver.fct_curingpcr LIMIT 1;
SELECT * FROM silver.dim_wcmaster LIMIT 1;
SELECT * FROM silver.dim_recipemaster LIMIT 1;
SELECT * FROM silver.dim_tblitemmaster LIMIT 1;
SELECT * FROM silver.dim_bom LIMIT 1;
```

For catalog discovery:

```sql
SELECT table_catalog, table_schema, table_name
FROM information_schema.tables
WHERE table_name IN (
  'fct_o_production', 'fct_tbmpcr', 'fct_curingpcr',
  'dim_wcmaster', 'dim_recipemaster', 'dim_tblitemmaster', 'dim_bom'
)
ORDER BY table_schema, table_name;
```

## Historical Bronze probes — not an approved replacement

The 2026-11-02 probes of similarly named Bronze tables did not provide a reliable complete alternative; they have not been rechecked or adopted:

| Athena table | Probe result |
| --- | --- |
| `bronze.curingpcr` | One-row read succeeded |
| `bronze.wcmaster` | One-row read succeeded |
| `bronze.recipemaster` | `HIVE_BAD_DATA`: Athena attempted to read a `deletion_vector_*.bin` file as Parquet (`Expected magic number: PAR1`) |
| `bronze.bom` | Same deletion-vector / Parquet error |
| `bronze.tblitemmaster` | `HIVE_BAD_DATA`: Parquet `item_id` is BINARY but Glue declares integer |

A successful one-row probe is not proof that a full-table scan is safe. No Bronze substitution, file-skipping workaround or catalog changes have been made by this implementation.

## Current request to the data/platform team

1. Monitor Silver ingestion latency: all three feeds exceeded the 90-minute limit at the earlier 2026-11-04 check, then recovered. Keep event times and watermarks accurate; a more frequent app poll or Gold job cannot repair an old feed.
2. Confirm that Silver event-time values represent IST wall-clock time as specified; currently accessible facts are exposed as `timestamp(3) with time zone`.
3. Maintain the now-readable seven Silver sources with compatible types and joins. No Bronze workaround is needed.
4. For optional Gold publication, use the linked handoff's atomic complete-snapshot replacement and 5–15-minute refresh guidance; agree the target schema and ownership before implementation. Failed app snapshots are cached for five minutes, so allow that entry to expire when checking recovery.

The document also describes a precomputed Gold KPI (`live_running_sku`, `Live_SKU_Minutes_Since_Update`). An earlier Athena check found no matching KPI rows in `gold.gold` or `gold.gold_daily`. Those rows are **not required** for the app's direct-Silver implementation; they would be needed if the team chooses to publish the Gold snapshot instead. That would require a separate mapping/refresh decision.

## Validation and scope

- The complete translated SQL executed successfully on real Athena with inline fixtures replacing the seven unavailable/live sources. It verified Running/Idle/Unknown, missing recipes, TRC tie-breaking, curing cavity merging, description lookup and output shape. This validates the dialect, not availability of the missing tables.
- The live Athena IST clock expression was independently checked. A direct zoned-to-timestamp cast normalized back to UTC in this environment; the query uses a formatted-string round trip to preserve the IST clock.
- All 19 targeted backend tests passed, covering source qualification, Athena-only requests, no partial/Bronze fallback, temporal-filter independence, legacy-cache isolation, freshness boundaries, machine identity rules and the configuration-free canonical Gold SQL exporter.
- Scoped frontend ESLint/Prettier and the production build passed. Headless Chrome with a mocked API verified independent loading in both directions, Bead scope/distinct counts, Building/Curing, date/shift independence, retained live drill, Unknown SKU hiding and visible errors, with no uncaught browser exceptions. A separate real-Athena route call verified the live backend; browser fixtures are not a claim of deployed-environment validation.
- Full `cd backend && npm test`: 305 passed, 13 failed, 1 skipped. Failures are outside the changed Live SKU tests: eight live-data acceptance assertions with fixed historical expectations, four route tests receiving 401 with local auth enabled, and one materializer configuration assertion. These assertion failures are not evidence that the Live SKU source tables are available or that all other KPI queries are inaccessible.
- This is a blocker list for **Live Running SKU**, not an exhaustive audit of every dashboard KPI. Previously tested `gold.gold` and the four SPC Silver measurement tables were readable; do not report all dashboard data as inaccessible.
