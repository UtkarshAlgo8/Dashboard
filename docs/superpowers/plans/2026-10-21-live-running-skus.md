# Live Running SKUs Implementation Plan

> **2026-11-04 update:** Application queries use Athena only, and all seven Silver sources are now readable. Bead coverage and independent Live SKU loading are implemented. The live route returned HTTP 200 with 272 machines (216 Running, 56 Idle), including 7 Bead machines. See [availability history](../../live-running-sku-athena-blockers.md) and the [Gold-job handoff](../../../backend/tools/live-running-sku-gold/README.md). No Gold writer, AWS changes or deployment were requested or performed.

> **For agentic workers:** Use the supplied Word specification and the interfaces below. Implement independent query, UI, and transport tasks, then review their integration.

**Goal:** Display Current Running SKUs as a live Silver snapshot independent of dashboard date and shift selections.

**Architecture:** A dedicated GET endpoint executes the specification's query over seven schema-qualified Silver tables through the existing service's `athena` engine, like existing Gold queries. No Databricks or Bronze fallback is used. The Technical dashboard polls the snapshot independently of period-bound Production requests and filters only its machine/section view.

**Tech Stack:** Express, JavaScript, existing upstream service (AWS Athena SQL), React, MUI.

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

Query module exports `liveRunningSkusQuery()` and `LIVE_RUNNING_SKU_TABLES` (seven `silver.<name>` Athena identifiers). The route calls `runQuery(sql,{engine:"athena",tables:[]})`; Athena resolves sources from SQL, not Delta paths. Backend route uses a short live-only cache key, independent of all header filters. Cache version 2 isolates the Athena snapshot and failures from the previous engine's cached entries.

## Review focus

- Running/Idle/Unknown boundaries, late feed versus silent machine, and missing recipe.
- No duplicate physical machines from joins, winders, or cavities.
- Final source query uses the spec's true seven-day clock, not a sample date.
- Date/shift changes neither refetch nor hide the live card; Production loading/errors are isolated.
- Upstream failure is visible; no false zero or fabricated Running state.

## Tasks

- [x] Query and backend tests: translate the supplied Spark SQL to Athena, preserve logic/audit fields, and verify freshness boundaries and deduplication using semantic fixtures and real Athena execution.
- [x] Transport and endpoint: authenticated GET route, Athena-only engine selection, temporal-input-independent cache, and successful live execution. Missing sources/errors remain unavailable rather than producing partial counts.
- [x] Frontend: dedicated API/polling and `rsku` cards/drills for Mixing/Stock (including Bead)/Building/Curing. Live loading/errors are isolated from period requests, and date/shift changes preserve the live card and drill.
- [x] Review: 19 targeted backend tests pass; scoped frontend ESLint/Prettier and production build pass. Headless Chrome with mocked network verified both loading directions, Bead/Building/Curing scoping, distinct counts, temporal independence, Unknown SKU hiding and visible errors, with no uncaught browser exceptions. A separate real-Athena route request returned HTTP 200. Prior full-backend-suite failures are recorded in the availability report.
- [x] Gold handoff: canonical read-only SQL exporter, documented field mappings/07:00 shift rule, 5–15-minute refresh recommendation, atomic complete-snapshot replacement and validation/ownership contract.

## External follow-up (not deployed by this change)

- Confirm the target Gold schema, job owner and publication mechanism with the data/platform team before implementing a writer or switching the app to Gold.
- Monitor ingestion freshness: feeds were stale at the earlier 15:32 IST check and had recovered at the 19:07 IST route check.
- Deployment remains a separate user instruction; existing uncommitted user work is preserved.

## Historical findings (2026-10-21; superseded by the availability report above)

Athena's `silver` catalog registers only four SPC tables. The exact specification datasets exist as Delta paths and are readable via the upstream `databricks` engine. Verified `fct_o_production` and four dimensions. Direct Athena reads of Bronze fail on deletion vectors; do not use them as a workaround. Initial independent reads of `fct_tbmpcr` and `fct_curingpcr` returned Service Unavailable and require further verification.
