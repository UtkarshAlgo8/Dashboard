# BTP Calibration Due — Athena source verification

## Provisioned and verified (2026-11-12)

The table is now readable through the dashboard's Athena connection. The live schema reports `plant_code` as BIGINT (not VARCHAR), so the query must filter with numeric `1300`. The guide's quoted `'1300'` causes `Cannot apply operator: bigint = varchar(4)` in Athena.

After correcting that filter, the actual query and strict result validation returned **48 distinct machines** as of **12-Nov-2026 IST**: **13 due this week, 3 overdue, 32 OK**. BTPMI001 remains included. All due dates, instrument counts, completeness checks and machine-name display cleanup passed validation.

The missing-table dependency is resolved. Previously deployed backends need the numeric-filter fix deployed; the frontend does not need changing. Later data updates will use the existing 60-second polling/cache path.

## Original live finding (2026-11-11)

A read-only probe through the dashboard's existing upstream transport (`engine: athena`, `tables: []`) returned:

```text
Query FAILED: TABLE_NOT_FOUND: ... Table 'awsdatacatalog.silver.fct_equipment_calibration' does not exist
```

The user approved retaining Athena and implementing an explicit unavailable state until provisioning. No credentials, transport defaults, Gold queries, or other KPIs were changed.

## Required source contract

The guide's `` `jk-infiniti-datalake`.silver.fct_equipment_calibration `` is exposed as `silver.fct_equipment_calibration` in the Athena catalog used by the dashboard, with read access confirmed.

Required columns:

| Column | Contract |
| --- | --- |
| `plant_code` | BIGINT; BTP is exactly numeric `1300` |
| `machine_no` | Nonempty, one row per machine within the plant |
| `machine_name` | Display name; extra double quotes are stripped in the dashboard |
| `total_instrument_code` | Castable to INTEGER; interpreted as instrument count per the guide |
| `calibration_due_date` | Non-null and castable to DATE |

Read-only verification query:

```sql
SELECT machine_no, machine_name,
       CAST(total_instrument_code AS INTEGER) AS instruments,
       CAST(calibration_due_date AS DATE) AS due_date,
       date_diff('day', CAST(current_timestamp AT TIME ZONE 'Asia/Kolkata' AS DATE),
                 CAST(calibration_due_date AS DATE)) AS days_left
FROM silver.fct_equipment_calibration
WHERE plant_code = 1300
ORDER BY due_date;
```

Confirm that `BTPMI001`, due in 2023, is still a real overdue machine rather than an obsolete record. The user explicitly approved keeping it included until confirmed; no date cutoff or special exclusion is applied.

After deploying the numeric-filter correction, verify the running deployment via `GET /api/v1/engineering/calibration`. The dashboard uses today in IST, not the selected historical date or shift. Machine status boundaries are `< 0`, `0–7`, and `> 7`; KPI counts are machines, not instruments.
