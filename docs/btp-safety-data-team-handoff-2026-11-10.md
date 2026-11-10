# BTP Safety Observations — data-team handoff

Verified against live Athena through the dashboard's upstream API on **10-Nov-2026**.

## Shareable summary

> The November 2026 Maintenance dashboard has no published Banmore Safety Observations data. The three exact KPI families are present in Gold, but their latest DAY/SHIFT dates are **10-Jun-2026**; the latest MONTH anchor is **01-Jun-2026**. There are **zero matching rows for November**. Please confirm whether Safety publication has stopped, the source has no new observations, or the data has moved; backfill later periods if observations exist. Do not publish fabricated zero counts to hide missing data.
>
> Separately, the upstream Athena response serializes SQL NULL as an empty string (`""`), including aggregate totals and absent LEFT JOIN page positions. The dashboard previously rejected this as `Invalid Safety overall_total`. We have added Safety-specific handling so these exact empty-string nulls remain missing data, not zero. Please preserve SQL NULL as JSON `null` at the upstream serialization layer, while keeping explicit zero as a numeric zero.

## Affected scope

- UI: Engineering → Maintenance → Safety Observations.
- Request: `GET /api/v1/engineering/safety?plant=Banmore&date=2026-11-01&granularity=MONTH&level=overall`.
- Source plant: `BANMORE`; dashboard predicate is `LOWER(TRIM(plant)) = 'banmore'` (case-insensitive match is working).
- Exact KPI names:
  - `Safety_Observation_Qty_overall`
  - `Safety_Observation_Qty_type`
  - `Safety_Observation_Qty_detail`
- No category or department filter is applied. No KPI rename or plant-code substitution is needed based on the observed rows.

## Evidence

| Source            | Grain            | Latest date for all three Safety names | Observation                                                              |
| ----------------- | ---------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `gold.gold`       | DAY, SHIFT A/B/C | 2026-06-10                             | Safety rows exist, but not for November                                  |
| `gold.gold`       | MONTH            | 2026-06-01                             | Stored monthly anchor, not a last-observation timestamp                  |
| `gold.gold_daily` | DAY, SHIFT A/B/C | 2026-06-10                             | Same latest Safety date; switching tables does not provide November data |

The daily table has no MONTH Safety rows; the application correctly reads stored MONTH snapshots from the base table.

### 1. Verify available coverage

```sql
SELECT
  plant,
  granularity,
  kpi_name,
  unit_of_measurement,
  COUNT(*) AS source_rows,
  SUM(actual_value) AS total,
  MIN(date) AS min_date,
  MAX(date) AS max_date
FROM gold.gold
WHERE LOWER(TRIM(plant)) = 'banmore'
  AND kpi_name IN (
    'Safety_Observation_Qty_overall',
    'Safety_Observation_Qty_type',
    'Safety_Observation_Qty_detail'
  )
GROUP BY plant, granularity, kpi_name, unit_of_measurement
ORDER BY granularity, kpi_name;
```

Repeat against `gold.gold_daily` to check its available DAY/SHIFT coverage. `COUNT(*)` here is a diagnostic row count only; the KPI continues to use `SUM(actual_value)`.

### 2. Reproduce the missing November scope

```sql
SELECT COUNT(*) AS source_rows, SUM(actual_value) AS total
FROM gold.gold
WHERE LOWER(TRIM(plant)) = 'banmore'
  AND kpi_name IN (
    'Safety_Observation_Qty_overall',
    'Safety_Observation_Qty_type',
    'Safety_Observation_Qty_detail'
  )
  AND date BETWEEN DATE '2026-11-01' AND DATE '2026-11-30';
```

Observed API response:

```json
[{ "source_rows": "0", "total": "" }]
```

The exact MONTH/01-Nov application query returned `""` for every nullable aggregate/page field, including `overall_total`, `types_total`, `reports_total`, `type_rows`, `invalid_rows`, `duplicate_ids`, and `position`. With no rows, SQL SUM is NULL, not a published zero.

### 3. Isolate the transport issue

```sql
SELECT
  CAST(NULL AS BIGINT) AS null_integer,
  CAST(NULL AS VARCHAR) AS null_text,
  CAST(0 AS BIGINT) AS zero_integer
FROM gold.gold
LIMIT 1;
```

Observed API response:

```json
[{ "null_integer": "", "null_text": "", "zero_integer": "0" }]
```

This demonstrates the serialization behavior independently of Safety rows. The dashboard's `runQuery` layer preserves these returned values; it does not create the empty strings.

The same behavior also affected valid historical scopes: June's totals were `"93.0"`, but optional `selected_type_total`/`selected_reports_total`, empty `duplicate_ids`, and absent overall-page `position` were `""`. The previous parser then failed on `Invalid Safety selected_type_total`.

## Dashboard changes made

- Remove the red page-level Safety error banner, as requested. Genuine errors remain represented by an unavailable card and details in the Safety drill; they are not converted to zero or hidden as valid data.
- Accept **exactly `""` or JSON null** for nullable Safety aggregate fields and empty LEFT JOIN page positions. Keep absent required keys, whitespace-only numeric strings, non-integers, negatives, missing required page positions, parity mismatches, and invalid source rows rejected.
- No global upstream parser change, date fallback, averaging, stale-period substitution, or relaxation of count/reconciliation rules.
- Verified live after the fix:
  - November MONTH: `value = null`, no type rows, no reports; normal no-published-data state.
  - June MONTH: overall/type/report SUM totals all **93**; 3 types; largest type has 79 reports, with a valid 25-row first page.
  - 10-Jun DAY: overall/type/report SUM totals all **9**; 2 types; largest type has 8 reports, all 8 returned.

## Requested data-team follow-up

1. Confirm why no Safety observations are published after 10-Jun-2026 despite later dates being selectable in the dashboard.
2. If observations exist, resume/backfill all three KPI families at the supported grains, preserving overall = sum of types = report totals for the same filters.
3. Preserve SQL NULL as JSON null in the Athena/API serialization layer, including aggregate queries and LEFT JOIN columns. Never replace missing counts with zero without an explicit published zero.
