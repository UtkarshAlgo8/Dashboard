# Live Running SKU — Gold job handoff

## Ownership and current app path

The app reads the seven Silver sources **through AWS Athena only**. `GET /api/v1/dashboard/live-running-skus` computes a snapshot, caches success for 60 seconds and failures for five minutes. The Technical dashboard polls every 60 seconds. No scheduled Gold writer or AWS deployment is added here.

**UI location:** `/banmore/technical` → Stock (Mixing, 4 Roll / Calendar, Extruder, 3 Roll, Cutter, Slitter, **Bead**), Building, and Curing → **Current Running SKUs**. The headline is the number of distinct nonblank SKUs among Running machines in the selected section/area, not the number of machines. Clicking opens the machine-wise roster, statuses, reasons and timestamps. Date and shift selections do not scope this KPI.

This handoff is for the data/platform team to publish the document's `live_running_sku` Gold KPI. It does not switch the app to reading Gold; that needs a separately agreed target schema and consumer mapping.

## 1. Canonical Athena SQL

From the repository root:

```bash
node backend/tools/live-running-sku-gold/export-query.js > /tmp/live-running-sku-snapshot.sql
```

Submit that SQL using the existing query service with `engine: "athena"`, or through the team's normal Athena workgroup. The exporter has no credentials, makes no requests and performs no writes. It imports `backend/src/queries/live-running-skus.js`, so the app and handoff use the same logic instead of separate copies.

Required Glue sources:

- `silver.fct_o_production`
- `silver.fct_tbmpcr`
- `silver.fct_curingpcr`
- `silver.dim_wcmaster`
- `silver.dim_recipemaster`
- `silver.dim_tblitemmaster`
- `silver.dim_bom`

All seven were readable on 2026-11-04. The first complete query returned 271 unique machine rows, all Unknown because the feeds exceeded the 90-minute threshold. A later real-Athena route check at 19:07 IST returned HTTP 200 with 272 machines (216 Running, 56 Idle), including 7 Bead machines; no non-Running machine exposed a live SKU. See [availability history](../../../docs/live-running-sku-athena-blockers.md).

## 2. Snapshot semantics — must not change

- One row per physical machine reported in the trailing **168 hours**; exclude future events. The roster is data-driven, not a fixed 242-machine list from the sample.
- Run with an IST clock. Confirm the source timestamp convention with ingestion owners: the supplied specification treats stored event-time values as IST wall-clock values. The canonical query preserves those recorded clock values and constructs an IST job clock.
- Latest production wins; preserve `record_id` or barcode tie-breaking from the query.
- Merge TRC/TRCNew winders and curing LH/RH cavities; keep Duplex winders separate. Preserve Stage-1/Stage-2 duplicate exclusions, NCM/Reset exclusions, descriptions and BOM revision rules.
- Compare each machine against the latest eligible event in **its source table**, not the job clock, to determine Running/Idle. Preserve the source-specific 15–240-minute windows.
- Source feed older than **90 minutes** or missing resolved SKU → **Unknown**. `live_sku` and `live_sku_description` must be NULL unless Running. Keep `last_sku` and the audit fields even when Idle/Unknown.
- Never fabricate Running status from mounted recipes or SAP delay notifications. This is inferred production freshness, not PLC run/stop state.
- Preserve the canonical SQL's windows, including `mbc = 90` minutes. The document's prose table also mentions MBC/HTBC 120; obtain plant confirmation before changing the supplied SQL's MBC rule.

## 3. Gold projection contract

The source document refers to a **14-fixed-field Gold format**, but does not enumerate a complete target DDL or provide the destination table. The following mappings are specified; the team must supply the remaining target fields, values and types. Do not invent department/category/level/unit values or append this dataset into the app's generic Gold table without agreement.

| Snapshot field | Documented Gold meaning |
| --- | --- |
| `section`, `sub_section` | `section`, `sub_section` |
| `machine_id` | `machine` |
| `live_sku` | `itemcode` — NULL unless Running |
| `live_sku_description` | `product_type` — NULL unless Running |
| `machine_status` | `status` |
| `last_updated` | `remarks` — IST `yyyy-MM-dd HH:mm:ss` |
| `minutes_since_update` | `actual_value` for `kpi_name = 'Live_SKU_Minutes_Since_Update'`; MAX, never SUM, when aggregating ages |
| Last production event | Gold date and shift, using the 07:00 production-day boundary |

For the date/shift derivation, use the snapshot's normalized `event_time` (not the job run time). This read-only projection illustrates only the documented mappings; `staged_live_running_sku_snapshot` is a **placeholder staging relation** produced by the canonical query, not an existing app table:

```sql
SELECT
  section,
  sub_section,
  machine_id AS machine,
  live_sku AS itemcode,
  live_sku_description AS product_type,
  machine_status AS status,
  last_updated AS remarks,
  'Live_SKU_Minutes_Since_Update' AS kpi_name,
  minutes_since_update AS actual_value,
  CAST(date_add('hour', -7, event_time) AS date) AS production_date,
  CASE
    WHEN hour(event_time) >= 7 AND hour(event_time) < 15 THEN 'Shift A'
    WHEN hour(event_time) >= 15 AND hour(event_time) < 23 THEN 'Shift B'
    ELSE 'Shift C'
  END AS production_shift
FROM staged_live_running_sku_snapshot;
```

Examples: 06:59 belongs to the previous production date / Shift C; 07:00 starts the current date / Shift A; 15:00 starts B; 23:00 starts C on the current production date.

**Keep the rich snapshot alongside the fixed-field Gold projection.** The fixed format alone cannot supply the app's full drill: retain `source_machine`, `status_reason`, `last_sku`, `last_sku_description`, `event_time`, `minutes_since_update`, `minutes_behind_feed`, `feed_last_event`, `run_window_min`, and `as_of`. All rows in a published generation must share the same `as_of`.

## 4. Refresh / atomic replacement contract

1. **Recommended cadence: every 5–15 minutes**, as requested by the document for a live tile. The existing hourly job is a baseline, not a truly live feed. More frequent Gold jobs cannot repair stale Silver ingestion.
2. Execute the canonical query once per generation in Athena; stage the complete dataset under a generation/run ID with its `as_of` and source watermarks.
3. Validate the staged generation before publication. No overlapping writers: serialize runs or reject an older generation trying to replace a newer one.
4. Publish by **atomic full-snapshot replacement** using the platform's supported transactional snapshot/pointer operation. Replace only this KPI's dataset, not unrelated Gold data. Do not append historical rows into the current relation or merge on `(machine, itemcode)`; SKU transitions and NULL SKUs must replace the old machine row.
5. Remove machines that leave the seven-day roster as part of replacement. A machine going Running → Idle/Unknown must lose its live SKU in the same published generation.
6. A source/query failure means **do not publish** a partial/empty fallback. Retain the last successful generation with its original timestamp, mark refresh health as failed, and alert. Consumers must reject stale generations rather than presenting an old Running SKU as current. A successful, validated zero-machine generation is different from a failed query; treat unexpected roster collapse as an operational anomaly for review.
7. Idempotent retries must not duplicate rows. Retain separate historical generations for audit only; the current view must expose exactly one complete generation.

The exact write mechanism (transactional table, snapshot pointer, partition/view switch), target location, retention, scheduler, IAM and ownership are **data-team decisions**, not deployed by this handoff. Do not use a destructive `DROP/CREATE` or an in-place delete-then-insert sequence that exposes an empty/partial snapshot.

## 5. Acceptance checks before publication

- Every expected source is readable with the job's production identity; nonempty facts join to the intended machine and recipe masters without unexplained loss or multiplication.
- No duplicate machine rows; section/machine uniqueness and cross-source identity collisions reviewed. A seven-day roster need not match the sample machine count.
- `machine_status` is Running/Idle/Unknown. Both live fields are NULL for non-Running rows. Running requires a resolved, nonblank SKU.
- Source lag >90 minutes gives Unknown; exactly 90 minutes remains eligible. Machine gap exactly at its configured window remains Running. Test missing recipes and mixed fresh/stale sources independently.
- TRC winders, Duplex winders, TBM exclusions, curing cavities/trenches and the description/BOM fallback behave as in the app's backend fixtures.
- Validate date/shift boundaries at 06:59/07:00/15:00/23:00 and future/seven-day exclusions.
- Prove Running → Idle → Unknown replacement does not retain a previous live SKU, and concurrent/failed jobs cannot publish mixed generations.
- Monitor source feed age, job duration/failures, published generation age, roster counts, Unknown counts and unresolved recipe/description counts.

A future Gold-backed app change must retain the current endpoint's full response fields and temporal-filter independence, preserve fail-closed behavior, and enforce generation freshness so an old Gold Running row is never shown as live. It is not sufficient to poll an hourly Gold snapshot every minute.
