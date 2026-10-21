# Live Running SKUs Implementation Plan

> **For agentic workers:** Use the supplied Word specification and the interfaces below. Implement independent query, UI, and transport tasks, then review their integration.

**Goal:** Display Current Running SKUs as a live Silver snapshot independent of dashboard date and shift selections.

**Architecture:** A dedicated GET endpoint executes the specification's query over seven Silver Delta tables through the existing service's `databricks` engine. Existing Gold queries retain Athena. The Technical dashboard polls the snapshot independently of period-bound Production requests and filters only its machine/section view.

**Tech Stack:** Express, JavaScript, existing upstream service (DuckDB/Delta SQL), React, MUI.

**Spec:** User-supplied `Live Running SKU — Machine-wise Dataset Spec (BTP Technical Dashboard).docx`; extracted read-only reference at `/tmp/live-running-sku-spec.txt`, original Spark SQL at `/tmp/live-running-sku-spark.sql`.

## Constraints

- Seven-day roster, future events excluded, IST clock; never use selected date/shift.
- Gap measured against source-table feed head; feed older than 90 minutes means Unknown.
- Preserve all source-specific windows from the Word specification (15–240 minutes).
- SKU/description visible only for Running machines. Keep audit fields and latest-record tie-breakers.
- Merge TRC winders and curing LH/RH; keep Duplex winders separate; exclude duplicate Stage 2 O_Production, Stage 1 PCR, NCM and Reset rows.
- No new dependencies or unsolicited frontend tests. Work in the user's existing checkout; do not push without a new instruction.

## Shared interface

`GET /api/v1/dashboard/live-running-skus` accepts no temporal inputs; response `{data:{as_of,lookback_days:7,feed_stale_min:90,machines:[...]}}`.

Machine fields follow the Word SQL: `section,sub_section,source_machine,machine_id,live_sku,live_sku_description,machine_status,status_reason,last_sku,last_sku_description,last_updated,minutes_since_update,minutes_behind_feed,feed_last_event,run_window_min,as_of`.

Query module exports `liveRunningSkusQuery()` and `LIVE_RUNNING_SKU_TABLES` (seven `databricks_table/silver/<name>` paths). Transport supports `runQuery(sql,{engine,tables})` with existing defaults unchanged. Backend route uses a short live-only cache key, independent of all header filters.

## Review focus

- Running/Idle/Unknown boundaries, late feed versus silent machine, and missing recipe.
- No duplicate physical machines from joins, winders, or cavities.
- Final source query uses the spec's true seven-day clock, not a sample date.
- Date/shift changes neither refetch nor hide the live card; Production loading/errors are isolated.
- Upstream failure is visible; no false zero or fabricated Running state.

## Tasks

- [ ] Query and backend tests: translate supplied Spark SQL to DuckDB, preserve logic and audit fields, prove freshness boundaries and deduplication with fixture execution where available.
- [ ] Transport and endpoint: test per-call engine/table override without global changes; add authenticated GET route and temporal-input-independent cache. Validate live execution and report source limits.
- [ ] Frontend: dedicated API call and polled snapshot; wire existing `rsku` cards and machine drill for Mixing/Stock/Building/Curing, independent of date/shift and Production loading.
- [ ] Review: targeted backend tests, frontend lint/format/build, full suite with any unrelated failures reported, source-query validation, final diff review.

## Findings

Athena's `silver` catalog registers only four SPC tables. The exact specification datasets exist as Delta paths and are readable via the upstream `databricks` engine. Verified `fct_o_production` and four dimensions. Direct Athena reads of Bronze fail on deletion vectors; do not use them as a workaround. Initial independent reads of `fct_tbmpcr` and `fct_curingpcr` returned Service Unavailable and require further verification.
